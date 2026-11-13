export const ACTIVITY_KINDS = [
  'opened',
  'commits',
  'ci',
  'approved',
  'changes',
  'comment',
  'mention',
  'merged',
  'closed',
  'label-added',
  'label-removed',
  'status',
  'review-requested',
  'assigned',
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface ActivityItemRef {
  kind: 'pr' | 'issue';
  id: string;
  repo: string;
  number: number;
  title: string;
  url: string;
}

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  /** Login that caused the event. Absent when the poll cannot tell. */
  actor?: string;
  /** Lower case verb phrase, for example `pushed 2 commits`. */
  verb: string;
  /** ISO time. */
  at: string;
  /** Label name, status, check state or commit count. */
  detail?: string;
  /** The event matches the Needs me chip. */
  needsMe: boolean;
}

/**
 * A quiet line on an item's timeline, written by Nod itself (an Orca notification outcome).
 * It never counts as an update, never marks an item unread and never moves a row.
 */
export interface ActivityNotice {
  id: string;
  /** ISO time. */
  at: string;
  text: string;
  icon: 'bubble' | 'info' | 'alert';
}

/** All events of one PR or issue in the window, newest first. */
export interface ActivityGroup {
  item: ActivityItemRef;
  events: ActivityEvent[];
  /** Notices on the item, newest first. Absent when there are none. */
  notices?: ActivityNotice[];
}

export interface ActivityFeed {
  viewer: string;
  syncedAt: number;
  /** Window length in days: 7, 14, 21 or 28. */
  days: number;
  /** The store holds events older than the window. */
  hasOlder: boolean;
  /** Last visit to the Activity view, ms. 0 when never visited. */
  lastVisit: number;
  /** Groups ordered by their latest event, newest first. */
  groups: ActivityGroup[];
}

export const ACTIVITY_WINDOW_DAYS = 7;
export const ACTIVITY_MAX_DAYS = 28;

/** The verb phrase stored on an event. `detail` is the count, label, status or check state. */
export function verbFor(kind: ActivityKind, detail?: string): string {
  switch (kind) {
    case 'opened':
      return 'opened';
    case 'commits': {
      const n = Number(detail);
      return n === 1 ? 'pushed 1 commit' : `pushed ${Number.isFinite(n) && n > 0 ? n : 'new'} commits`;
    }
    case 'ci':
      return detail === 'fail' ? 'CI failed' : detail === 'pass' ? 'CI passed' : 'CI running';
    case 'approved':
      return 'approved';
    case 'changes':
      return 'requested changes';
    case 'comment':
      return 'commented';
    case 'mention':
      return 'mentioned you';
    case 'merged':
      return 'merged';
    case 'closed':
      return 'closed';
    case 'label-added':
      return `Label added: ${detail ?? ''}`.trim();
    case 'label-removed':
      return `Label removed: ${detail ?? ''}`.trim();
    case 'status':
      return `Moved to ${detail ?? ''}`.trim();
    case 'review-requested':
      return 'requested your review';
    case 'assigned':
      return 'assigned you';
  }
}
