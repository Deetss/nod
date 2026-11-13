import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { ActivityStore, clampDays } from '../server/activity-store';
import { FixtureProvider } from '../server/fixture-provider';
import type { IssueInboxData, IssueSummary } from '../shared/issue-types';
import type { InboxData, PrSummary } from '../shared/types';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const iso = (ms: number) => new Date(ms).toISOString();

function pr(over: Partial<PrSummary> = {}): PrSummary {
  return {
    id: 'acme-web#1354',
    repo: 'acme-web',
    number: 1354,
    title: 'Fix cart totals',
    author: 'acme-dev',
    createdAt: iso(NOW - 2 * DAY),
    updatedAt: iso(NOW - 5 * MIN),
    headSha: 'a1',
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    commitCount: 1,
    ci: 'pass',
    reviewStatus: 'no reviews yet',
    seen: 'seen',
    url: 'https://example.test/acme-web/pull/1354',
    ...over,
  };
}

function issue(over: Partial<IssueSummary> = {}): IssueSummary {
  return {
    id: 'acme-api#7',
    repo: 'acme-api',
    number: 7,
    title: 'Slow search',
    author: 'build-bot',
    createdAt: iso(NOW - 3 * DAY),
    updatedAt: iso(NOW - 10 * MIN),
    url: 'https://example.test/acme-api/issues/7',
    state: 'open',
    labels: [],
    assignees: [],
    commentCount: 0,
    seen: 'seen',
    ...over,
  };
}

const inbox = (prs: PrSummary[], follows: InboxData['follows'] = {}): InboxData => ({
  viewer: 'acme-dev',
  prs,
  syncedAt: NOW,
  follows,
});
const issues = (list: IssueSummary[], mentionedIds: string[] = []): IssueInboxData => ({
  viewer: 'acme-dev',
  issues: list,
  mentionedIds,
  syncedAt: NOW,
});

function kinds(store: ActivityStore, id: string, now = NOW): string[] {
  const g = store.feed(7, now).groups.find((x) => x.item.id === id);
  return g ? g.events.map((e) => e.kind) : [];
}

describe('ActivityStore.observe', () => {
  it('records opened from createdAt on the first sighting and nothing else', () => {
    const s = ActivityStore.memory();
    s.observe(inbox([pr({ ci: 'fail', commitCount: 4 })]), issues([issue()]), NOW);
    expect(kinds(s, 'acme-web#1354')).toEqual(['opened']);
    expect(kinds(s, 'acme-api#7')).toEqual(['opened']);
    expect(s.feed(7, NOW).groups[0]?.item.id).toBe('acme-web#1354');
  });

  it('records commits, CI, review and review requests between polls', () => {
    const s = ActivityStore.memory();
    const base = pr({ author: 'build-bot' });
    s.observe(inbox([base]), undefined, NOW);
    s.observe(
      inbox([
        {
          ...base,
          commitCount: 3,
          headSha: 'b2',
          ci: 'fail',
          reviewStatus: 'changes requested',
          requested: ['acme-dev'],
        },
      ]),
      undefined,
      NOW + MIN,
    );
    const g = s.feed(7, NOW + MIN).groups[0];
    const byKind = Object.fromEntries((g?.events ?? []).map((e) => [e.kind, e]));
    expect(byKind.commits?.verb).toBe('pushed 2 commits');
    expect(byKind.ci?.verb).toBe('CI failed');
    expect(byKind.changes?.verb).toBe('requested changes');
    expect(byKind['review-requested']?.needsMe).toBe(true);
    // CI failing and changes on someone else's PR are not mine to fix.
    expect(byKind.ci?.needsMe).toBe(false);
    expect(byKind.changes?.needsMe).toBe(false);
  });

  it('flags CI failure and new reviews on the viewer own PR as needing them', () => {
    const s = ActivityStore.memory();
    s.observe(inbox([pr()]), undefined, NOW);
    s.observe(inbox([pr({ ci: 'fail', reviewStatus: '1 approval' })]), undefined, NOW + MIN);
    const events = s.feed(7, NOW + MIN).groups[0]?.events ?? [];
    expect(events.filter((e) => e.needsMe).map((e) => e.kind).sort()).toEqual(['approved', 'ci']);
  });

  it('does not repeat events when a poll shows no change', () => {
    const s = ActivityStore.memory();
    s.observe(inbox([pr()]), undefined, NOW);
    s.observe(inbox([pr({ ci: 'fail' })]), undefined, NOW + MIN);
    s.observe(inbox([pr({ ci: 'fail' })]), undefined, NOW + 2 * MIN);
    expect(kinds(s, 'acme-web#1354', NOW + 2 * MIN).filter((k) => k === 'ci')).toHaveLength(1);
  });

  it('records issue comments, mentions, assignment, labels, status and close', () => {
    const s = ActivityStore.memory();
    const a = issue({ labels: [{ name: 'bug', color: 'f00' }], status: 'Todo' });
    s.observe(inbox([]), issues([a]), NOW);
    const b = issue({
      labels: [{ name: 'perf', color: '0f0' }],
      status: 'In review',
      commentCount: 2,
      assignees: ['acme-dev'],
      state: 'closed',
    });
    s.observe(inbox([]), issues([b], ['acme-api#7']), NOW + MIN);
    expect(kinds(s, 'acme-api#7', NOW + MIN).sort()).toEqual(
      ['assigned', 'closed', 'comment', 'label-added', 'label-removed', 'mention', 'opened', 'status'].sort(),
    );
    const verbs = (s.feed(7, NOW + MIN).groups[0]?.events ?? []).map((e) => e.verb);
    expect(verbs).toContain('Label added: perf');
    expect(verbs).toContain('Label removed: bug');
    expect(verbs).toContain('Moved to In review');
  });

  it('records own merges from follows with the viewer as actor', () => {
    const s = ActivityStore.memory();
    const p = pr();
    s.observe(inbox([p]), undefined, NOW);
    s.observe(inbox([], { [p.id]: { state: 'merged', at: iso(NOW + MIN), pr: p } }), undefined, NOW + MIN);
    const merged = s.feed(7, NOW + MIN).groups[0]?.events.find((e) => e.kind === 'merged');
    expect(merged?.actor).toBe('acme-dev');
  });

  it('skips a poll that is still syncing', () => {
    const s = ActivityStore.memory();
    s.observe(inbox([pr()]), undefined, NOW);
    s.observe({ ...inbox([]), syncing: { done: 1, total: 9 } }, undefined, NOW + MIN);
    s.observe(inbox([pr({ ci: 'fail' })]), undefined, NOW + 2 * MIN);
    expect(kinds(s, 'acme-web#1354', NOW + 2 * MIN)).toContain('ci');
  });
});

