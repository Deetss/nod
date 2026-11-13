import type { BotSettings } from './settings';
import { z } from 'zod';
import type { BotTag, CheckVerdict, IssueComment, SplitPart } from './issue-types';

/** Ends each bot failure comment that the retry command can rerun as it stands. */
export const retryMarker = (b: BotSettings): string => `<!-- ${b.marker}:retry -->`;

/** Reruns the bot on the issue from the start, sizing included. */
export const retryCommand = (b: BotSettings): string => `${b.command} retry`;

/** Asks the bot for a check: one comment, then the bot edits its ack into the verdict. */
export const checkCommand = (b: BotSettings): string => `${b.command} check`;

/** Moves the met criteria into the issue body's Already done section. No model runs. */
export const trimCommand = (b: BotSettings): string => `${b.command} trim`;

export const CHECK_VERDICTS: readonly CheckVerdict[] = ['valid', 'partly', 'done', 'obsolete', 'unclear'];

/** Comments before this local time never carry `met`, so their `partly` shows no Trim button. */
export const CHECK_MET_SINCE = new Date(2026, 10, 12, 22, 0).getTime();

export const checkFailedText = (b: BotSettings): string => `${b.name} could not finish the check`;
export const trimFailedText = (b: BotSettings): string => `${b.name} could not finish the trim`;

/** Ends a trim reply that moved `moved` criteria. The bot writes it; Nod reads it. */
export const trimMarker = (b: BotSettings, moved: number): string => `<!-- ${b.marker}:trim moved=${moved} -->`;

/** Ends a trim reply that refused; the visible text above it is the reason. */
export const trimRefusedMarker = (b: BotSettings): string => `<!-- ${b.marker}:trim-refused -->`;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ends a check verdict: `<!-- {marker}:check verdict( met=1,3)? -->`. Only the listed words match. */
const checkMarkerPattern = (b: BotSettings): RegExp =>
  new RegExp(`<!-- ${escapeRegExp(b.marker)}:check (${CHECK_VERDICTS.join('|')})( met=[\\d,]+)? -->`);

const trimMarkerPattern = (b: BotSettings): RegExp => new RegExp(`<!-- ${escapeRegExp(b.marker)}:trim moved=(\\d+) -->`);

const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** The criteria positions in a `met=1,3` suffix, 1-based, dropping anything that is not a position. */
function parseMet(suffix: string): number[] | undefined {
  const nums = suffix
    .slice(suffix.indexOf('=') + 1)
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const unique = [...new Set(nums)];
  return unique.length > 0 ? unique : undefined;
}

/** Opens the bot's proposed split as sub-issues of the issue. */
export const splitCommand = (b: BotSettings): string => `${b.command} split`;

/** Shown in place of Split when the issue already has sub-issues, which the bot refuses. */
export const splitHeld = (b: BotSettings): string => `${b.name} won't split an issue that already has sub-issues.`;

/** Ends a sizing comment that proposes a split: base64 JSON of `{title, acceptance_criteria}` parts. */
const splitMarkerPattern = (b: BotSettings): RegExp => new RegExp(`<!-- ${b.marker}:split ([A-Za-z0-9+/=]+) -->`);

export const SPLIT_MAX_BYTES = 64 * 1024;
export const SPLIT_MAX_PARTS = 20;

const splitSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1),
      acceptance_criteria: z.array(z.string()).default([]),
    }),
  )
  .min(1)
  .max(SPLIT_MAX_PARTS);

export type SplitDecode = { ok: true; parts: SplitPart[] } | { ok: false; error: string };

/** Decodes a split marker's payload, refusing anything over 64 KB or 20 parts. */
export function decodeSplit(b64: string): SplitDecode {
  if (b64.length > Math.ceil(SPLIT_MAX_BYTES / 3) * 4) return { ok: false, error: 'over 64 KB' };
  let text: string;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.length > SPLIT_MAX_BYTES) return { ok: false, error: 'over 64 KB' };
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, error: 'not base64 UTF-8' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  const parsed = splitSchema.safeParse(json);
  if (!parsed.success) {
    const many = Array.isArray(json) && json.length > SPLIT_MAX_PARTS;
    return { ok: false, error: many ? `over ${SPLIT_MAX_PARTS} parts` : 'not a list of {title, acceptance_criteria}' };
  }
  return { ok: true, parts: parsed.data.map((p) => ({ title: p.title, acceptanceCriteria: p.acceptance_criteria })) };
}

/** Each bad marker warns once, though the issue reloads many times. */
const warned = new Set<string>();

