import { MESSAGE_TAG } from '../shared/orca-message';
import type { Receipt, SendResult } from '../shared/orca-sessions';
import { OrcaUnavailable, timedOut, type Orca } from './orca';
import { observe, startWatch, type PendingChecks, type Watch } from './orca-confirm';
import type { OrcaSessions } from './orca-sessions';

export const USER_SEND_TIMEOUT_MS = 15_000;

const REQUEST_ID = /"(?:retry)?[rR]equest[_-]?[iI]d"\s*:\s*"([A-Za-z0-9._:-]{1,100})"/;
const idIn = (text: string): string | undefined => REQUEST_ID.exec(text)?.[1];

/** The short Orca code in a failure, for the Activity entry. */
export function orcaCode(e: unknown): string {
  if (e instanceof OrcaUnavailable) return 'unavailable';
  if (timedOut(e)) return 'timeout';
  const m = /\b(terminal_[a-z_]+|agent_[a-z_]+)\b/.exec(e instanceof Error ? e.message : '');
  return m?.[1] ?? 'error';
}

const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
const word = (v: unknown): string | undefined => (typeof v === 'string' ? v.slice(0, 40) : undefined);

/** The delivery fields, from `result.send.prompt` or, on older shapes, `result` or the top level. */
function receiptOf(json: unknown): Receipt | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const top = json as Record<string, unknown>;
  const result = (top.result ?? top) as Record<string, unknown>;
  const send = result.send as { prompt?: Record<string, unknown> } | undefined;
  const p = send?.prompt ?? result;
  const r: Receipt = {};
  const provider = word(p.provider);
  const stages = strings(p.stages);
  const observation = word(p.observation);
  if (provider) r.provider = provider;
  if (stages) r.stages = stages.map((s) => s.slice(0, 40)).slice(0, 8);
  if (observation) r.observation = observation;
  return Object.keys(r).length > 0 ? r : undefined;
}

/**
 * Reads the receipt of a send that exited 0. Only a proven turn start counts as sent. Anything else,
 * including `provider: unsupported`, an old host or an unreadable receipt, is unconfirmed, and the
 * caller never resends on it.
 */
export function parseReceipt(out: string): SendResult {
  if (/terminal_not_writable/.test(out)) return { status: 'not-writable' };
  if (/agent_prompt_blocked/.test(out)) return { status: 'blocked' };
  const requestId = idIn(out);
  const withId = requestId ? { requestId } : {};
  let json: unknown;
  try {
    json = JSON.parse(out);
  } catch {
    return { status: 'unconfirmed', ...withId };
  }
  const receipt = receiptOf(json);
  const withReceipt = receipt ? { receipt } : {};
  const unproven = /unsupported|old-host/i.test(out);
  return !unproven && /turn_started/.test(out)
    ? { status: 'sent', ...withId, confirmedBy: 'orca', ...withReceipt }
    : { status: 'unconfirmed', ...withId, ...withReceipt };
}

type Failure = SendResult | 'stale';

/** Maps a failed `terminal send` to a result. A timeout is unconfirmed, because the text may have gone out. */
function classify(e: unknown): Failure {
  const text = e instanceof Error ? e.message : '';
  if (/terminal_not_writable/.test(text)) return { status: 'not-writable' };
  if (/agent_prompt_blocked/.test(text)) return { status: 'blocked' };
  if (/terminal_handle_stale/.test(text)) return 'stale';
  const requestId = idIn(text);
  const withId = requestId ? { requestId } : {};
  if (timedOut(e)) return { status: 'unconfirmed', ...withId };
  return { status: 'unreachable', ...withId };
}

export interface SendOptions {
  timeoutMs?: number;
  /** An id Orca gave for an ambiguous failure. Reused once, from the explicit Send button only. */
  retryRequestId?: string;
  /** How long to look for proof of an unconfirmed send. 0 skips the look and the cursor read before it. */
  confirmMs?: number;
  pollMs?: number;
  /** Keeps an unconfirmed send so Check again can look later. */
  pending?: PendingChecks;
}