describe('ActivityStore.feed', () => {
  function seeded(): ActivityStore {
    const s = ActivityStore.memory();
    // Opened 10 days ago: outside 7 days, inside 14.
    s.observe(inbox([pr({ createdAt: iso(NOW - 10 * DAY) })]), issues([issue()]), NOW);
    return s;
  }

  it('uses a 7 day window and reports older events', () => {
    const f = seeded().feed(7, NOW);
    expect(f.groups.map((g) => g.item.id)).toEqual(['acme-api#7']);
    expect(f.hasOlder).toBe(true);
  });

  it('Load older extends the window by 7 days', () => {
    const f = seeded().feed(14, NOW);
    expect(f.days).toBe(14);
    expect(f.groups.map((g) => g.item.id).sort()).toEqual(['acme-api#7', 'acme-web#1354']);
    expect(f.hasOlder).toBe(false);
  });

  it('expires events past four weeks', () => {
    const s = ActivityStore.memory();
    s.observe(inbox([pr()]), undefined, NOW);
    s.observe(inbox([pr({ ci: 'fail' })]), undefined, NOW + MIN);
    s.observe(inbox([pr({ ci: 'fail' })]), undefined, NOW + 30 * DAY);
    expect(s.feed(28, NOW + 30 * DAY).groups).toHaveLength(0);
  });

  it('clamps the window to whole weeks up to 28 days', () => {
    expect([clampDays(0), clampDays(7), clampDays(8), clampDays(100), clampDays(Number.NaN)]).toEqual([
      7, 7, 14, 28, 7,
    ]);
  });

  it('orders groups by latest event, newest first', () => {
    const s = ActivityStore.memory();
    s.observe(inbox([pr()]), issues([issue()]), NOW);
    s.observe(inbox([pr()]), issues([issue({ commentCount: 1, updatedAt: iso(NOW + MIN) })]), NOW + MIN);
    expect(s.feed(7, NOW + MIN).groups[0]?.item.id).toBe('acme-api#7');
  });

  it('keeps the last visit time', () => {
    const s = ActivityStore.memory();
    expect(s.feed(7, NOW).lastVisit).toBe(0);
    s.visit(NOW);
    expect(s.feed(7, NOW).lastVisit).toBe(NOW);
  });
});

describe('ActivityStore persistence', () => {
  it('reloads events and snapshots from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'activity-'));
    try {
      const path = join(dir, 'activity.json');
      const a = await ActivityStore.open(path);
      a.observe(inbox([pr()]), undefined, NOW);
      a.observe(inbox([pr({ ci: 'fail' })]), undefined, NOW + MIN);
      await a.flush();
      const b = await ActivityStore.open(path);
      b.observe(inbox([pr({ ci: 'fail' })]), undefined, NOW + 2 * MIN);
      expect(kinds(b, 'acme-web#1354', NOW + 2 * MIN)).toEqual(['ci', 'opened']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('GET /api/activity', () => {
  const origin = 'http://127.0.0.1:4477';
  const headers = { host: '127.0.0.1:4477', origin, 'x-nod-token': 'tok' };

  it('serves the feed built from the saved lists', async () => {
    const app = createApp({ provider: new FixtureProvider(), port: 4477, token: 'tok', activity: ActivityStore.memory() });
    const res = await app.request(`${origin}/api/activity?days=14`, { headers });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { days: number; groups: { events: { kind: string }[] }[] };
    expect(body.days).toBe(14);
    expect(body.groups.length).toBeGreaterThan(0);
    expect(body.groups.every((g) => g.events.length > 0)).toBe(true);
  });

  it('stores the visit time', async () => {
    const app = createApp({ provider: new FixtureProvider(), port: 4477, token: 'tok', activity: ActivityStore.memory() });
    const post = await app.request(`${origin}/api/activity/visit`, { method: 'POST', headers });
    expect(post.status).toBe(200);
    const feed = (await (await app.request(`${origin}/api/activity`, { headers })).json()) as { lastVisit: number };
    expect(feed.lastVisit).toBeGreaterThan(0);
  });
});
