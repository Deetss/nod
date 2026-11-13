import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { effortLevel, modelId } from '../shared/agent-models';
import { repoName } from '../shared/repo-name';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { OrcaFake } from './orca-fake';
import { REPO_RE } from './provider';


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

/** The dispatch request schema; `agents` is the allowed agent ids. Orca rejects ids it does not know. */
export const dispatchBodyFor = (agents: readonly string[]) => z.object({
  repo: z.string().regex(REPO_RE),
  number: z.number().int().positive(),
  agent: z.string().refine((a) => agents.includes(a), 'Unknown agent'),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),
  baseBranch: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/)
    .refine((v) => !v.includes('..') && !v.endsWith('/'), 'Invalid branch name')
    .optional(),
  // A leading dash could be read as a CLI flag.
  prompt: z.string().min(1).max(12000).refine((v) => !v.trimStart().startsWith('-'), 'Prompt must not start with a dash'),
  /** PR mode: `number` is a PR and `baseBranch` is its head ref. */
  pr: z.boolean().optional(),
  /** `''` is the harness default. Absent (a phone dispatch) means the model last chosen for the agent. */
  model: z.union([z.literal(''), modelId]).optional(),
  effort: effortLevel.optional(),
})
  .refine((b) => !b.pr || b.baseBranch !== undefined, { message: 'PR mode needs the head branch', path: ['baseBranch'] })
  .refine((b) => !b.effort || !!b.model, { message: 'Effort needs a model', path: ['effort'] });

/** The schema with the default agent list. */
export const dispatchBody = dispatchBodyFor(DEFAULT_SETTINGS.orcaAgents);
export type DispatchBody = z.infer<typeof dispatchBody>;

export type DispatchResult = { ok: true; worktree: string; path?: string } | { ok: false; message: string };

const WRAP_UP_MARK = '## When you finish (Nod)';

/**
 * Closes every dispatched prompt, so a finished session files itself instead of lingering in
 * Orca's sidebar. Only a session with a real question stays unread.
 */
export const WRAP_UP = [
  WRAP_UP_MARK,
  'Leave this workspace tidy so it does not wait on the user for nothing.',
  '- If nothing needs the user: save a session log and compact if your harness can (Claude Code: /compress), then run',
  '  `orca-ide worktree set --worktree current --workspace-status <status> --read --comment "<one-line outcome>"`',
  '  with status `in-review` when a PR now waits for review, otherwise `completed`. Then stop.',
  '- If something needs the user: run `orca-ide worktree set --worktree current --unread --comment "<the decision or blocker>"`,',
  '  end your reply with that one question, and wait.',
  '- Never remove the worktree or close terminals. The user does that.',
].join('\n');

/** The prompt with the wrap-up appended once. A prompt that already carries it, as on a retry, is left alone. */
export const withWrapUp = (prompt: string): string =>
  prompt.includes(WRAP_UP_MARK) ? prompt : `${prompt.trimEnd()}\n\n${WRAP_UP}`;

/** `--model` and `--effort`, or nothing for the harness default. Orca rejects `--effort` without `--model`. */
function modelArgs(b: DispatchBody): string[] {
  if (!b.model) return [];
  return ['--model', b.model, ...(b.effort ? ['--effort', b.effort] : [])];
}

/** `orca-ide worktree create` arguments. Every value is its own array entry. The prompt gets the wrap-up. */
export function dispatchArgs(repoId: string, b: DispatchBody): string[] {
  // PR mode starts on the PR head; `--issue` is never passed with `--pr`. The
  // head ref usually exists only on the remote, and git cannot base a worktree
  // on a bare remote-only name, so the base is `origin/<headRef>`.
  if (b.pr) {
    return [
      'worktree',
      'create',
      '--repo',
      `id:${repoId}`,
      '--name',
      b.name,
      '--pr',
      String(b.number),
      '--base-branch',
      `origin/${b.baseBranch ?? ''}`,
      '--agent',
      b.agent,
      '--prompt',
      withWrapUp(b.prompt),
      ...modelArgs(b),
      '--no-parent',
      '--json',
    ];
  }
  const args = [
    'worktree',
    'create',
    '--repo',
    `id:${repoId}`,
    '--name',
    b.name,
    '--issue',
    String(b.number),
    '--agent',
    b.agent,
    '--prompt',
    withWrapUp(b.prompt),
    ...modelArgs(b),
  ];
  if (b.baseBranch) args.push('--base-branch', b.baseBranch);
  args.push('--no-parent', '--json');
  return args;
}