function warnOnce(b: BotSettings, b64: string, error: string): void {
  const key = `${b64.length}:${b64.slice(0, 64)}`;
  if (warned.has(key)) return;
  if (warned.size > 200) warned.clear();
  warned.add(key);
  console.warn(`Ignored a ${b.marker}:split marker: ${error}`);
}

/** Tags the bot's comments. Anyone else's comment gets no tag, marker or not. With no `bot.login`, nobody is the bot. */
export function botTag(
  author: { __typename?: string; login: string } | null,
  body: string,
  b: BotSettings,
  createdAt?: string,
): BotTag | undefined {
  if (!b.login || author?.__typename !== 'Bot' || author.login.replace(/\[bot\]$/, '') !== b.login) return undefined;
  if (body.includes(retryMarker(b))) return 'retry';
  const check = checkMarkerPattern(b).exec(body);
  if (check?.[1]) {
    const verdict = check[1] as CheckVerdict;
    // Fails closed: a comment without a time never carries `met`.
    const dated = createdAt !== undefined && Date.parse(createdAt) >= CHECK_MET_SINCE;
    const met = verdict === 'partly' && check[2] && dated ? parseMet(check[2]) : undefined;
    return { kind: 'check', verdict, ...(met ? { met } : {}) };
  }
  const trim = trimMarkerPattern(b).exec(body);
  if (trim?.[1]) return { kind: 'trim', moved: Number(trim[1]) };
  if (body.includes(trimRefusedMarker(b))) {
    return { kind: 'trim-refused', reason: body.replace(HTML_COMMENT, '').trim() };
  }
  if (body.includes(checkFailedText(b))) return 'check-failed';
  if (body.includes(trimFailedText(b))) return 'trim-failed';
  const m = splitMarkerPattern(b).exec(body);
  if (!m?.[1]) return 'plain';
  const split = decodeSplit(m[1]);
  if (split.ok) return { kind: 'split', parts: split.parts };
  warnOnce(b, m[1], split.error);
  return 'plain';
}

/** The bot's newest comment. Other people's comments never count. */
export const newestBot = (comments: readonly IssueComment[]): IssueComment | undefined =>
  comments.findLast((c) => c.bot !== undefined);

/** The split the bot's newest comment proposes, if it proposes one. */
export function proposedSplit(comments: readonly IssueComment[]): SplitPart[] | undefined {
  const tag = newestBot(comments)?.bot;
  return typeof tag === 'object' && tag.kind === 'split' ? tag.parts : undefined;
}

/** A posted bot command waiting for the bot's next comment. */
export interface BotRequest {
  /** The bot's newest comment when the command was posted. */
  after: string | undefined;
  /** Comments on the issue when the command was posted. */
  count: number;
  at: string;
}

const waiting = (comments: readonly IssueComment[], req: BotRequest | undefined): boolean =>
  !!req && newestBot(comments)?.id === req.after;

export type RetryState = 'hidden' | 'offered' | 'pending';

/** Pending until the bot comments again, then offered only if that comment carries the marker. */
export function retryState(comments: readonly IssueComment[], req: BotRequest | undefined): RetryState {
  if (waiting(comments, req)) return 'pending';
  return newestBot(comments)?.bot === 'retry' ? 'offered' : 'hidden';
}

/** `held` when the issue already has sub-issues, which the bot refuses to split. */
export type SplitState = 'hidden' | 'offered' | 'pending' | 'held';

/** Pending until the bot comments again, then offered only if that comment proposes a split. */
export function splitState(comments: readonly IssueComment[], subIssues: number, req: BotRequest | undefined): SplitState {
  if (waiting(comments, req)) return 'pending';
  if (!proposedSplit(comments)) return 'hidden';
  return subIssues > 0 ? 'held' : 'offered';
}

export type CheckResult = { kind: 'check'; verdict: CheckVerdict; met?: number[] } | { kind: 'failed' };

/** The newest check verdict or check failure the bot posted. Trust is already decided by `botTag`. */
export function latestCheck(comments: readonly IssueComment[]): CheckResult | undefined {
  for (let i = comments.length - 1; i >= 0; i--) {
    const tag = comments[i]?.bot;
    if (typeof tag === 'object' && tag.kind === 'check') return { kind: 'check', verdict: tag.verdict, met: tag.met };
    if (tag === 'check-failed') return { kind: 'failed' };
  }
  return undefined;
}

/** The newest Trim result the bot posted: moved, refused or failed. */
export type TrimResult = { kind: 'trimmed'; moved: number } | { kind: 'refused'; reason: string } | { kind: 'failed' };

