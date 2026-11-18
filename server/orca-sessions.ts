import { oneLine } from '../shared/orca-message';
import { mapSessionState, type LinkedItem, type SessionCandidate } from '../shared/orca-sessions';
import { LOCAL_HOST, type HostStatus } from '../shared/orca-hosts';
import { OrcaUnavailable, type Orca } from './orca';
import { HOST_PROBE_MS, HOSTS_TTL_MS, OrcaHosts } from './orca-hosts';

/** One `worktree ps` plus one `terminal list` per host serves every row for this long. */
export const SESSIONS_TTL_MS = HOSTS_TTL_MS;
/** After a failed read the next try comes sooner, so a started Orca shows up quickly. */
const FAILURE_TTL_MS = 5_000;
const LIST_TIMEOUT_MS = 15_000;
const ROW_LIMIT = '500';
const NAME_MAX = 80;

export interface TerminalInfo {
  handle: string;
  writable: boolean;
}

export interface SessionSnapshot {
  available: boolean;
  /** ms when the read finished. */
  at: number;
  sessions: SessionCandidate[];
  /** Terminal handle and writable flag by `sessionKey`. A session without a terminal cannot be sent to. */
  terminals: Map<string, TerminalInfo>;
  /** Every host read for this snapshot. Offline hosts add no sessions. */
  hosts: HostStatus[];
}

/** Session ids are unique on one host only, and a terminal handle belongs to the host that issued it. */
export const sessionKey = (host: string, id: string): string => `${host}\n${id}`;

const EMPTY = (at: number, available = false): SessionSnapshot => ({ available, at, sessions: [], terminals: new Map(), hosts: [] });

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

const URL_REPO = /github\.com\/[^/]+\/([^/]+)\/(?:pull|issues)\/\d+/i;
const repoFromUrl = (url: unknown): string | undefined => URL_REPO.exec(typeof url === 'string' ? url : '')?.[1]?.toLowerCase();

/** A link is a bare number, an object with `number`, or a `linkedItems` entry. Only number and repo are read. */
function linkOf(v: unknown): LinkedItem | undefined {
  const n = num(v);
  if (n !== undefined) return { number: n };
  const o = obj(v);
  const number = num(o?.number);
  if (!o || number === undefined) return undefined;
  const ctx = obj(obj(o.taskSourceContext)?.providerIdentity);
  const repo = repoFromUrl(o.url) ?? str(ctx?.repo)?.toLowerCase();
  return { number, ...(repo ? { repo } : {}) };
}

function linksOf(w: Obj, key: 'linkedPR' | 'linkedIssue', type: 'pr' | 'issue'): LinkedItem[] {
  const out: LinkedItem[] = [];
  const direct = linkOf(w[key]);
  if (direct) out.push(direct);
  const items = Array.isArray(w.linkedItems) ? w.linkedItems : [];
  for (const it of items) {
    const o = obj(it);
    if (!o || o.type !== type || (o.provider !== undefined && o.provider !== 'github')) continue;
    const l = linkOf(o);
    if (l && !out.some((x) => x.number === l.number)) out.push(l);
  }
  return out;
}

const basename = (p: string): string => p.replace(/\/+$/, '').split('/').pop() ?? p;

/**
 * Reduces `worktree ps` and `terminal list` output to live agent sessions. It reads state, agent
 * rows' pane key and live flag, names, branch and link numbers. It never reads prompts, assistant
 * text, tool input or terminal previews.
 */
