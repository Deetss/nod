import { describe, expect, it, vi } from 'vitest';
import type { GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import { IssueCache } from '../server/issue-cache';
import { ISSUE_INBOX_QUERY, MENTION_QUERY } from '../server/issue-queries';
import { PrCache } from '../server/pr-cache';
import { INBOX_QUERY, TEAMS_QUERY } from '../server/queries';
import { SeenStore } from '../server/seen';

const NO_PAGE = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] as unknown[] };
const rate = { limit: 5000, cost: 1, remaining: 4999, resetAt: '2026-11-08T13:00:00Z' };
const viewer = { login: 'me', id: 'U1' };
const NO_FILES = { mode: 'all' as const, range: '', baseGone: false, files: [], commitsInRange: 0 };

const rawPr = {
  id: 'PR_42',
  number: 42,
  title: 'Add rate-limit headers',
  url: 'u',
  isDraft: false,
  state: 'OPEN',
  closedAt: null,
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
  approvals: { totalCount: 0 },
  anyReviews: { totalCount: 0 },
  commitCount: { totalCount: 1 },
  lastCommit: { nodes: [] },
  autoMergeRequest: null,
};

/** A provider whose inbox lists one PR, with `diff` stubbed so warming makes no requests. */
function setup() {
  const client = {
    hasToken: true,
    lastRate: undefined,
    graphqlRate: rate,
    rest: async () => ({}),
    graphql: async (query: string) => {
      if (query === INBOX_QUERY) return { viewer, rateLimit: rate, search: { ...NO_PAGE, nodes: [rawPr] } };
      if (query === ISSUE_INBOX_QUERY || query === MENTION_QUERY) return { viewer, rateLimit: rate, search: NO_PAGE };
      if (query === TEAMS_QUERY) return { organization: { teams: { nodes: [] } } };
      return { organization: null };
    },
  } as unknown as GithubClient;
  const provider = new GithubProvider(client, new SeenStore(null), async () => '', new PrCache(), () => {}, Date.now, new IssueCache());
  const diff = vi.spyOn(provider, 'diff').mockResolvedValue(NO_FILES);
  return { provider, diff };
}

describe('inbox prefetch', () => {
  it('reads detail and files for each listed PR after the first poll', async () => {
    const { provider, diff } = setup();
    await provider.poll('full');
    await provider.whenWarm();
    expect(diff).toHaveBeenCalledWith({ repo: 'acme-web', number: 42 }, 'all');
  });

  it('does not warm again when a poll changes nothing', async () => {
    const { provider, diff } = setup();
    await provider.poll('full');
    await provider.whenWarm();
    await provider.poll('full');
    await provider.whenWarm();
    expect(diff).toHaveBeenCalledTimes(1);
  });

  it('skips warming when the budget is low', async () => {
    const { provider, diff } = setup();
    vi.spyOn(provider, 'budget').mockReturnValue({ ...rate, remaining: 100 });
    await provider.poll('full');
    await provider.whenWarm();
    expect(diff).not.toHaveBeenCalled();
  });
});
