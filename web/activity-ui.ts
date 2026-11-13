import {
  ACTIVITY_FILTERS,
  ACTIVITY_FILTER_LABELS,
  type ActivityFilter,
  type ActivityView,
} from '../shared/activity';
import type { ActivityFeed } from '../shared/activity-types';

export type ActivityStatus = 'loading' | 'error' | 'empty' | 'ready';

interface StatusInput {
  feed: ActivityFeed | undefined;
  error: string | undefined;
  view: ActivityView | undefined;
  filter: ActivityFilter;
}

/** Which of B1, B4, B5, B6 an Activity view shows. A cached feed stays visible under an error. */
export function activityStatus({ feed, error, view, filter }: StatusInput): ActivityStatus {
  if (!feed) return error ? 'error' : 'loading';
  if (filter === 'all' && (view?.rows.length ?? 0) === 0) return 'empty';
  return 'ready';
}

export interface ChipView {
  key: ActivityFilter;
  label: string;
  /** `--` while loading or without a cache. */
  count: number | string;
}

export function activityChipViews(view: ActivityView | undefined): ChipView[] {
  return ACTIVITY_FILTERS.map((key) => ({
    key,
    label: ACTIVITY_FILTER_LABELS[key],
    count: view ? view.counts[key] : '--',
  }));
}

export function clock(ms: number): string {
  const t = new Date(ms);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** `Synced 14:02 · 10 items moved`. */
export function activitySyncLine(feed: ActivityFeed | undefined, view: ActivityView | undefined): string {
  if (!feed) return 'Not synced yet';
  const hhmm = clock(feed.syncedAt);
  const n = view?.counts.all ?? 0;
  return n > 0 ? `Synced ${hhmm} · ${n} ${n === 1 ? 'item' : 'items'} moved` : `Synced ${hhmm}`;
}

/** The explanation shown under the rows while a chip is on. */
export const FILTER_HINTS: Record<Exclude<ActivityFilter, 'all'>, string> = {
  needs: 'Only items that need you.',
  mentions: 'Only items with a mention of you.',
  ci: 'Only items with a CI change.',
  merged: 'Only merged or closed items.',
};

/** `4m`, `2h`, `Yest`, `3d`. */
export function activityAge(iso: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yest' : `${days}d`;
}

/** `GET /api/activity` window and visit state, as the views need them. */
export interface ActivityHandle {
  feed: ActivityFeed | undefined;
  error: string | undefined;
  /** Last visit used for unread dots. Fixed while the Activity view is open. */
  lastVisit: number;
  reload: () => void;
  loadOlder: () => void;
}