export function parseSessions(
  psJson: string,
  listJson: string,
  repoNameOf: (repoId: string) => string | undefined,
  at: number,
  host: string = LOCAL_HOST,
): SessionSnapshot {
  const worktrees = obj(JSON.parse(psJson) as unknown)?.result;
  const terminalRows = obj(JSON.parse(listJson) as unknown)?.result;
  const rows = Array.isArray(obj(worktrees)?.worktrees) ? (obj(worktrees)?.worktrees as unknown[]) : [];
  const terms = Array.isArray(obj(terminalRows)?.terminals) ? (obj(terminalRows)?.terminals as unknown[]) : [];

  const byPane = new Map<string, TerminalInfo & { lastOutputAt?: number }>();
  for (const t of terms) {
    const o = obj(t);
    const handle = str(o?.handle);
    const tab = str(o?.tabId);
    const leaf = str(o?.leafId);
    if (!o || !handle || !tab || !leaf) continue;
    const lastOutputAt = num(o.lastOutputAt);
    byPane.set(`${tab}:${leaf}`, {
      handle,
      writable: o.writable !== false && o.connected !== false,
      ...(lastOutputAt ? { lastOutputAt } : {}),
    });
  }

  const sessions: SessionCandidate[] = [];
  const terminals = new Map<string, TerminalInfo>();
  for (const r of rows) {
    const w = obj(r);
    const worktreeId = str(w?.worktreeId) ?? str(w?.id);
    if (!w || !worktreeId) continue;
    const agents = Array.isArray(w.agents) ? w.agents : [];
    const repoId = str(w.repoId);
    const repo = repoId ? repoNameOf(repoId) : undefined;
    const branch = (str(w.branch) ?? '').replace(/^refs\/heads\//, '');
    const name = oneLine(str(w.displayName) ?? basename(str(w.path) ?? '') ?? branch).slice(0, NAME_MAX) || branch || 'session';
    for (const a of agents) {
      const agent = obj(a);
      const paneKey = str(agent?.paneKey);
      if (!agent || !paneKey) continue;
      const id = `${worktreeId}|${paneKey}`;
      const term = byPane.get(paneKey);
      const lastOutputAt = term?.lastOutputAt ?? num(w.lastOutputAt);
      sessions.push({
        id,
        host,
        worktreeId,
        name,
        state: mapSessionState(agent.state),
        ...(repo ? { repo } : {}),
        branch,
        linkedPrs: linksOf(w, 'linkedPR', 'pr'),
        linkedIssues: linksOf(w, 'linkedIssue', 'issue'),
        live: agent.hasLivePty === true,
        ...(lastOutputAt ? { lastOutputAt } : {}),
      });
      if (term) terminals.set(sessionKey(host, id), { handle: term.handle, writable: term.writable });
    }
  }
  return { available: true, at, sessions, terminals, hosts: [] };
}

/**
 * Reads sessions from every Orca host and merges them. One read costs two CLI calls per host (about
 * 0.4 s each, in parallel), shared by every caller: concurrent callers wait on the same run, and a
 * stale snapshot is served while one refresh runs.
 */
export class OrcaSessions {
  readonly hosts: OrcaHosts;
  private snap: SessionSnapshot | undefined;
  private inflight: Promise<SessionSnapshot> | undefined;
  private lastReads = 0;

  constructor(
    private readonly orca: Orca,
    private readonly now: () => number = Date.now,
  ) {
    this.hosts = new OrcaHosts(orca, now);
  }

  /** Number of reads that reached the CLI. For tests. */
  get reads(): number {
    return this.lastReads;
  }

  async snapshot(): Promise<SessionSnapshot> {
    const s = this.snap;
    if (s && this.now() - s.at < (s.available ? SESSIONS_TTL_MS : FAILURE_TTL_MS)) return s;
    const run = this.refresh();
    return s ?? run;
  }

  /**
   * Always reads. Used at send time, so a handle is never taken from the cache. With a host, reads
   * that host only and leaves the shared snapshot alone.
   */
  async fresh(host?: string): Promise<SessionSnapshot> {
    if (host === undefined) return this.refresh();
    const one = await this.readHost(host);
    return { ...(one.snap ?? EMPTY(this.now())), hosts: [this.hosts.status(host, one.snap !== undefined, this.now())] };
  }

  private refresh(): Promise<SessionSnapshot> {
    this.inflight ??= this.read().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async read(): Promise<SessionSnapshot> {
    this.lastReads += 1;
    const names = await this.hosts.list();
    const reads = await Promise.all(names.map(async (host) => ({ host, ...(await this.readHost(host)) })));
    const at = this.now();
    const next: SessionSnapshot = { ...EMPTY(at), hosts: reads.map((r) => this.hosts.status(r.host, r.snap !== undefined, at)) };
    for (const r of reads) {
      if (!r.snap) continue;
      next.available = true;
      next.sessions.push(...r.snap.sessions);
      for (const [key, term] of r.snap.terminals) next.terminals.set(key, term);
    }
    this.snap = next;
    return next;
  }

  /** One host's sessions, or no snapshot when it did not answer in time. The hub's own Orca gets the longer limit. */
  private async readHost(host: string): Promise<{ snap?: SessionSnapshot }> {
    const timeout = host === LOCAL_HOST ? LIST_TIMEOUT_MS : HOST_PROBE_MS;
    try {
      const [ps, list, repoNameOf] = await Promise.all([
        this.orca.cli(['worktree', 'ps', '--limit', ROW_LIMIT, '--json'], timeout, host),
        this.orca.cli(['terminal', 'list', '--limit', ROW_LIMIT, '--json'], timeout, host),
        this.orca.repoNameOf(host),
      ]);
      return { snap: parseSessions(ps, list, repoNameOf, this.now(), host) };
    } catch (e) {
      if (host === LOCAL_HOST && !(e instanceof OrcaUnavailable)) {
        console.error('[orca] session read failed:', e instanceof Error ? e.message.slice(0, 200) : 'error');
      }
      return {};
    }
  }
}
