import { oneLine } from '../shared/orca-message';
import { mapSessionState, type LinkedItem, type SessionCandidate } from '../shared/orca-sessions';
import { OrcaUnavailable, type Orca } from './orca';

/** One `worktree ps` plus one `terminal list` serves every row for this long. */
export const SESSIONS_TTL_MS = 20_000;
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
  /** Terminal handle and writable flag by session id. A session without a terminal cannot be sent to. */
  terminals: Map<string, TerminalInfo>;
}

const EMPTY = (at: number, available = false): SessionSnapshot => ({ available, at, sessions: [], terminals: new Map() });

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
      if (term) terminals.set(id, { handle: term.handle, writable: term.writable });
    }
  }
  return { available: true, at, sessions, terminals };
}

/**
 * Reads sessions from Orca. One read costs two CLI calls (about 0.4 s), shared by every caller:
 * concurrent callers wait on the same run, and a stale snapshot is served while one refresh runs.
 */
export class OrcaSessions {
  private snap: SessionSnapshot | undefined;
  private inflight: Promise<SessionSnapshot> | undefined;
  private lastReads = 0;

  constructor(
    private readonly orca: Orca,
    private readonly now: () => number = Date.now,
  ) {}

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

  /** Always reads. Used at send time, so a handle is never taken from the cache. */
  fresh(): Promise<SessionSnapshot> {
    return this.refresh();
  }

  private refresh(): Promise<SessionSnapshot> {
    this.inflight ??= this.read().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async read(): Promise<SessionSnapshot> {
    this.lastReads += 1;
    let next: SessionSnapshot;
    try {
      const [ps, list, repoNameOf] = await Promise.all([
        this.orca.cli(['worktree', 'ps', '--limit', ROW_LIMIT, '--json'], LIST_TIMEOUT_MS),
        this.orca.cli(['terminal', 'list', '--limit', ROW_LIMIT, '--json'], LIST_TIMEOUT_MS),
        this.orca.repoNameOf(),
      ]);
      next = parseSessions(ps, list, repoNameOf, this.now());
    } catch (e) {
      if (!(e instanceof OrcaUnavailable)) console.error('[orca] session read failed:', e instanceof Error ? e.message.slice(0, 200) : 'error');
      next = EMPTY(this.now());
    }
    this.snap = next;
    return next;
  }
}
