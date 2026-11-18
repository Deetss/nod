import { PROMPT_MAX, commentBot, commentText, inlineThreads, type ThreadItem } from './fix-comments';
import { MESSAGE_TAG, cleanField, oneLine } from './orca-message';
import { SEND_MAX } from './orca-sessions';
import type { BotSettings, ReviewerSettings } from './settings';
import type { PrDetail, PrThreadItem } from './types';

export type Severity = 'blocker' | 'major';

export const SEVERITY_WORD: Record<Severity, string> = { blocker: 'Blocker', major: 'Major' };

/** A review thread the reviewer bot opened, with its severity and the finding text. */
export interface Finding {
  thread: ThreadItem;
  severity: Severity;
  /** The first comment without the marker and the severity prefix. */
  text: string;
}

const SEVERITY = /^\s*\*\*(Blocker|Major)\*\*\s*:\s*/i;

/** A login as GitHub shows it, lowercase and without `[bot]`. */
export const normLogin = (s: string): string => s.replace(/\[bot\]$/i, '').toLowerCase();

/** True when the reviewer is configured: both fields set. Otherwise nothing is a finding. */
export const reviewerOn = (r: ReviewerSettings): boolean => r.login.trim() !== '' && r.threadMarker.trim() !== '';

/**
 * Reads one thread as a finding. The first comment must be by the reviewer login, start with the
 * marker, and open with `**Blocker**:` or `**Major**:`. Anything else is an ordinary thread.
 */
export function findingOf(t: ThreadItem, r: ReviewerSettings): Finding | undefined {
  if (!reviewerOn(r)) return undefined;
  const [root] = t.comments;
  if (!root || normLogin(root.author) !== normLogin(r.login)) return undefined;
  const body = commentText(t).trim();
  if (!body.startsWith(r.threadMarker)) return undefined;
  const after = body.slice(r.threadMarker.length);
  const hit = SEVERITY.exec(after);
  if (!hit) return undefined;
  const severity = (hit[1] ?? '').toLowerCase() === 'blocker' ? 'blocker' : 'major';
  return { thread: t, severity, text: after.slice(hit[0].length).trim() };
}

export interface ThreadGroups {
  /** Unresolved findings, blocker before major, then file order. */
  open: Finding[];
  /** Resolved findings. */
  done: Finding[];
  /** Unresolved threads from people, and from the bot below major. */
  humans: ThreadItem[];
  /** Resolved threads that are not findings. */
  humansDone: ThreadItem[];
  /** Reviews and conversation comments, kept in their own order. */
  other: PrThreadItem[];
}

const RANK: Record<Severity, number> = { blocker: 0, major: 1 };

/** Splits a PR's thread items for the finding layout. */
export function groupThreads(items: readonly PrThreadItem[], r: ReviewerSettings): ThreadGroups {
  const g: ThreadGroups = { open: [], done: [], humans: [], humansDone: [], other: [] };
  for (const item of items) {
    if (item.kind !== 'thread') {
      g.other.push(item);
      continue;
    }
    const f = findingOf(item, r);
    if (f) (item.resolved ? g.done : g.open).push(f);
    else (item.resolved ? g.humansDone : g.humans).push(item);
  }
  const byFile = (a: Finding, b: Finding) =>
    RANK[a.severity] - RANK[b.severity] ||
    a.thread.path.localeCompare(b.thread.path) ||
    (a.thread.line ?? 0) - (b.thread.line ?? 0);
  g.open.sort(byFile);
  return g;
}

/** Findings of an open PR, whatever their state. Empty while the reviewer is not configured. */
export const findingsOf = (detail: PrDetail, r: ReviewerSettings): Finding[] =>
  inlineThreads(detail).flatMap((t) => {
    const f = findingOf(t, r);
    return f ? [f] : [];
  });

export interface Banner {
  /** Unresolved threads of any kind. */
  unresolved: number;
  /** Unresolved findings, the N of `Hand all`. */
  findings: number;
  blocked: boolean;
}

/** Counts for the merge banner. Human threads count as unresolved but not toward Hand all. */
export function bannerOf(g: ThreadGroups): Banner {
  const unresolved = g.open.length + g.humans.length;
  return { unresolved, findings: g.open.length, blocked: unresolved > 0 };
}

/** What Dispatch all carries: unresolved findings, in list order. Human threads and resolved findings never appear. */
export const dispatchAllOf = (g: ThreadGroups): Finding[] => g.open.filter((f) => !f.thread.resolved);

/** Dispatch all shows on a blocked banner when Orca can take a message and 2 or more findings are open. */
export const showDispatchAll = (b: Banner, orcaOn: boolean, eligible: number): boolean => b.blocked && orcaOn && eligible >= 2;

/** Findings that Hand to bot can post on: unresolved, on GitHub (thread id), not a pending draft. */
export const handable = (f: Finding): boolean => !f.thread.resolved && !!f.thread.threadId && f.thread.pending !== true;

