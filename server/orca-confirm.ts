import type { ConfirmedBy } from '../shared/orca-sessions';
import type { Orca } from './orca';
import type { OrcaSessions } from './orca-sessions';

const READ_TIMEOUT_MS = 5_000;
const SNIPPET_CHARS = 48;
const KEEP_MS = 10 * 60_000;
const MAX_PENDING = 50;

/**
 * What a send needs to prove itself when Orca cannot. Taken just before the send: the terminal's
 * output cursor, a slice of the message to look for after it, and whether the agent was idle.
 */
export interface Watch {
  sessionId: string;
  handle: string;
  cursor?: string;
  snippet: string;
  wasIdle: boolean;
}

/** Whitespace goes, because a TUI wraps and indents a long prompt when it echoes it. */
const squash = (s: string): string => s.replace(/\s+/g, '');

const cursorOf = (out: string): string | undefined => {
  const c = (JSON.parse(out) as { result?: { terminal?: { nextCursor?: unknown } } }).result?.terminal?.nextCursor;
  return typeof c === 'string' || typeof c === 'number' ? String(c) : undefined;
};

/** Notes where the terminal's output stands now. A failed read only means the echo check is skipped. */
export async function startWatch(orca: Orca, sessionId: string, handle: string, text: string, state: string): Promise<Watch> {
  let cursor: string | undefined;
  try {
    cursor = cursorOf(await orca.cli(['terminal', 'read', '--terminal', handle, '--limit', '1', '--json'], READ_TIMEOUT_MS));
  } catch {
    cursor = undefined;
  }
  return { sessionId, handle, ...(cursor ? { cursor } : {}), snippet: squash(text).slice(0, SNIPPET_CHARS), wasIdle: state !== 'working' };
}

/** True when the output since the watch began contains the message. Only reads, never keeps the text. */
async function echoed(orca: Orca, w: Watch): Promise<boolean> {
  if (!w.cursor) return false;
  try {
    const out = await orca.cli(['terminal', 'read', '--terminal', w.handle, '--cursor', w.cursor, '--json'], READ_TIMEOUT_MS);
    const tail = (JSON.parse(out) as { result?: { terminal?: { tail?: unknown } } }).result?.terminal?.tail;
    return Array.isArray(tail) && squash(tail.filter((l) => typeof l === 'string').join('')).includes(w.snippet);
  } catch {
    return false;
  }
}

async function startedWorking(sessions: OrcaSessions, w: Watch): Promise<boolean> {
  if (!w.wasIdle) return false;
  const snap = await sessions.fresh();
  return snap.sessions.some((s) => s.id === w.sessionId && s.state === 'working');
}

/**
 * Looks for proof of delivery for up to `ms`: the message in the terminal's new output, or an idle
 * agent that started working. Undefined when neither turned up.
 */
export async function observe(orca: Orca, sessions: OrcaSessions, w: Watch, ms: number, pollMs: number): Promise<ConfirmedBy | undefined> {
  const end = Date.now() + ms;
  for (;;) {
    if (await echoed(orca, w)) return 'echo';
    if (await startedWorking(sessions, w)) return 'state';
    if (Date.now() + pollMs > end) return undefined;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/** Unconfirmed sends by Orca request id, so Check again can look once more without resending. */
export class PendingChecks {
  private readonly items = new Map<string, { watch: Watch; at: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  put(requestId: string, watch: Watch): void {
    this.prune();
    if (this.items.size >= MAX_PENDING) this.items.delete(this.items.keys().next().value as string);
    this.items.set(requestId, { watch, at: this.now() });
  }

  get(requestId: string, sessionId: string): Watch | undefined {
    this.prune();
    const hit = this.items.get(requestId);
    return hit && hit.watch.sessionId === sessionId ? hit.watch : undefined;
  }

  delete(requestId: string): void {
    this.items.delete(requestId);
  }

  private prune(): void {
    const cutoff = this.now() - KEEP_MS;
    for (const [id, v] of this.items) if (v.at < cutoff) this.items.delete(id);
  }
}
