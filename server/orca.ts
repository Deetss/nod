import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LOCAL_HOST } from '../shared/orca-hosts';
import { repoName } from '../shared/repo-name';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { dispatchArgs, launchArgs, parseCreated, type DispatchBody, type DispatchResult } from './orca-dispatch';
import { OrcaFake } from './orca-fake';

const DETECT_TTL_MS = 60_000;
const REPO_TTL_MS = 10 * 60_000;
const SPAWN_TIMEOUT_MS = 60_000;
const ERROR_MAX = 300;
const RAW_ERROR_MAX = 4000;

export interface OrcaStatus {
  available: boolean;
  agents: string[];
}

/** Runs a binary with an argument array and no shell. Resolves stdout. */
export type OrcaExec = (bin: string, args: string[], timeoutMs: number) => Promise<string>;

export const execBinary: OrcaExec = (bin, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const text = (stderr || stdout || err.message).trim().slice(0, RAW_ERROR_MAX);
        return reject(Object.assign(new Error(text), { timedOut: err.killed === true }));
      }
      resolve(stdout);
    });
  });

/** The CLI is not installed or Orca is not running. */
export class OrcaUnavailable extends Error {
  constructor() {
    super('Orca is not available');
  }
}

/** True when `execBinary` killed the command at its timeout, so the outcome is unknown. */
export const timedOut = (e: unknown): boolean => (e as { timedOut?: boolean } | undefined)?.timedOut === true;

/** The argument array for one host. `local` is this hub's own Orca and takes no flag. */
export const hostArgs = (args: readonly string[], host: string): string[] =>
  host === LOCAL_HOST ? [...args] : [...args, '--environment', host];

/**
 * A short failure message from CLI output. The CLI reports failures as JSON
 * (`{ error: { message } }`) or plain text; git's `fatal:` line is the useful
 * part when present, else the first two lines.
 */
export function cliErrorMessage(raw: string): string {
  let text = raw;
  try {
    const m = (JSON.parse(raw) as { error?: { message?: unknown } }).error?.message;
    if (typeof m === 'string') text = m;
  } catch {
    // Plain text.
  }
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const fatal = lines.find((l) => /^(fatal|error):/i.test(l));
  const picked = fatal ?? lines.slice(0, 2).join(' ');
  return picked.slice(0, ERROR_MAX) || 'Unknown error';
}

/**
 * The repo name from a GitHub origin URL (ssh or https), or undefined when the
 * remote is not in one of the given orgs. With no orgs any owner matches, so a personal
 * setup maps its own repos. Compared case-insensitively.
 */
export function repoFromRemote(url: string, orgs: readonly string[] = DEFAULT_SETTINGS.orgs): string | undefined {
  const alt = orgs.length ? orgs.map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : '[A-Za-z0-9-]+';
  const m = new RegExp(`github\\.com[:/](?:${alt})/([A-Za-z0-9._-]+?)(?:\\.git)?/?$`, 'i').exec(url.trim());
  return m?.[1]?.toLowerCase();
}

interface RepoEntry {
  id?: unknown;
  path?: unknown;
  gitRemoteIdentity?: { remoteUrl?: unknown };
}

export interface OrcaOptions {
  exec?: OrcaExec;
  /** Candidate binary locations, checked in order. */
  candidates?: string[];
  now?: () => number;
  /** Fixture mode never spawns; `log` receives the argument array instead. */
  fixtures?: boolean;
  log?: (line: string) => void;
  /** Supplies the org and the agent list. */
  settings?: Settings;
  /** Fixture mode answers `cli` calls from this in-memory stand-in. */
  fake?: OrcaFake;
}

/** Finds the `orca-ide` binary, maps issue repos to Orca repos per host, and starts worktrees. */
export class Orca {
  private readonly exec: OrcaExec;
  private readonly candidates: string[];
  private readonly now: () => number;
  private readonly fixtures: boolean;
  private readonly settings: Settings;
  private readonly log: (line: string) => void;
  /** Present in fixture mode only. */
  readonly fake: OrcaFake | undefined;
  private bin: string | undefined;
  private detecting: Promise<string | undefined> | undefined;
  private checkedAt = -Infinity;
  private readonly repos = new Map<string, { map: Map<string, string>; at: number }>();

  constructor(opts: OrcaOptions = {}) {
    this.exec = opts.exec ?? execBinary;
    this.candidates = opts.candidates ?? [join(homedir(), '.local', 'bin', 'orca-ide'), 'orca-ide'];
    this.now = opts.now ?? Date.now;
    this.fixtures = opts.fixtures ?? false;
    this.settings = opts.settings ?? DEFAULT_SETTINGS;
    this.log = opts.log ?? ((line) => console.log(line));
    this.fake = this.fixtures ? (opts.fake ?? new OrcaFake()) : undefined;
  }

  /**
   * Runs one `orca-ide` command on one host with an argument array. Every Orca call goes through
   * here. Fixture mode answers from memory and never spawns. Throws `OrcaUnavailable` when the CLI
   * is missing; other failures carry the CLI's own text.
   */
  async cli(args: string[], timeoutMs: number, host: string): Promise<string> {
    const full = hostArgs(args, host);
    if (this.fake) return this.fake.run(full);
    const bin = await this.resolve();
    if (!bin) throw new OrcaUnavailable();
    return this.exec(bin, full, timeoutMs);
  }

  /** Maps a host's Orca repo id to a lower-case GitHub repo name. Fixture ids carry the name after `fixture-`. */
  async repoNameOf(host: string): Promise<(repoId: string) => string | undefined> {
    if (this.fake) return (id) => (id.startsWith('fixture-') ? id.slice('fixture-'.length) : undefined);
    const byName = (await this.repoMap(host)) ?? new Map<string, string>();
    const byId = new Map([...byName].map(([name, id]) => [id, name]));
    return (id) => byId.get(id);
  }