/** The thread with its first comment reduced to the finding text, so the bot command quotes the finding. */
function cleaned(f: Finding): ThreadItem {
  const [root, ...rest] = f.thread.comments;
  if (!root) return f.thread;
  return { ...f.thread, comments: [{ ...root, body: f.text }, ...rest] };
}

/** The reply body that hands one finding to the bot: the existing `commentBot` command for that thread. */
export const handBody = (f: Finding, b: BotSettings): string => commentBot([cleaned(f)], b);

/** One line of the bulk dialog row: the command and the finding. Full text goes in `title`. */
export function handPreview(f: Finding, b: BotSettings): string {
  return handBody(f, b).split('\n').filter((l) => !l.startsWith('Comment by ')).join(' ').replace(/\s+/g, ' ');
}

/** `Hand 2 findings to review-bot?` */
export const bulkTitle = (n: number, bot: string): string => `Hand ${n} finding${n === 1 ? '' : 's'} to ${bot}?`;

/** The Orca message for one finding: its file and text, one line, within the send limit. */
export function dispatchText(f: Finding, repo: string, number: number): string {
  const t = f.thread;
  const where = `${t.path}${t.line ? `:${t.line}` : ''}`;
  const head = `${MESSAGE_TAG} Review finding (${f.severity}) on ${cleanField(repo, 100)}#${number}, ${cleanField(where, 160)}: `;
  const link = t.comments[0]?.url ? ` ${t.comments[0].url}` : '';
  const room = SEND_MAX - head.length - link.length;
  const body = oneLine(f.text);
  const text = body.length > room ? `${body.slice(0, Math.max(0, room - 3)).trimEnd()}...` : body;
  return `${head}${text}${link}`;
}

/** Longest Dispatch all prompt. A session gets it as a file; a new worktree gets it as its prompt. */
export const DISPATCH_ALL_MAX = PROMPT_MAX;

/**
 * One prompt for several findings: a tagged head line, then one block per finding with its file,
 * whole text and link. Nothing is cut; `DISPATCH_ALL_MAX` bounds the whole prompt.
 */
export function dispatchAllText(fs: readonly Finding[], repo: string, number: number): string {
  const [only] = fs;
  if (fs.length === 1 && only) return dispatchText(only, repo, number);
  const head = `${MESSAGE_TAG} ${fs.length} review findings on ${cleanField(repo, 100)}#${number}. Fix each one, or resolve its thread if it is wrong.`;
  const blocks = fs.map((f, i) => {
    const t = f.thread;
    const where = `${t.path}${t.line ? `:${t.line}` : ''}`;
    const url = t.comments[0]?.url;
    return [`(${i + 1}) ${f.severity}, ${cleanField(where, 160)}`, oneLine(f.text), ...(url ? [url] : [])].join('\n');
  });
  return [head, ...blocks].join('\n\n');
}

/** The first line of a comment in plain text, cut to `max`. */
export function firstLine(text: string, max = 140): string {
  const line = oneLine(text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '');
  return line.length > max ? `${line.slice(0, max - 3).trimEnd()}...` : line;
}

/** A bot reply to a handed finding: the first comment after the hand comment by someone who is not its author. */
export interface BotReply {
  author: string;
  at: string;
  line: string;
  runUrl?: string;
}

export interface HandState {
  /** ISO time of the comment that handed the finding over. */
  at: string;
  reply?: BotReply;
}

const URL_RE = /https?:\/\/[^\s)>\]"]+/g;

/**
 * Whether the thread carries a hand comment (a later comment that starts with the bot command) and
 * the bot's reply after it. `botLogin` is `bot.login`; empty accepts any later comment by someone else.
 */
export function handStateOf(t: ThreadItem, b: BotSettings): HandState | undefined {
  const cs = t.comments;
  const i = cs.findIndex((c, n) => n > 0 && commentPlain(c).trimStart().startsWith(`${b.command} `));
  const sent = cs[i];
  if (!sent) return undefined;
  const bot = normLogin(b.login);
  const reply = cs.slice(i + 1).find((c) => c.author !== sent.author && (bot === '' || normLogin(c.author) === bot));
  if (!reply) return { at: sent.createdAt };
  const text = commentPlain(reply);
  const urls = text.match(URL_RE) ?? [];
  const runUrl = urls.find((u) => /\/actions\/runs\/\d+/.test(u)) ?? urls[0];
  return { at: sent.createdAt, reply: { author: reply.author, at: reply.createdAt, line: firstLine(text), ...(runUrl ? { runUrl } : {}) } };
}

/** Plain text of one comment: raw body, else its HTML with tags removed. */
export function commentPlain(c: ThreadItem['comments'][number]): string {
  return commentText({ comments: [c] } as ThreadItem);
}
