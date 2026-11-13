import { describe, expect, it } from 'vitest';
import { ActivityStore } from '../server/activity-store';
import { activityBadge, buildActivityView } from '../shared/activity';
import type { ActivityItemRef } from '../shared/activity-types';
import type { InboxData, PrSummary } from '../shared/types';

const NOW = Date.parse('2026-11-10T15:00:00Z');
const MIN = 60_000;

const pr = (id: string, repo: string, n: number, createdMinAgo: number): PrSummary =>
  ({
    id,
    repo,
    number: n,
    title: `t${n}`,
    author: 'build-bot',
    createdAt: new Date(NOW - createdMinAgo * MIN).toISOString(),
    updatedAt: new Date(NOW - createdMinAgo * MIN).toISOString(),
    headSha: 'a',
    commitCount: 1,
    ci: 'pass',
    reviewStatus: 'needs review',
    url: `https://example.test/${n}`,
  }) as PrSummary;

const inbox = (prs: PrSummary[]): InboxData => ({ viewer: 'acme-dev', prs, syncedAt: NOW, follows: {} });

const item = (p: PrSummary): ActivityItemRef => ({ kind: 'pr', id: p.id, repo: p.repo, number: p.number, title: p.title, url: p.url });

describe('activity notices', () => {
  const a = pr('PR_a', 'acme-api', 1, 120);
  const b = pr('PR_b', 'acme-api', 2, 60);

  function seeded() {
    const store = ActivityStore.memory();
    store.observe(inbox([a, b]), undefined, NOW);
    return store;
  }

  it('attaches to an item that has events, newest first', () => {
    const store = seeded();
    store.addNotice(item(a), 'Nod notified crew-1 (approved)', 'bubble', NOW + MIN);
    store.addNotice(item(a), 'Nod: 2 sessions match, nobody notified (merge)', 'info', NOW + 2 * MIN);
    const group = store.feed(7, NOW + 3 * MIN).groups.find((g) => g.item.id === 'PR_a');
    expect(group?.notices?.map((n) => n.icon)).toEqual(['info', 'bubble']);
    expect(group?.events.every((e) => e.kind === 'opened')).toBe(true);
  });

  it('never marks an item unread, raises the badge or moves a row', () => {
    const store = seeded();
    const lastVisit = NOW + 10 * MIN;
    const before = store.feed(7, NOW + 20 * MIN);
    const order = buildActivityView(before.groups, { viewer: 'acme-dev', filter: 'all', showMine: false, lastVisit }).rows.map((r) => r.item.id);
    store.addNotice(item(a), 'Nod notified crew-1 (approved)', 'bubble', NOW + 15 * MIN);
    store.addNotice(item(a), 'Nod could not notify crew-1: terminal not writable', 'alert', NOW + 16 * MIN);
    const feed = store.feed(7, NOW + 20 * MIN);
    const view = buildActivityView(feed.groups, { viewer: 'acme-dev', filter: 'all', showMine: false, lastVisit });
    expect(view.rows.map((r) => r.item.id)).toEqual(order);
    expect(view.unseen).toBe(0);
    expect(activityBadge(feed, lastVisit)).toBe(0);
    expect(view.rows.find((r) => r.item.id === 'PR_a')?.unread).toBe(false);
    expect(view.rows.find((r) => r.item.id === 'PR_a')?.updates).toBe(1);
    expect(view.rows.find((r) => r.item.id === 'PR_a')?.notices).toHaveLength(2);
  });

  it('is not counted by the filter chips', () => {
    const store = seeded();
    store.addNotice(item(a), 'Nod notified crew-1 (approved)', 'bubble', NOW + MIN);
    const view = buildActivityView(store.feed(7, NOW + 2 * MIN).groups, { viewer: 'acme-dev', filter: 'all', showMine: false, lastVisit: 0 });
    expect(view.counts).toMatchObject({ needs: 0, mentions: 0, ci: 0, merged: 0 });
  });

  it('does not create a row for an item with no events', () => {
    const store = ActivityStore.memory();
    store.addNotice(item(a), 'Nod notified crew-1 (approved)', 'bubble', NOW);
    expect(store.feed(7, NOW).groups).toEqual([]);
  });

  it('survives a poll that diffs the lists', () => {
    const store = seeded();
    store.addNotice(item(a), 'Nod notified crew-1 (approved)', 'bubble', NOW + MIN);
    store.observe(inbox([a, b]), undefined, NOW + 5 * MIN);
    expect(store.feed(7, NOW + 6 * MIN).groups.find((g) => g.item.id === 'PR_a')?.notices).toHaveLength(1);
  });
});