/** Pulls the worktree name and path out of the CLI's JSON; falls back to the requested name. */
export function parseCreated(stdout: string, fallback: string): { worktree: string; path?: string } {
  try {
    const parsed = JSON.parse(stdout) as { result?: unknown };
    const result = (parsed.result ?? parsed) as Record<string, unknown>;
    const wt = (typeof result.worktree === 'object' && result.worktree !== null ? result.worktree : result) as Record<
      string,
      unknown
    >;
    const worktree = [wt.displayName, wt.name, wt.branch].find((v): v is string => typeof v === 'string' && v !== '');
    const path = typeof wt.path === 'string' ? wt.path : undefined;
    return { worktree: worktree ?? fallback, ...(path ? { path } : {}) };
  } catch {
    return { worktree: fallback };
  }
}

interface RepoEntry {
  id: string;
  path: string;
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

/** Finds the `orca-ide` binary, maps issue repos to Orca repos, and starts worktrees. */
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
  private repos: Map<string, string> | undefined;
  private reposAt = -Infinity;

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
   * Runs one `orca-ide` command with an argument array. Fixture mode answers from memory and never
   * spawns. Throws `OrcaUnavailable` when the CLI is missing; other failures carry the CLI's own text.
   */
  async cli(args: string[], timeoutMs: number): Promise<string> {
    if (this.fake) return this.fake.run(args);
    const bin = await this.resolve();
    if (!bin) throw new OrcaUnavailable();
    return this.exec(bin, args, timeoutMs);
  }

  /** Maps an Orca repo id to a lower-case GitHub repo name. Fixture ids carry the name after `fixture-`. */
  async repoNameOf(): Promise<(repoId: string) => string | undefined> {
    if (this.fake) return (id) => (id.startsWith('fixture-') ? id.slice('fixture-'.length) : undefined);
    const byName = (await this.repoMap()) ?? new Map<string, string>();
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

  /** Orca repo id for a GitHub repo (`owner/name`, matched on its name), or undefined when Orca does not know it. */
  async repoId(repo: string): Promise<string | undefined> {
    const name = repoName(repo).toLowerCase();
    if (this.fixtures) return `fixture-${name}`;
    return (await this.repoMap())?.get(name);
  }

  /** Lower-case names of the GitHub repos Orca has; undefined in fixture mode, where every repo maps. */
  async mappedRepos(): Promise<string[] | undefined> {
    if (this.fixtures) return undefined;
    return [...((await this.repoMap())?.keys() ?? [])];
  }

  private async repoMap(): Promise<Map<string, string> | undefined> {
    const bin = await this.resolve();
    if (!bin) return undefined;
    if (!this.repos || this.now() - this.reposAt > REPO_TTL_MS) {
      this.repos = await this.mapRepos(bin);
      this.reposAt = this.now();
    }
    return this.repos;
  }

  async dispatch(b: DispatchBody): Promise<DispatchResult> {
    const id = await this.repoId(b.repo);
    if (!id) return { ok: false, message: 'Repo not in Orca' };
    const args = dispatchArgs(id, b);
    if (this.fixtures) {
      this.log(`[fixture] orca-ide ${JSON.stringify(args)}`);
      return { ok: true, worktree: b.name };
    }
    const bin = await this.resolve();
    if (!bin) return { ok: false, message: 'Orca is not available' };
    try {
      const out = await this.exec(bin, args, SPAWN_TIMEOUT_MS);
      return { ok: true, ...parseCreated(out, b.name) };
    } catch (e) {
      const message = cliErrorMessage(e instanceof Error ? e.message : '');
      this.log(`[orca] dispatch failed: ${message}`);
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

  private async mapRepos(bin: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    let list: RepoEntry[] = [];
    try {
      const parsed = JSON.parse(await this.exec(bin, ['repo', 'list', '--json'], 20_000)) as {
        result?: { repos?: RepoEntry[] };
      };
      list = parsed.result?.repos ?? [];
    } catch {
      return map;
    }
    for (const r of list) {
      if (typeof r.id !== 'string' || typeof r.path !== 'string') continue;
      try {
        const url = await this.exec('git', ['-C', r.path, 'remote', 'get-url', 'origin'], 10_000);
        const name = repoFromRemote(url, this.settings.orgs);
        if (name && !map.has(name)) map.set(name, r.id);
      } catch {
        continue;
      }
    }
    return map;
  }
}
