import { describe, expect, it } from 'vitest';
import {
  activityBadge,
  buildActivityView,
  eventSentence,
  isOwnEvent,
  matchesFilter,
  rowMeta,
  stepIndex,
  type ActivityOptions,
} from '../shared/activity';
import {
  verbFor,
  type ActivityEvent,
  type ActivityFeed,
  type ActivityGroup,
  type ActivityItemRef,
  type ActivityKind,
} from '../shared/activity-types';

const T0 = Date.parse('2026-11-08T12:00:00Z');
const MIN = 60_000;
const at = (minAgo: number) => new Date(T0 - minAgo * MIN).toISOString();

function ev(kind: ActivityKind, minAgo: number, over: Partial<ActivityEvent> = {}): ActivityEvent {
  return { id: `${kind}-${minAgo}`, kind, verb: verbFor(kind, over.detail), at: at(minAgo), needsMe: false, ...over };
}

function ref(n: number, kind: 'pr' | 'issue' = 'pr'): ActivityItemRef {
  return { kind, id: `acme-web#${n}`, repo: 'acme-web', number: n, title: `Item ${n}`, url: `https://example.test/${n}` };
}

const group = (n: number, events: ActivityEvent[], kind: 'pr' | 'issue' = 'pr'): ActivityGroup => ({
  item: ref(n, kind),
  events,
});

const opts = (over: Partial<ActivityOptions> = {}): ActivityOptions => ({
  viewer: 'acme-dev',
  filter: 'all',
  showMine: false,
  lastVisit: 0,
  ...over,
});

describe('event wording', () => {
  const pr = { kind: 'pr' as const, number: 1354 };
  it('puts the actor first with a lower case verb', () => {
    expect(eventSentence(ev('commits', 1, { actor: 'Bot', detail: '2' }), pr)).toBe('Bot pushed 2 commits');
    expect(eventSentence(ev('mention', 1, { actor: 'Jj' }), pr)).toBe('Jj mentioned you');
    expect(eventSentence(ev('review-requested', 1, { actor: 'Bot' }), pr)).toBe('Bot requested your review');
  });
  it('words opened by item kind', () => {
    expect(eventSentence(ev('opened', 1, { actor: 'Bot' }), pr)).toBe('Bot opened PR');
    expect(eventSentence(ev('opened', 1, { actor: 'Bot' }), { kind: 'issue', number: 7 })).toBe('Bot opened issue');
  });
  it('words CI, merged, labels and status without an actor', () => {
    expect(eventSentence(ev('ci', 1, { detail: 'fail' }), pr)).toBe('CI failed on #1354');
    expect(eventSentence(ev('merged', 1, { actor: 'acme-dev' }), { kind: 'pr', number: 1330 })).toBe('Merged #1330');
    expect(eventSentence(ev('label-added', 1, { detail: 'bug' }), pr)).toBe('Label added: bug');
    expect(eventSentence(ev('label-removed', 1, { detail: 'bug' }), pr)).toBe('Label removed: bug');
    expect(eventSentence(ev('status', 1, { detail: 'In review' }), pr)).toBe('Moved to In review');
  });
  it('uses a neutral subject when the poll cannot name the actor', () => {
    expect(eventSentence(ev('approved', 1), pr)).toBe('A reviewer approved');
    expect(eventSentence(ev('changes', 1), pr)).toBe('A reviewer requested changes');
    expect(eventSentence(ev('comment', 1), pr)).toBe('Someone commented');
  });
  it('builds the row meta line', () => {
    expect(rowMeta(ref(1318), ev('mention', 1, { actor: 'Bot' }))).toBe('PR · acme-web #1318 · Bot mentioned you');
    expect(rowMeta(ref(7, 'issue'), ev('ci', 1, { detail: 'pass' }))).toBe('Issue · acme-web #7 · CI passed on #7');
  });
  it('counts commits with singular and plural', () => {
    expect(verbFor('commits', '1')).toBe('pushed 1 commit');
  });
});

describe('filters', () => {
  it('matches each chip to its events', () => {
    expect(matchesFilter(ev('mention', 1), 'mentions')).toBe(true);
    expect(matchesFilter(ev('comment', 1), 'mentions')).toBe(false);
    expect(matchesFilter(ev('ci', 1), 'ci')).toBe(true);
    expect(matchesFilter(ev('merged', 1), 'merged')).toBe(true);
    expect(matchesFilter(ev('closed', 1), 'merged')).toBe(true);
    expect(matchesFilter(ev('ci', 1), 'merged')).toBe(false);
    expect(matchesFilter(ev('review-requested', 1, { needsMe: true }), 'needs')).toBe(true);
    expect(matchesFilter(ev('comment', 1), 'needs')).toBe(false);
    expect(matchesFilter(ev('comment', 1), 'all')).toBe(true);
  });
});

describe('own events', () => {
  it('matches the viewer login case-insensitively and never without an actor', () => {
    expect(isOwnEvent(ev('commits', 1, { actor: 'acme-dev' }), 'acme-dev')).toBe(true);
    expect(isOwnEvent(ev('ci', 1), 'acme-dev')).toBe(false);
    expect(isOwnEvent(ev('commits', 1, { actor: 'acme-dev' }), '')).toBe(false);
  });
  it('hides own events and the items that hold only them, and counts what it hid', () => {
    const groups = [
      group(1, [ev('commits', 5, { actor: 'acme-dev' })]),
      group(2, [ev('commits', 6, { actor: 'Bot' }), ev('opened', 9, { actor: 'acme-dev' })]),
    ];
    const v = buildActivityView(groups, opts());
    expect(v.rows.map((r) => r.item.number)).toEqual([2]);
    expect(v.rows[0]?.updates).toBe(1);
    expect(v.hiddenMine).toBe(2);
    const shown = buildActivityView(groups, opts({ showMine: true }));
    expect(shown.rows.map((r) => r.item.number)).toEqual([1, 2]);
    expect(shown.rows[1]?.updates).toBe(2);
    expect(shown.hiddenMine).toBe(0);
  });
});

