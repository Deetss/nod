import { describe, expect, it } from 'vitest';
import {
  applyDelta,
  applyFull,
  CLOSED_TTL_MS,
  EMPTY_STATE,
  expireClosed,
  type InboxState,
} from '../server/inbox-state';
import { deltaSearch, fullSearch } from '../server/queries';
import type { PrSummary } from '../shared/types';

function pr(id: string, over: Partial<PrSummary> = {}): PrSummary {
  return {
    id,
    repo: 'acme-api',
    number: Number(id.slice(2)),
    title: 't',
    author: 'a',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    headSha: 'aaa',
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commitCount: 1,
    ci: 'pass',
    reviewStatus: 'needs review',
    seen: 'seen',
    url: 'u',
    ...over,
  };
}

const T0 = Date.parse('2026-11-06T12:00:00Z');
const base = (): InboxState => applyFull(EMPTY_STATE, 'me', [pr('PR1'), pr('PR2')], T0);

describe('search strings', () => {
  it('asks for every open org PR on a full sweep', () => {
    expect(fullSearch(['acme-co'])).toBe('is:open is:pr org:acme-co');
  });

  it('reaches back two minutes and drops is:open on a delta', () => {
    expect(deltaSearch(['acme-co'], T0, 120_000)).toBe(
      'is:pr org:acme-co updated:>=2026-11-06T11:58:00Z',
    );
  });
});

describe('applyDelta', () => {
  it('replaces an updated PR', () => {
    const next = applyDelta(
      base(),
      'me',
      [{ pr: pr('PR1', { headSha: 'bbb' }), open: true }],
      T0 + 60_000,
    );
    expect(next.prs.PR1?.headSha).toBe('bbb');
    expect(Object.keys(next.prs)).toHaveLength(2);
    expect(next.lastSync).toBe(T0 + 60_000);
  });

  it('adds a new PR', () => {
    const next = applyDelta(base(), 'me', [{ pr: pr('PR3'), open: true }], T0 + 60_000);
    expect(Object.keys(next.prs).sort()).toEqual(['PR1', 'PR2', 'PR3']);
  });

  it('removes a closed or merged PR and records when it closed', () => {
    const next = applyDelta(
      base(),
      'me',
      [{ pr: pr('PR2'), open: false, closedAt: '2026-11-06T12:30:00Z' }],
      T0 + 60_000,
    );
    expect(next.prs.PR2).toBeUndefined();
    expect(next.closed['acme-api#2']).toBe(Date.parse('2026-11-06T12:30:00Z'));
  });

  it('does not touch PRs missing from the delta', () => {
    const next = applyDelta(base(), 'me', [], T0 + 60_000);
    expect(next.prs).toEqual(base().prs);
  });
});

describe('applyFull and expiry', () => {
  it('treats PRs missing from a sweep as closed', () => {
    const next = applyFull(base(), 'me', [pr('PR1')], T0 + 900_000);
    expect(Object.keys(next.prs)).toEqual(['PR1']);
    expect(next.closed['acme-api#2']).toBe(T0 + 900_000);
  });

  it('expires closed PRs after seven days only', () => {
    const state = applyFull(base(), 'me', [pr('PR1')], T0);
    expect(expireClosed(state, T0 + CLOSED_TTL_MS - 1).expired).toEqual([]);
    const late = expireClosed(state, T0 + CLOSED_TTL_MS + 1);
    expect(late.expired).toEqual(['acme-api#2']);
    expect(late.state.closed).toEqual({});
  });
});

describe('shipped PRs', () => {
  const at = (ms: number) => new Date(ms).toISOString();
  const closedRow = (p: PrSummary, merged: boolean, closedMs = T0) => ({ pr: p, open: false, closedAt: at(closedMs), merged });

  it('records the viewer\'s merged and closed PRs, newest first, including one never seen open', () => {
    const fast = pr('PR7', { author: 'ME' });
    const next = applyDelta(base(), 'me', [closedRow(pr('PR1', { author: 'me' }), true), closedRow(fast, false, T0 + 5)], T0 + 10);
    expect(next.shipped.map((s) => [s.number, s.merged])).toEqual([
      [7, false],
      [1, true],
    ]);
  });

  it('counts a bot PR the viewer is assigned to, and ignores other people\'s PRs', () => {
    const bot = pr('PR3', { author: 'app/helper-bot', assignees: ['me'] });
    const next = applyDelta(base(), 'me', [closedRow(bot, true), closedRow(pr('PR2'), true)], T0);
    expect(next.shipped.map((s) => s.number)).toEqual([3]);
  });

  it('adds each PR once when the delta overlap or a follow sees it again', () => {
    const mine = closedRow(pr('PR1', { author: 'me' }), true);
    const once = applyDelta(base(), 'me', [mine], T0);
    expect(applyDelta(once, 'me', [mine], T0 + 60_000).shipped).toHaveLength(1);
  });

  it('skips a PR that closed long ago and only got a new comment', () => {
    const old = closedRow(pr('PR1', { author: 'me' }), true, T0 - 2 * 60 * 60 * 1000);
    expect(applyDelta(base(), 'me', [old], T0).shipped).toEqual([]);
  });
});
