import { isOwnPr, sameLogin } from '../shared/pr-actions';
import type { PrSummary, ShippedPr } from '../shared/types';

/** Persisted inbox list. `closed` maps a PR key to when it left the open list. */
export interface InboxState {
  viewer: string;
  /** Start time of the last successful sync, ms. */
  lastSync: number;
  prs: Record<string, PrSummary>;
  closed: Record<string, number>;
  /** Slugs of the viewer's teams in the org, refreshed on each full sweep. */
  teams: string[];
  /** The viewer's PRs that a delta saw merge or close, newest first. Feeds the shipped notification. */
  shipped: ShippedPr[];
}

/** A PR from a sync result, with whether it is still open. */
export interface SyncedPr {
  pr: PrSummary;
  open: boolean;
  closedAt?: string | null;
  merged?: boolean;
}

export const EMPTY_STATE: InboxState = { viewer: '', lastSync: 0, prs: {}, closed: {}, teams: [], shipped: [] };

/** A closed PR counts as shipped only this soon after it closed, so a comment on an old PR is not news. */
export const SHIPPED_WINDOW_MS = 60 * 60 * 1000;
export const MAX_SHIPPED = 50;

function isMine(pr: PrSummary, viewer: string): boolean {
  return isOwnPr(pr.author, viewer) || (pr.assignees ?? []).some((a) => sameLogin(a, viewer));
}

function shippedOf(c: SyncedPr, viewer: string, syncStart: number): ShippedPr | undefined {
  if (c.open || !isMine(c.pr, viewer)) return undefined;
  const at = c.closedAt ? Date.parse(c.closedAt) : syncStart;
  if (Number.isNaN(at) || syncStart - at > SHIPPED_WINDOW_MS) return undefined;
  const { id, repo, number, title } = c.pr;
  return { id, repo, number, title, merged: c.merged === true, at };
}

/** Adds newly shipped PRs once each, newest first, keeping the list bounded. */
function withShipped(shipped: readonly ShippedPr[], changed: SyncedPr[], viewer: string, syncStart: number) {
  const known = new Set(shipped.map((s) => s.id));
  const added = changed.flatMap((c) => {
    const s = known.has(c.pr.id) ? undefined : shippedOf(c, viewer, syncStart);
    if (s) known.add(s.id);
    return s ? [s] : [];
  });
  if (added.length === 0) return shipped as ShippedPr[];
  return [...added.sort((a, b) => b.at - a.at), ...shipped].slice(0, MAX_SHIPPED);
}

export const prKey = (p: { repo: string; number: number }): string => `${p.repo}#${p.number}`;

function withClosed(closed: Record<string, number>, pr: PrSummary, at: number) {
  return { ...closed, [prKey(pr)]: at };
}

/** A full sweep replaces the list. PRs that vanished count as closed. */
export function applyFull(
  state: InboxState,
  viewer: string,
  found: PrSummary[],
  syncStart: number,
): InboxState {
  const prs: Record<string, PrSummary> = {};
  for (const p of found) prs[p.id] = p;
  let closed = { ...state.closed };
  for (const old of Object.values(state.prs)) {
    if (!prs[old.id]) closed = withClosed(closed, old, syncStart);
  }
  for (const p of found) delete closed[prKey(p)];
  return { ...state, viewer, lastSync: syncStart, prs, closed };
}

/** Merges an incremental result: updated PRs replace, new ones appear, closed ones go. */
export function applyDelta(
  state: InboxState,
  viewer: string,
  changed: SyncedPr[],
  syncStart: number,
): InboxState {
  const prs = { ...state.prs };
  let closed = { ...state.closed };
  for (const c of changed) {
    if (c.open) {
      prs[c.pr.id] = c.pr;
      delete closed[prKey(c.pr)];
    } else {
      delete prs[c.pr.id];
      const at = c.closedAt ? Date.parse(c.closedAt) : syncStart;
      closed = withClosed(closed, c.pr, Number.isNaN(at) ? syncStart : at);
    }
  }
  const shipped = withShipped(state.shipped ?? [], changed, viewer, syncStart);
  return { ...state, viewer, lastSync: syncStart, prs, closed, shipped };
}

/** Folds one PR in like `applyDelta`, but leaves `lastSync` to the delta poll. */
export function applyOne(state: InboxState, changed: SyncedPr, now: number): InboxState {
  return { ...applyDelta(state, state.viewer, [changed], now), lastSync: state.lastSync };
}

export const CLOSED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** PR keys closed for longer than the TTL, and the state without them. */
export function expireClosed(
  state: InboxState,
  now: number,
): { state: InboxState; expired: string[] } {
  const expired = Object.entries(state.closed)
    .filter(([, at]) => now - at > CLOSED_TTL_MS)
    .map(([key]) => key);
  if (expired.length === 0) return { state, expired };
  const closed = { ...state.closed };
  for (const key of expired) delete closed[key];
  return { state: { ...state, closed }, expired };
}