describe('grouping and sorting', () => {
  it('orders rows by latest event, newest first', () => {
    const v = buildActivityView(
      [group(1, [ev('ci', 30, { detail: 'fail' })]), group(2, [ev('comment', 2, { actor: 'Jj' })])],
      opts(),
    );
    expect(v.rows.map((r) => r.item.number)).toEqual([2, 1]);
  });
  it('keeps input order on ties', () => {
    const v = buildActivityView(
      [group(3, [ev('comment', 5, { actor: 'Jj' })]), group(1, [ev('comment', 5, { actor: 'Jj' })])],
      opts(),
    );
    expect(v.rows.map((r) => r.item.number)).toEqual([3, 1]);
  });
  it('shows the newest event as latest and sorts a row events newest first', () => {
    const v = buildActivityView(
      [group(1, [ev('opened', 52, { actor: 'Bot' }), ev('ci', 4, { detail: 'fail' }), ev('commits', 21, { actor: 'Bot', detail: '2' })])],
      opts(),
    );
    expect(v.rows[0]?.latest.kind).toBe('ci');
    expect(v.rows[0]?.events.map((e) => e.kind)).toEqual(['ci', 'commits', 'opened']);
    expect(v.rows[0]?.updates).toBe(3);
  });
  it('lets a new event move its row to the top', () => {
    const before = [group(1, [ev('comment', 10, { actor: 'Jj' })]), group(2, [ev('comment', 20, { actor: 'Jj' })])];
    const after = [group(1, before[0]!.events), group(2, [ev('ci', 1, { detail: 'fail' }), ...before[1]!.events])];
    expect(buildActivityView(after, opts()).rows.map((r) => r.item.number)).toEqual([2, 1]);
  });
});

describe('chip counts and filtering', () => {
  const groups = [
    group(1, [ev('mention', 3, { actor: 'Jj', needsMe: true }), ev('ci', 9, { detail: 'fail' })]),
    group(2, [ev('merged', 4, { actor: 'Sam' })]),
    group(3, [ev('comment', 5, { actor: 'Jj' })]),
  ];
  it('counts items with a matching event for every chip', () => {
    expect(buildActivityView(groups, opts()).counts).toEqual({ all: 3, needs: 1, mentions: 1, ci: 1, merged: 1 });
  });
  it('shows only matching events under a chip, and counts those as updates', () => {
    const v = buildActivityView(groups, opts({ filter: 'ci' }));
    expect(v.rows.map((r) => r.item.number)).toEqual([1]);
    expect(v.rows[0]?.updates).toBe(1);
    expect(v.rows[0]?.latest.kind).toBe('ci');
  });
  it('keeps chip counts independent of the selected chip', () => {
    expect(buildActivityView(groups, opts({ filter: 'merged' })).counts.all).toBe(3);
  });
  it('returns zero counts and no rows for an empty feed', () => {
    const v = buildActivityView([], opts());
    expect(v.rows).toEqual([]);
    expect(v.counts.all).toBe(0);
  });
});

describe('unread and badge', () => {
  const groups = [
    group(1, [ev('comment', 5, { actor: 'Jj' }), ev('opened', 60, { actor: 'Jj' })]),
    group(2, [ev('comment', 90, { actor: 'Jj' })]),
    group(3, [ev('commits', 2, { actor: 'acme-dev' })]),
  ];
  const visit = T0 - 30 * MIN;
  it('marks a row unread when any event is after the last visit', () => {
    const v = buildActivityView(groups, opts({ lastVisit: visit }));
    expect(v.rows.map((r) => [r.item.number, r.unread])).toEqual([
      [1, true],
      [2, false],
    ]);
  });
  it('counts items, not events, and ignores own events', () => {
    expect(buildActivityView(groups, opts({ lastVisit: visit })).unseen).toBe(1);
    expect(buildActivityView(groups, opts({ lastVisit: 0 })).unseen).toBe(2);
  });
  it('treats every event as unread before the first visit', () => {
    expect(buildActivityView(groups, opts()).rows.every((r) => r.unread)).toBe(true);
  });
  it('hides the badge while there is no feed and at zero', () => {
    expect(activityBadge(undefined, 0)).toBe(0);
    const feed: ActivityFeed = { viewer: 'acme-dev', syncedAt: T0, days: 7, hasOlder: false, lastVisit: 0, groups };
    expect(activityBadge(feed, visit)).toBe(1);
    expect(activityBadge(feed, T0)).toBe(0);
  });
});

describe('stepIndex', () => {
  it('moves and clamps at the ends', () => {
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, 1, 3)).toBe(1);
  });
  it('starts at the first row going down and the last going up', () => {
    expect(stepIndex(-1, 1, 3)).toBe(0);
    expect(stepIndex(-1, -1, 3)).toBe(2);
  });
  it('answers -1 for an empty list', () => {
    expect(stepIndex(-1, 1, 0)).toBe(-1);
  });
});
