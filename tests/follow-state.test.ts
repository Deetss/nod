import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import { IssueCache } from '../server/issue-cache';
import { ISSUE_INBOX_QUERY, MENTION_QUERY } from '../server/issue-queries';
import { PrCache } from '../server/pr-cache';
import { FOLLOW_QUERY, INBOX_QUERY, MERGE_STATE_QUERY, PENDING_REVIEW_QUERY, TEAMS_QUERY } from '../server/queries';
import { SeenStore } from '../server/seen';

const SECOND = 1000;
const START = Date.parse('2026-11-08T12:00:00Z');
const NO_PAGE = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] as unknown[] };
const rate = { limit: 5000, cost: 1, remaining: 4999, resetAt: '2026-11-08T13:00:00Z' };
const viewer = { login: 'me', id: 'U1' };
const REF = { repo: 'acme-web', number: 42 };

function rawPr(state: string, autoMerge: boolean, approvals = 0) {
  return {
    id: 'PR_42',
    number: 42,
    title: 'Add rate-limit headers',
    url: 'u',
    isDraft: false,
    state,
    closedAt: state === 'OPEN' ? null : '2026-11-08T12:00:05Z',
    createdAt: '2026-11-08T10:00:00Z',
    updatedAt: '2026-11-08T10:00:00Z',
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    headRefOid: 'h'.padEnd(40, '0'),
    repository: { name: 'acme-web' },
    author: { login: 'me' },
    reviewDecision: null,
    reviewRequests: { nodes: [] },
    approvals: { totalCount: approvals },
    anyReviews: { totalCount: approvals },
    commitCount: { totalCount: 1 },
    lastCommit: { nodes: [] },
    autoMergeRequest: autoMerge ? { enabledAt: '2026-11-08T12:00:00Z' } : null,
  };
}

const mergeState = {
  viewer: { login: 'me' },
  repository: {
    viewerPermission: 'ADMIN',
    pullRequest: {
      id: 'PR_42',
      title: 'Add rate-limit headers',
      state: 'OPEN',
      isDraft: false,
      baseRefName: 'main',
      headRefName: 'f',
      author: { login: 'me' },
      viewerCanMergeAsAdmin: true,
      commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS', contexts: { nodes: [] } } } }] },
    },
  },
};

async function seeded(follow: () => unknown) {
  const client = {
    lastRate: undefined,
    graphqlRate: rate,
    rest: async () => ({}),
    graphql: async (query: string) => {
      if (query === FOLLOW_QUERY) return follow();
      if (query === MERGE_STATE_QUERY) return mergeState;
      if (query === INBOX_QUERY) return { viewer, rateLimit: rate, search: { ...NO_PAGE, nodes: [rawPr('OPEN', false)] } };
      if (query === ISSUE_INBOX_QUERY || query === MENTION_QUERY) return { viewer, rateLimit: rate, search: NO_PAGE };
      if (query === TEAMS_QUERY) return { organization: { teams: { nodes: [] } } };
      if (query === PENDING_REVIEW_QUERY) return { repository: { pullRequest: { id: 'PR_42', headRefOid: 'abc', reviews: { nodes: [] } } } };
      return { organization: null };
    },
  } as unknown as GithubClient;
  const provider = new GithubProvider(client, new SeenStore(null), async () => '', new PrCache(), () => {}, Date.now, new IssueCache());
  await provider.poll('full');
  const follows = async () => (await provider.inbox(undefined, 'none')).follows;
  return { provider, follows, tick: (ms: number) => vi.advanceTimersByTimeAsync(ms) };
}

const polled = (state: string, autoMerge: boolean, approvals = 0) => () => ({
  repository: { pullRequest: rawPr(state, autoMerge, approvals) },
});

describe('follows in the inbox response', () => {
  beforeEach(() => vi.useFakeTimers({ now: START }));
  afterEach(() => vi.useRealTimers());

  it('starts empty', async () => {
    const s = await seeded(polled('OPEN', false));
    expect(await s.follows()).toEqual({});
  });

  it('sets auto-merge at once after a successful merge action', async () => {
    const s = await seeded(polled('OPEN', true));
    await s.provider.merge(REF);
    expect(await s.follows()).toEqual({ PR_42: { state: 'auto-merge', at: new Date(START).toISOString() } });
  });

  it('keeps auto-merge while polls report it and clears it when they do not', async () => {
    let on = true;
    const s = await seeded(() => polled('OPEN', on)());
    await s.provider.merge(REF);
    await s.tick(10 * SECOND);
    expect((await s.follows()).PR_42?.state).toBe('auto-merge');
    on = false;
    await s.tick(20 * SECOND);
    expect(await s.follows()).toEqual({});
  });

  it('sets merging after admin merge', async () => {
    const s = await seeded(polled('OPEN', false));
    await s.provider.adminMerge(REF);
    expect((await s.follows()).PR_42?.state).toBe('merging');
  });

  it('moves to merged on MERGED, keeps the last summary, and drops it after 10 s', async () => {
    const s = await seeded(polled('MERGED', false));
    await s.provider.adminMerge(REF);
    await s.tick(3 * SECOND);
    const merged = (await s.follows()).PR_42;
    expect(merged?.state).toBe('merged');
    expect(merged?.pr?.number).toBe(42);
    expect(merged?.at).toBe(new Date(START + 3 * SECOND).toISOString());
    await s.tick(10 * SECOND - 1);
    expect((await s.follows()).PR_42?.state).toBe('merged');
    await s.tick(1);
    expect(await s.follows()).toEqual({});
  });

  it('sets approved after APPROVE and clears it after 6 s', async () => {
    const s = await seeded(polled('OPEN', false));
    await s.provider.review(REF, 'APPROVE', '');
    expect((await s.follows()).PR_42?.state).toBe('approved');
    await s.tick(3 * SECOND);
    expect((await s.follows()).PR_42?.state).toBe('approved');
    await s.tick(3 * SECOND);
    expect(await s.follows()).toEqual({});
  });

  it('clears approved when a re-check updates the row', async () => {
    const s = await seeded(polled('OPEN', false, 1));
    await s.provider.review(REF, 'APPROVE', '');
    await s.tick(3 * SECOND);
    expect(await s.follows()).toEqual({});
  });

  it('does not mark approved for a plain comment review', async () => {
    const s = await seeded(polled('OPEN', false));
    await s.provider.review(REF, 'COMMENT', '');
    expect(await s.follows()).toEqual({});
  });
});