  /** Detection runs at most once a minute. Electron launched from a launcher may have a short PATH. */
  async status(): Promise<OrcaStatus> {
    const agents = [...this.settings.orcaAgents];
    if (this.fixtures) return { available: true, agents };
    const bin = await this.resolve();
    return { available: bin !== undefined, agents: bin ? agents : [] };
  }

  /** A host's Orca repo id for a GitHub repo (`owner/name`, matched on its name), or undefined when that host does not know it. */
  async repoId(repo: string, host: string): Promise<string | undefined> {
    const name = repoName(repo).toLowerCase();
    if (this.fixtures) return `fixture-${name}`;
    return (await this.repoMap(host))?.get(name);
  }

  /** Lower-case names of the GitHub repos the hub's own Orca has; undefined in fixture mode, where every repo maps. */
  async mappedRepos(): Promise<string[] | undefined> {
    if (this.fixtures) return undefined;
    return [...((await this.repoMap(LOCAL_HOST))?.keys() ?? [])];
  }

  private async repoMap(host: string): Promise<Map<string, string> | undefined> {
    const bin = await this.resolve();
    if (!bin) return undefined;
    const cached = this.repos.get(host);
    if (cached && this.now() - cached.at <= REPO_TTL_MS) return cached.map;
    // A failed list keeps the last good map and is retried on the next call, not cached as empty.
    const fresh = await this.mapRepos(host);
    if (fresh) this.repos.set(host, { map: fresh, at: this.now() });
    return fresh ?? cached?.map;
  }

  async dispatch(b: DispatchBody, host: string): Promise<DispatchResult> {
    const id = await this.repoId(b.repo, host);
    if (!id) return { ok: false, message: host === LOCAL_HOST ? 'Repo not in Orca' : `Repo not in Orca on ${host}` };
    const args = dispatchArgs(id, b);
    if (this.fixtures) {
      this.log(`[fixture] orca-ide ${JSON.stringify(hostArgs(args, host))}`);
      return { ok: true, worktree: b.name };
    }
    try {
      const out = await this.cli(args, SPAWN_TIMEOUT_MS, host);
      return { ok: true, ...parseCreated(out, b.name) };
    } catch (e) {
      if (e instanceof OrcaUnavailable) return { ok: false, message: e.message };
      const message = cliErrorMessage(e instanceof Error ? e.message : '');
      this.log(`[orca] dispatch failed: ${message}`);
      return { ok: false, message: `Dispatch failed: ${message}` };
    }
  }

  /** Starts an agent in an existing worktree on `host`. `name` is the worktree's name for the result. */
  async launch(b: DispatchBody, host: string, worktreeId: string, name: string): Promise<DispatchResult> {
    const args = launchArgs(worktreeId, b);
    if (this.fixtures) {
      this.log(`[fixture] orca-ide ${JSON.stringify(hostArgs(args, host))}`);
      return { ok: true, worktree: name, worktreeId };
    }
    try {
      await this.cli(args, SPAWN_TIMEOUT_MS, host);
      return { ok: true, worktree: name, worktreeId };
    } catch (e) {
      if (e instanceof OrcaUnavailable) return { ok: false, message: e.message };
      const message = cliErrorMessage(e instanceof Error ? e.message : '');
      this.log(`[orca] launch failed: ${message}`);
      return { ok: false, message: `Dispatch failed: ${message}` };
    }
  }

  private async resolve(): Promise<string | undefined> {
    // Callers that arrive while a detection runs wait for it instead of reading an unset binary.
    if (this.detecting) return this.detecting;
    if (this.now() - this.checkedAt < DETECT_TTL_MS) return this.bin;
    this.checkedAt = this.now();
    this.detecting = this.detect()
      .then((bin) => {
        this.bin = bin;
        return bin;
      })
      .finally(() => {
        this.detecting = undefined;
      });
    return this.detecting;
  }

  private async detect(): Promise<string | undefined> {
    for (const c of this.candidates) {
      if (c.includes('/')) {
        try {
          await access(c, constants.X_OK);
          return c;
        } catch {
          continue;
        }
      }
      try {
        await this.exec(c, ['--help'], 10_000);
        return c;
      } catch {
        continue;
      }
    }
    return undefined;
  }

  /**
   * Undefined when `orca-ide repo list` fails. Orca reports each repo's remote; for a local repo
   * without one the origin is read with git. A remote host's paths are not on this disk.
   */
  private async mapRepos(host: string): Promise<Map<string, string> | undefined> {
    const map = new Map<string, string>();
    let list: RepoEntry[] = [];
    try {
      const parsed = JSON.parse(await this.cli(['repo', 'list', '--json'], 20_000, host)) as {
        result?: { repos?: RepoEntry[] };
      };
      list = parsed.result?.repos ?? [];
    } catch (e) {
      this.log(`[orca] repo list failed${host === LOCAL_HOST ? '' : ` on ${host}`}: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
      return undefined;
    }
    for (const r of list) {
      if (typeof r.id !== 'string') continue;
      const url = await this.remoteOf(r, host);
      const name = url ? repoFromRemote(url, this.settings.orgs) : undefined;
      if (name && !map.has(name)) map.set(name, r.id);
    }
    return map;
  }

  private async remoteOf(r: RepoEntry, host: string): Promise<string | undefined> {
    const reported = r.gitRemoteIdentity?.remoteUrl;
    if (typeof reported === 'string') return reported;
    if (host !== LOCAL_HOST || typeof r.path !== 'string') return undefined;
    try {
      return await this.exec('git', ['-C', r.path, 'remote', 'get-url', 'origin'], 10_000);
    } catch {
      return undefined;
    }
  }
}
