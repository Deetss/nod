import type {
  ActivityEvent,
  ActivityFeed,
  ActivityGroup,
  ActivityItemRef,
  ActivityNotice,
} from './activity-types';

export type ActivityFilter = 'all' | 'needs' | 'mentions' | 'ci' | 'merged';

export const ACTIVITY_FILTERS: readonly ActivityFilter[] = ['all', 'needs', 'mentions', 'ci', 'merged'];

export const ACTIVITY_FILTER_LABELS: Record<ActivityFilter, string> = {
  all: 'All',
  needs: 'Needs me',
  mentions: 'Mentions',
  ci: 'CI',
  merged: 'Merged',
};

const lower = (s: string | undefined): string => (s ?? '').toLowerCase();

/** The event's actor is the viewer. */
export function isOwnEvent(e: ActivityEvent, viewer: string): boolean {
  return e.actor !== undefined && viewer !== '' && lower(e.actor) === lower(viewer);
}

/** Which chip's set the event belongs to. Every event belongs to `all`. */
export function matchesFilter(e: ActivityEvent, f: ActivityFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'needs':
      return e.needsMe;
    case 'mentions':
      return e.kind === 'mention';
    case 'ci':
      return e.kind === 'ci';
    case 'merged':
      return e.kind === 'merged' || e.kind === 'closed';
  }
}

/** The sentence of an event, actor first. Events with no actor in the data get a neutral subject. */
export function eventSentence(e: ActivityEvent, item: Pick<ActivityItemRef, 'kind' | 'number'>): string {
  switch (e.kind) {
    case 'ci':
      return `${e.verb} on #${item.number}`;
    case 'merged':
      return `Merged #${item.number}`;
    case 'closed':
      return `Closed #${item.number}`;
    case 'label-added':
    case 'label-removed':
    case 'status':
      return e.verb;
    case 'opened':
      return `${e.actor ?? 'Someone'} opened ${item.kind === 'pr' ? 'PR' : 'issue'}`;
    case 'approved':
    case 'changes':
      return `${e.actor ?? 'A reviewer'} ${e.verb}`;
    default:
      return `${e.actor ?? 'Someone'} ${e.verb}`;
  }
}

/** Second line of a row: `PR · acme-api #1318 · Bot mentioned you`. The event part is the latest event. */
export function rowMeta(item: ActivityItemRef, latest: ActivityEvent): string {
  const who = latest.actor ? `${latest.actor} ` : '';
  const tail =
    latest.kind === 'ci' || latest.kind === 'merged' || latest.kind === 'closed' || latest.kind.startsWith('label') || latest.kind === 'status'
      ? eventSentence(latest, item)
      : `${who}${latest.verb}`.trim();
  return `${item.kind === 'pr' ? 'PR' : 'Issue'} · ${item.repo} #${item.number} · ${tail}`;
}

export interface ActivityRow {
  item: ActivityItemRef;
  /** Visible events after hiding the viewer's own and applying the chip, newest first. */
  events: ActivityEvent[];
  /** Quiet Nod lines. Shown in the expanded timeline only. */
  notices: ActivityNotice[];
  latest: ActivityEvent;
  /** Events shown in the row, which the `n updates` badge counts. */
  updates: number;
  unread: boolean;
}

export interface ActivityView {
  rows: ActivityRow[];
  /** Items with a matching event, per chip, after hiding the viewer's own. */
  counts: Record<ActivityFilter, number>;
  /** The viewer's own events that the default hides. */
  hiddenMine: number;
  /** Items with at least one unread event. Drives the tab and segment badge. */
  unseen: number;
}

export interface ActivityOptions {
  viewer: string;
  filter: ActivityFilter;
  showMine: boolean;
  /** Last visit, ms. Events after it are unread. */
  lastVisit: number;
}

const isUnread = (e: ActivityEvent, lastVisit: number): boolean => Date.parse(e.at) > lastVisit;

function newestFirst(events: readonly ActivityEvent[]): ActivityEvent[] {
  return [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/**
 * Hides own events, filters, groups per item and sorts by latest movement. Rows keep the order
 * of `groups` on ties, so a poll that changes nothing never reshuffles the list.
 */
export function buildActivityView(groups: readonly ActivityGroup[], o: ActivityOptions): ActivityView {
  const counts: Record<ActivityFilter, number> = { all: 0, needs: 0, mentions: 0, ci: 0, merged: 0 };
  let hiddenMine = 0;
  let unseen = 0;
  const rows: ActivityRow[] = [];

  for (const g of groups) {
    const own = g.events.filter((e) => isOwnEvent(e, o.viewer));
    const theirs = g.events.filter((e) => !isOwnEvent(e, o.viewer));
    hiddenMine += o.showMine ? 0 : own.length;

    for (const f of ACTIVITY_FILTERS) if (theirs.some((e) => matchesFilter(e, f))) counts[f] += 1;
    if (theirs.some((e) => isUnread(e, o.lastVisit))) unseen += 1;

    const pool = o.showMine ? g.events : theirs;
    const events = newestFirst(pool.filter((e) => matchesFilter(e, o.filter)));
    const latest = events[0];
    if (!latest) continue;
    rows.push({
      item: g.item,
      events,
      notices: g.notices ?? [],
      latest,
      updates: events.length,
      unread: events.some((e) => isUnread(e, o.lastVisit)),
    });
  }

  const sorted = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Date.parse(b.r.latest.at) - Date.parse(a.r.latest.at) || a.i - b.i)
    .map((x) => x.r);
  return { rows: sorted, counts, hiddenMine, unseen };
}

/** The number on the tab bar and the desktop segment. Hidden at 0 and while there is no feed. */
export function activityBadge(feed: ActivityFeed | undefined, lastVisit: number): number {
  if (!feed) return 0;
  return buildActivityView(feed.groups, { viewer: feed.viewer, filter: 'all', showMine: false, lastVisit }).unseen;
}

/** Row key for expanded and selected state. */
export const groupKey = (item: Pick<ActivityItemRef, 'kind' | 'id'>): string => `${item.kind}:${item.id}`;

/** Next index for j and k, clamped to the list. -1 means nothing is focused yet. */
export function stepIndex(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, current + delta));
}
