import type { IssueSection } from '../../shared/issue-types';
import type { Section } from '../../shared/types';

export const PHONE_MAX_WIDTH = 700;

export type PhoneTab = 'prs' | 'issues' | 'activity';

/** Phone layout below 700px, or at any width when `?phone=1` forces it. */
export function isPhoneWidth(width: number, forced: boolean): boolean {
  return forced || width < PHONE_MAX_WIDTH;
}

export interface ChipCount<K extends string> {
  key: K | 'all';
  label: string;
  count: number;
}

const PR_CHIP_LABELS: Record<string, string> = {
  needs: 'Needs me',
  mine: 'Mine',
  org: 'Org',
  dependabot: 'Dependabot',
};

const ISSUE_CHIP_LABELS: Record<string, string> = {
  progress: 'In progress',
  assigned: 'Assigned',
  created: 'Created',
  mentioned: 'Mentioned',
  untriaged: 'Untriaged',
};

function chips<K extends string>(
  sections: readonly { key: K; count: number }[],
  allCount: number,
  labels: Record<string, string>,
): ChipCount<K>[] {
  return [
    { key: 'all', label: 'All', count: allCount },
    ...sections
      .filter((s) => labels[s.key] !== undefined)
      .map((s) => ({ key: s.key, label: labels[s.key] ?? s.key, count: s.count })),
  ];
}

/** Distinct PRs across all sections, since one PR can sit in several. */
export function prAllTotal(sections: readonly Section[]): number {
  return new Set(sections.flatMap((s) => s.prs.map((p) => p.id))).size;
}

/** The `All` chip count is `prAllTotal`, so the chip and the list status cannot disagree. */
export function prChips(sections: readonly Section[]): ChipCount<Section['key']>[] {
  return chips(sections, prAllTotal(sections), PR_CHIP_LABELS);
}

/**
 * Open state per section on the All chip. An empty section is closed unless
 * it was tapped open this page load, and its saved choice waits until it has
 * rows again. Otherwise a saved choice wins, then the default. When no
 * non-empty section ends up open, the first non-empty section without a
 * saved choice opens, so the list never shows only closed headers.
 */
export function resolveOpen(
  sections: readonly { key: string; rows: number }[],
  saved: Readonly<Record<string, boolean>>,
  closedByDefault: ReadonlySet<string>,
  peeked: ReadonlySet<string> = new Set(),
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const s of sections) {
    out[s.key] = s.rows === 0 ? peeked.has(s.key) : (saved[s.key] ?? !closedByDefault.has(s.key));
  }
  const nonEmpty = sections.filter((s) => s.rows > 0);
  if (nonEmpty.some((s) => out[s.key])) return out;
  const first = nonEmpty.find((s) => saved[s.key] === undefined);
  if (first) out[first.key] = true;
  return out;
}

export interface SectionState {
  /** Rows shown now, after search and filters. The header count. */
  rows: number;
  empty: boolean;
  open: boolean;
}

export interface SectionStateInput {
  saved: Readonly<Record<string, boolean>>;
  closedByDefault: ReadonlySet<string>;
  /** Empty sections tapped open this page load. Never saved. */
  peeked: ReadonlySet<string>;
  /** A filter narrows the list to one section, which then shows open. */
  filtered: boolean;
}

/** Each section with its shown row count and open state. */
export function sectionStates<T extends { key: string }>(
  sections: readonly T[],
  rowsOf: (s: T) => number,
  i: SectionStateInput,
): (T & SectionState)[] {
  const counted = sections.map((s) => ({ ...s, rows: rowsOf(s) }));
  const open = resolveOpen(counted, i.saved, i.closedByDefault, i.peeked);
  return counted.map((s) => ({
    ...s,
    empty: s.rows === 0,
    open: (i.filtered && s.rows > 0) || (open[s.key] ?? false),
  }));
}

/** The bot section, when present, comes last. */
export function issueChips(sections: readonly IssueSection[]): ChipCount<IssueSection['key']>[] {
  const all = sections.find((s) => s.key === 'all');
  const bot = sections.find((s) => s.key === 'bot');
  const ordered = [...sections.filter((s) => s.key !== 'bot'), ...(bot ? [bot] : [])];
  return chips(ordered, all?.count ?? 0, bot ? { ...ISSUE_CHIP_LABELS, bot: bot.title } : ISSUE_CHIP_LABELS);
}

export type PhoneStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface StatusInput {
  hasData: boolean;
  syncing: boolean;
  error: string | undefined;
  stale: boolean;
  total: number;
}

/** Which of S1, S2, S3 a list shows. Cached rows stay visible under the error banner and during a sync. */
export function phoneStatus(i: StatusInput): PhoneStatus {
  if (i.error && !i.hasData) return 'error';
  if (!i.hasData || (i.syncing && i.total === 0)) return 'loading';
  if (i.error || i.stale) return 'error';
  return i.total === 0 ? 'empty' : 'ready';
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)}h ago`;
}

/** `Synced 14s ago · API 4,812 left`, without the API part when the rate is unknown. */
export function syncText(syncedAt: number | undefined, remaining: number | undefined, now: number): string {
  if (!syncedAt) return 'Not synced yet';
  const api = remaining === undefined ? '' : ` · API ${remaining.toLocaleString('en-US')} left`;
  return `Synced ${ago(now - syncedAt)}${api}`;
}

/** Pull distance in px past which releasing refreshes. */
export const PULL_THRESHOLD = 72;

export function shouldRefresh(dy: number): boolean {
  return dy >= PULL_THRESHOLD;
}

/** Visual travel of the sync line while dragging, damped and capped. */
export function pullOffset(dy: number): number {
  return dy <= 0 ? 0 : Math.min(PULL_THRESHOLD, dy * 0.6);
}

/** Next file after `from` that is not viewed, wrapping to the start. Undefined when all are viewed. */
export function nextUnviewed(files: readonly { path: string; viewed: boolean }[], from: string): string | undefined {
  const at = files.findIndex((f) => f.path === from);
  const order = [...files.slice(at + 1), ...files.slice(0, Math.max(0, at))];
  return order.find((f) => !f.viewed && f.path !== from)?.path;
}

/** Scroll distance over which the large title collapses. */
export const COLLAPSE_PX = 56;

/** 0 is the expanded header, 1 the collapsed one. */
export function collapseProgress(scrollTop: number): number {
  return Math.min(1, Math.max(0, scrollTop / COLLAPSE_PX));
}

/** Reduced motion has no in-between: the header is one of its two states. */
export function steppedProgress(p: number): 0 | 1 {
  return p >= 0.5 ? 1 : 0;
}

/** Where a list resting inside the collapse range settles, or undefined when it is already at an end. */
export function snapTarget(scrollTop: number): number | undefined {
  if (scrollTop <= 0 || scrollTop >= COLLAPSE_PX) return undefined;
  return scrollTop < COLLAPSE_PX / 2 ? 0 : COLLAPSE_PX;
}

export function tabTitle(tab: PhoneTab): string {
  return tab === 'prs' ? 'Pull requests' : tab === 'issues' ? 'Issues' : 'Activity';
}

export const SWIPE_CLOSE_PX = 120;
const FLING_PX = 40;
const FLING_MS = 200;

/** A downward drag closes a sheet past 120px, or sooner when it is a quick fling. */
export function shouldCloseSwipe(dy: number, ms: number): boolean {
  return dy >= SWIPE_CLOSE_PX || (dy >= FLING_PX && ms <= FLING_MS);
}
