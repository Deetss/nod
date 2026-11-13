import type { CloseReason, IssueSummary } from './issue-types';
import type { PrSummary, RateInfo } from './types';

/** Closed items load per window, newest first. `W` cycles through these. */
export const CLOSED_WINDOWS = [30, 90] as const;
export type ClosedWindow = (typeof CLOSED_WINDOWS)[number];
export const DEFAULT_CLOSED_WINDOW: ClosedWindow = 30;
export const CLOSED_PAGE_SIZE = 100;

export type ClosedKind = 'prs' | 'issues';

export interface ClosedPr extends PrSummary {
  merged: boolean;
  closedAt: string;
  /** Login that merged it. Absent for a closed PR and when GitHub does not say. */
  mergedBy?: string;
}

export interface ClosedIssue extends IssueSummary {
  closedAt: string;
  closeReason: CloseReason;
}

export interface ClosedPage<T> {
  items: T[];
  hasMore: boolean;
  /** Pass back as `after` for the next page. */
  cursor?: string;
  rate?: RateInfo;
}

export const isClosedPr = (p: PrSummary): p is ClosedPr => 'closedAt' in p && 'merged' in p;

export const isClosedIssue = (i: IssueSummary): i is ClosedIssue => 'closedAt' in i && 'closeReason' in i;

export const isClosedWindow = (n: number): n is ClosedWindow => (CLOSED_WINDOWS as readonly number[]).includes(n);

export const windowLabel = (w: ClosedWindow): string => `Last ${w} days`;
export const sectionTitle = (w: ClosedWindow): string => `Closed · last ${w} days`;
export const loadMoreLabel = (w: ClosedWindow): string => `Load more (older than ${w} days)`;
export const emptyLabel = (w: ClosedWindow): string => `Nothing closed in ${w} days.`;

export function nextWindow(w: ClosedWindow): ClosedWindow {
  return CLOSED_WINDOWS[(CLOSED_WINDOWS.indexOf(w) + 1) % CLOSED_WINDOWS.length] ?? DEFAULT_CLOSED_WINDOW;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Epoch ms of the window's start, which the closed search uses as `closed:>=`. */
export const windowStart = (now: number, w: ClosedWindow): number => now - w * DAY_MS;

// Row states ------------------------------------------------------------------------------------

/** How a closed row reads: icon shape, pill word and meta word all differ, never colour alone. */
export type ClosedState = 'merged' | 'closed' | 'completed' | 'not-planned';

export const CLOSED_PILL: Record<ClosedState, string> = {
  merged: 'MERGED',
  closed: 'CLOSED',
  completed: 'COMPLETED',
  'not-planned': 'NOT PLANNED',
};

const CLOSED_META: Record<ClosedState, string> = {
  merged: 'merged',
  closed: 'not merged',
  completed: 'completed',
  'not-planned': 'not planned',
};

export const closedPrState = (pr: Pick<ClosedPr, 'merged'>): ClosedState => (pr.merged ? 'merged' : 'closed');

export const closedIssueState = (i: Pick<ClosedIssue, 'closeReason'>): ClosedState =>
  i.closeReason === 'NOT_PLANNED' ? 'not-planned' : 'completed';

/** The reason GitHub reports for a closed issue. Anything but not-planned reads as completed. */
export const reasonOf = (stateReason: string | null | undefined): CloseReason =>
  stateReason === 'NOT_PLANNED' ? 'NOT_PLANNED' : 'COMPLETED';

/** `acme-dev · merged`, the row's third line. */
export const closedMeta = (author: string, state: ClosedState): string => `${author} · ${CLOSED_META[state]}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `11 Nov 2026`, in the viewer's time zone. */
export function closedDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The one-line status that replaces the review and merge bar on a closed PR. */
export function closedStatusLine(pr: { merged: boolean; closedAt: string; mergedBy?: string }): string {
  const on = closedDate(pr.closedAt);
  return pr.merged ? `Merged on ${on}${pr.mergedBy ? ` by ${pr.mergedBy}` : ''}` : `Closed on ${on}, not merged`;
}

// Section state ---------------------------------------------------------------------------------

export type ClosedStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ClosedSectionState<T> {
  open: boolean;
  window: ClosedWindow;
  status: ClosedStatus;
  items: T[];
  cursor: string | undefined;
  hasMore: boolean;
  /** A `Load more` request is in flight. */
  more: boolean;
  error: string | undefined;
}

export type ClosedAction<T> =
  | { type: 'toggle' }
  | { type: 'window'; window: ClosedWindow }
  | { type: 'start' }
  | { type: 'retry' }
  | { type: 'more' }
  | { type: 'loaded'; window: ClosedWindow; append: boolean; page: ClosedPage<T> }
  | { type: 'failed'; window: ClosedWindow; error: string; append: boolean };

export const initialClosed = <T>(window: ClosedWindow = DEFAULT_CLOSED_WINDOW): ClosedSectionState<T> => ({
  open: false,
  window,
  status: 'idle',
  items: [],
  cursor: undefined,
  hasMore: false,
  more: false,
  error: undefined,
});

/**
 * A section loads once, when it first opens, and again when the window changes. Opening it
 * again later shows what is already there. A reply for a window that is no longer current is dropped.
 */
export function closedReducer<T>(s: ClosedSectionState<T>, a: ClosedAction<T>): ClosedSectionState<T> {
  switch (a.type) {
    case 'toggle':
      return { ...s, open: !s.open };
    case 'window':
      return a.window === s.window ? s : { ...initialClosed<T>(a.window), open: s.open };
    case 'start':
      return { ...s, status: 'loading', error: undefined };
    case 'retry':
      return s.status === 'error' ? { ...s, status: 'idle', error: undefined } : s;
    case 'more':
      return { ...s, more: true, error: undefined };
    case 'loaded':
      if (a.window !== s.window) return s;
      return {
        ...s,
        status: 'ready',
        more: false,
        items: a.append ? [...s.items, ...a.page.items] : a.page.items,
        cursor: a.page.cursor,
        hasMore: a.page.hasMore,
        error: undefined,
      };
    case 'failed':
      if (a.window !== s.window) return s;
      return a.append ? { ...s, more: false, error: a.error } : { ...s, status: 'error', more: false, error: a.error };
  }
}

/** True when the section is open and has not yet asked for its first page. */
export const needsLoad = <T>(s: ClosedSectionState<T>): boolean => s.open && s.status === 'idle';

/** The header's count: `…` while the first page loads, nothing before the first open, otherwise the rows loaded. */
export const closedCount = <T>(s: ClosedSectionState<T>): string => {
  if (s.status === 'loading' || (s.status === 'idle' && s.open)) return '…';
  return s.status === 'idle' || s.status === 'error' ? '' : String(s.items.length);
};