/** Turns an unconfirmed receipt into sent when the terminal shows the message arrived. */
async function confirm(
  orca: Orca,
  sessions: OrcaSessions,
  res: SendResult,
  watch: Watch | undefined,
  opts: SendOptions,
): Promise<SendResult> {
  if (res.status !== 'unconfirmed' || !watch) return res;
  const by = await observe(orca, sessions, watch, opts.confirmMs ?? 0, opts.pollMs ?? 750);
  if (by) return { ...res, status: 'sent', confirmedBy: by };
  if (res.requestId) opts.pending?.put(res.requestId, watch);
  return res;
}

/**
 * Sends one prepared message to a session. The handle is resolved at call time from a fresh
 * `worktree ps` and `terminal list`, never from the cache. The command always carries `--enter` and
 * the text as a single argument. Never resends on silence; a stale handle is re-resolved once and
 * only the replacement is used.
 */
export async function sendToSession(
  orca: Orca,
  sessions: OrcaSessions,
  sessionId: string,
  text: string,
  opts: SendOptions = {},
): Promise<SendResult> {
  if (!text.startsWith(MESSAGE_TAG) || text.includes('\0')) return { status: 'unreachable' };
  const timeoutMs = opts.timeoutMs ?? USER_SEND_TIMEOUT_MS;

  const resolve = async (): Promise<{ handle?: string; state?: string; result?: SendResult }> => {
    const snap = await sessions.fresh();
    if (!snap.available) return { result: { status: 'unreachable' } };
    const s = snap.sessions.find((x) => x.id === sessionId && x.live);
    const term = s ? snap.terminals.get(s.id) : undefined;
    if (!s || !term || !term.writable) return { result: { status: 'not-writable' } };
    return { handle: term.handle, state: s.state };
  };

  let target = await resolve();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!target.handle) return target.result ?? { status: 'unreachable' };
    const args = ['terminal', 'send', '--terminal', target.handle, '--text', text, '--enter'];
    if (opts.retryRequestId) args.push('--retry-request', opts.retryRequestId);
    args.push('--json');
    const watch =
      (opts.confirmMs ?? 0) > 0 ? await startWatch(orca, sessionId, target.handle, text, target.state ?? 'unknown') : undefined;
    try {
      return await confirm(orca, sessions, parseReceipt(await orca.cli(args, timeoutMs)), watch, opts);
    } catch (e) {
      const failure = classify(e);
      if (failure !== 'stale') return failure;
      // The text did not go out. Look the terminal up again and use the replacement only.
      const again = await resolve();
      if (!again.handle || again.handle === target.handle) return { status: 'unreachable' };
      target = again;
    }
  }
  return { status: 'unreachable' };
}

/**
 * Looks again for proof of an earlier unconfirmed send, from the cursor taken before it. Never sends.
 * Undefined when the send is unknown or too old.
 */
export async function checkAgain(
  orca: Orca,
  sessions: OrcaSessions,
  pending: PendingChecks,
  sessionId: string,
  requestId: string,
  ms: number,
): Promise<SendResult | undefined> {
  const watch = pending.get(requestId, sessionId);
  if (!watch) return undefined;

  // The agent may have finished its turn by now, so only the echo counts.
  const by = await observe(orca, sessions, { ...watch, wasIdle: false }, ms, 750);
  if (!by) return { status: 'unconfirmed', requestId };
  pending.delete(requestId);
  return { status: 'sent', requestId, confirmedBy: by };
}

/** Brings a session's terminal to the front in Orca. The handle is resolved at call time. */
export async function openInOrca(orca: Orca, sessions: OrcaSessions, sessionId: string): Promise<boolean> {
  const snap = await sessions.fresh();
  const term = snap.available ? snap.terminals.get(sessionId) : undefined;
  if (!term) return false;
  try {
    await orca.cli(['terminal', 'switch', '--terminal', term.handle, '--json'], 10_000);
    return true;
  } catch {
    return false;
  }
}