function trimResultOf(comments: readonly IssueComment[]): TrimResult | undefined {
  for (let i = comments.length - 1; i >= 0; i--) {
    const tag = comments[i]?.bot;
    if (typeof tag === 'object' && tag.kind === 'trim') return { kind: 'trimmed', moved: tag.moved };
    if (typeof tag === 'object' && tag.kind === 'trim-refused') return { kind: 'refused', reason: tag.reason };
    if (tag === 'trim-failed') return { kind: 'failed' };
    // A check verdict or failure older than this point means no Trim result follows the newest check.
    if (typeof tag === 'object' ? tag.kind === 'check' : tag === 'check-failed') return undefined;
  }
  return undefined;
}

/** Whether a bot comment ends a check: it carries the verdict marker or the failure text. */
const endsCheck = (c: IssueComment | undefined): boolean => {
  const tag = c?.bot;
  return typeof tag === 'object' ? tag.kind === 'check' : tag === 'check-failed';
};

export type CheckFlowState = 'hidden' | 'idle' | 'pending' | 'verdict' | 'failed';

/**
 * Pending from the request until the bot answers. The ack is edited in place, so an answer also
 * counts when the newest bot comment is an older one that was edited after the request.
 */
export function checkState(comments: readonly IssueComment[], req: BotRequest | undefined): CheckFlowState {
  const newest = newestBot(comments);
  if (req) {
    // A new ack is posted after the request; its verdict arrives as an edit of that same comment.
    // An edit to the comment that was newest at the request also counts as the bot answering.
    const edited = !!newest && newest.id === req.after && !!newest.updatedAt && Date.parse(newest.updatedAt) > Date.parse(req.at);
    const answered = !!newest && newest.id !== req.after && endsCheck(newest);
    if (!edited && !answered) return 'pending';
  }
  const last = latestCheck(comments);
  if (!last) return 'idle';
  return last.kind === 'failed' ? 'failed' : 'verdict';
}

/** The follow-up the verdict offers as a button. Nothing runs without a press. */
export type FollowUp = { kind: 'trim'; count: number } | { kind: 'close' } | { kind: 'not-planned' } | { kind: 'hand' };

export function followUpFor(verdict: CheckVerdict, met?: number[]): FollowUp | undefined {
  switch (verdict) {
    case 'partly':
      return met && met.length > 0 ? { kind: 'trim', count: met.length } : undefined;
    case 'done':
      return { kind: 'close' };
    case 'obsolete':
      return { kind: 'not-planned' };
    case 'valid':
      return { kind: 'hand' };
    case 'unclear':
      return undefined;
  }
}

export type TrimFlowState = 'hidden' | 'offered' | 'pending' | 'trimmed' | 'refused' | 'failed';

/**
 * Trim is offered only when the newest check is `partly` with `met` and no Trim result has
 * followed it. Pending until a newer bot comment arrives or the issue body changes after the request.
 */
export function trimState(
  comments: readonly IssueComment[],
  req: BotRequest | undefined,
  issue: { updatedAt: string },
): TrimFlowState {
  const newest = newestBot(comments);
  if (req) {
    const answered = !!newest && newest.id !== req.after;
    const bodyChanged = Date.parse(issue.updatedAt) > Date.parse(req.at);
    if (!answered && !bodyChanged) return 'pending';
  }
  const result = trimResultOf(comments);
  if (result?.kind === 'trimmed') return 'trimmed';
  if (result?.kind === 'refused') return 'refused';
  if (result?.kind === 'failed') return 'failed';
  const last = latestCheck(comments);
  return last?.kind === 'check' && last.verdict === 'partly' && (last.met?.length ?? 0) > 0 ? 'offered' : 'hidden';
}

/** Shows the posted command in the thread until the reloaded detail carries the real comment. */
export function withPostedComment(comments: IssueComment[], req: BotRequest, viewer: string, body: string): IssueComment[] {
  if (comments.length > req.count) return comments;
  return [...comments, { id: `bot-${req.at}`, author: viewer, createdAt: req.at, bodyHtml: `<p>${body}</p>` }];
}

/** Shown in place of Hand to <bot> when the label is already set. */
export const botHeld = (b: BotSettings): string => `${b.name} already has this issue. The ${b.label} label is set.`;

export const hasBotLabel = (labels: readonly { name: string }[], b: BotSettings): boolean =>
  labels.some((l) => l.name.toLowerCase() === b.label.toLowerCase());
