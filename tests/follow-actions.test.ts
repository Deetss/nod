import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import type { InboxState } from '../server/inbox-state';
import { IssueCache } from '../server/issue-cache';
import { ISSUE_INBOX_QUERY, MENTION_QUERY } from '../server/issue-queries';
import { PrCache } from '../server/pr-cache';
import { FOLLOW_QUERY, INBOX_QUERY, PENDING_REVIEW_QUERY, TEAMS_QUERY } from '../server/queries';
import { SeenStore } from '../server/seen';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const START = Date.parse('2026-11-08T12:00:00Z');
const NO_PAGE = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] as unknown[] };
const rate = { limit: 5000, cost: 1, remaining: 4999, resetAt: '2026-11-08T13:00:00Z' };
const viewer = { login: 'me', id: 'U1' };
const REF = { repo: 'acme-api', number: 7 };

function rawPr(state: string, autoMerge: boolean) {
  return {
    id: 'PR_7',
    number: 7,
    title: 't',
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
    repository: { name: 'acme-api' },
    author: { login: 'build-bot' },
    reviewDecision: null,
    reviewRequests: { nodes: [] },
    approvals: { totalCount: 0 },
    anyReviews: { totalCount: 0 },
    commitCount: { totalCount: 1 },
    lastCommit: { nodes: [] },
    autoMergeRequest: autoMerge ? { enabledAt: '2026-11-08T12:00:00Z' } : null,
  };
}

type Follow = () => unknown;

function setup(follow: Follow) {
  const followCalls: number[] = [];
  let now = START;
  const client = {
    lastRate: undefined,
    graphqlRate: rate,
    rest: async () => ({}),
    graphql: async (query: string) => {
      if (query === FOLLOW_QUERY) {
        followCalls.push(Date.now());
        return follow();
      }
      if (query === INBOX_QUERY) return { viewer, rateLimit: rate, search: { ...NO_PAGE, nodes: [rawPr('OPEN', false)] } };
      if (query === ISSUE_INBOX_QUERY || query === MENTION_QUERY) return { viewer, rateLimit: rate, search: NO_PAGE };
      if (query === TEAMS_QUERY) return { organization: { teams: { nodes: [] } } };
      if (query === PENDING_REVIEW_QUERY) return { repository: { pullRequest: { id: 'PR_7', headRefOid: 'abc', reviews: { nodes: [] } } } };
      return { organization: null };
    },
  } as unknown as GithubClient;
  const logs: string[] = [];
  const store = new PrCache();
  const saved: InboxState[] = [];
  const save = store.saveState.bind(store);
  store.saveState = async (state) => {
    saved.push(state);
    await save(state);
  };
  const provider = new GithubProvider(
    client,
    new SeenStore(null),
    async () => '',
    store,
    (line) => logs.push(line),
    () => now,
    new IssueCache(),
  );
  const emit = vi.fn();
  provider.subscribe(emit);
  return { provider, saved, followCalls, logs, emit, tick: (ms: number) => vi.advanceTimersByTimeAsync(ms) };
}

async function seeded(follow: Follow) {
  const s = setup(follow);
  await s.provider.poll('full');
  return s;
}

const open = (autoMerge: boolean): Follow => () => ({ repository: { pullRequest: rawPr('OPEN', autoMerge) } });

describe('following a PR after an action', () => {
  beforeEach(() => vi.useFakeTimers({ now: START }));
  afterEach(() => vi.useRealTimers());

  it('moves a PR that merged by the 10 s check to closed and emits once', async () => {
    let calls = 0;
    const s = await seeded(() => {
      calls += 1;
      return { repository: { pullRequest: calls < 2 ? rawPr('OPEN', true) : rawPr('MERGED', false) } };
    });
    const lastSync = s.provider.syncState().prs;
    s.emit.mockClear();
    await s.provider.review(REF, 'APPROVE', '');
    await s.tick(3 * SECOND);
    expect(s.emit).not.toHaveBeenCalled();
    await s.tick(7 * SECOND);
    const state = s.saved[s.saved.length - 1];
    expect(state?.prs['PR_7']).toBeUndefined();
    expect(state?.closed['acme-api#7']).toBeDefined();
    expect(state?.lastSync).toBe(START);
    expect(s.emit).toHaveBeenCalledTimes(1);
    expect(s.provider.syncState().prs).toBe(lastSync);
    await s.tick(10 * MINUTE);
    expect(s.followCalls).toHaveLength(2);
  });

  it('checks an open auto-merge PR every 60 s and stops after 30 minutes', async () => {
    const s = await seeded(open(true));
    await s.provider.review(REF, 'APPROVE', '');
    await s.tick(30 * MINUTE);
    // 3, 10, 30, 60, 120 s, then every 60 s up to 1800 s.
    expect(s.followCalls).toHaveLength(5 + 28);
    await s.tick(10 * MINUTE);
    expect(s.followCalls).toHaveLength(5 + 28);
  });

  it('stops after the 120 s check when auto-merge is not set', async () => {
    const s = await seeded(open(false));
    await s.provider.review(REF, 'APPROVE', '');
    await s.tick(10 * MINUTE);
    expect(s.followCalls).toHaveLength(5);
  });

  it('restarts the schedule on a second action', async () => {
    const s = await seeded(open(false));
    await s.provider.review(REF, 'APPROVE', '');
    await s.tick(20 * SECOND);
    expect(s.followCalls).toHaveLength(2);
    await s.provider.review(REF, 'COMMENT', '');
    await s.tick(10 * MINUTE);
    expect(s.followCalls).toHaveLength(2 + 5);
  });

  it('logs a failed check and still runs the next one', async () => {
    let calls = 0;
    const s = await seeded(() => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return open(false)();
    });
    await s.provider.review(REF, 'APPROVE', '');
    await s.tick(10 * SECOND);
    expect(s.followCalls).toHaveLength(2);
    expect(s.logs.filter((l) => l.includes('boom'))).toHaveLength(1);
  });
});
