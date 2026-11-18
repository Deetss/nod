import { hostName, LOCAL_HOST, type HostStatus } from '../shared/orca-hosts';
import { hostFor, type OrcaPrefs } from '../shared/orca-prefs';
import type { Orca } from './orca';

/** The host list is reused this long, the same as the session cache. */
export const HOSTS_TTL_MS = 20_000;
/** A remote host is online when `worktree ps` answers within this. CLI startup alone takes about 3 s. */
export const HOST_PROBE_MS = 6_000;
const LIST_TIMEOUT_MS = 5_000;

type Obj = Record<string, unknown>;

/**
 * Host names from `environment list --json`. Each entry is named by `name`, else by `id`, whichever
 * is a safe CLI value. `local` is skipped because it always means the hub's own Orca.
 */
export function parseEnvironments(json: string): string[] {
  const envs = (JSON.parse(json) as { result?: { environments?: unknown } } | null)?.result?.environments;
  if (!Array.isArray(envs)) return [];
  const out: string[] = [];
  for (const e of envs) {
    const o: Obj = typeof e === 'object' && e !== null ? (e as Obj) : {};
    const name = [o.name, o.id].find((v): v is string => typeof v === 'string' && hostName.safeParse(v).success);
    if (name && name !== LOCAL_HOST && !out.includes(name)) out.push(name);
  }
  return out;
}

/** The hub's own Orca plus every paired Orca host, and when each was last seen online. */
export class OrcaHosts {
  private names: readonly string[] = [LOCAL_HOST];
  private namesAt = -Infinity;
  private reading: Promise<readonly string[]> | undefined;
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly orca: Orca,
    private readonly now: () => number = Date.now,
  ) {}

  /** `local` first, then each paired environment. A failed read keeps the last good list. */
  async list(): Promise<readonly string[]> {
    if (this.now() - this.namesAt < HOSTS_TTL_MS) return this.names;
    this.reading ??= this.read().finally(() => {
      this.reading = undefined;
    });
    return this.reading;
  }

  /** Records one read of a host and returns its status. */
  status(name: string, online: boolean, at: number): HostStatus {
    if (online) this.seen.set(name, at);
    return { name, online, lastSeen: this.seen.get(name) ?? null };
  }

  private async read(): Promise<readonly string[]> {
    try {
      const out = await this.orca.cli(['environment', 'list', '--json'], LIST_TIMEOUT_MS, LOCAL_HOST);
      this.names = [LOCAL_HOST, ...parseEnvironments(out)];
    } catch {
      // No CLI, or an old one without environments: the hub's own Orca only.
    }
    this.namesAt = this.now();
    return this.names;
  }
}

export type HostPick = { ok: true; host: string } | { ok: false; status: 400 | 503; error: string };

/**
 * The host a write acts on: the one asked for, else the repo's preferred host, the default host,
 * then `local`. It must be in the live list and online, so nothing reaches an unknown or offline host.
 */
export function pickHost(
  requested: string | undefined,
  hosts: readonly HostStatus[],
  prefs: Pick<OrcaPrefs, 'defaultHost' | 'hosts'>,
  repo?: string,
): HostPick {
  const name = requested ?? hostFor(prefs, repo);
  const host = hosts.find((h) => h.name === name);
  if (!host) return { ok: false, status: 400, error: `Unknown Orca host: ${name}` };
  if (!host.online) return { ok: false, status: 503, error: `Orca host ${name} is offline` };
  return { ok: true, host: name };
}
