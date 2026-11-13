import { describe, expect, it, vi } from 'vitest';
import {
  CLOSED_ISSUE_QUERY,
  CLOSED_PR_QUERY,
  closedSearch,
  fetchClosedPage,
  toClosedIssue,
  toClosedPr,
  type RawClosedIssue,
  type RawClosedPr,
} from '../server/closed';
import { FixtureProvider } from '../server/fixture-provider';

const NOW = Date.parse('2026-11-12T12:00:00Z');

const rawPr = (over: Partial<RawClosedPr> = {}): RawClosedPr => ({
  id: 'PR_1',
  number: 7,
  title: 'Fix date picker timezone',
  url: 'https://github.com/acme-co/acme-web/pull/7',
  closedAt: '2026-11-11T09:00:00Z',
  createdAt: '2026-11-08T09:00:00Z',
  updatedAt: '2026-11-11T09:00:00Z',
  additions: 14,
  deletions: 3,
  changedFiles: 2,
  headRefOid: 'abc1234',
  headRefName: 'fix/tz',
  merged: true,
  mergedBy: { login: 'acme-dev' },
  repository: { name: 'acme-web' },
  author: { login: 'acme-dev' },
  commitCount: { totalCount: 1 },
  ...over,
});

const rawIssue = (over: Partial<RawClosedIssue> = {}): RawClosedIssue => ({
  id: 'I_1',
  number: 9,
  title: 'Retry webhook deliveries',
  url: 'https://github.com/acme-co/acme-api/issues/9',
  state: 'CLOSED',
  stateReason: 'COMPLETED',
  closedAt: '2026-11-10T09:00:00Z',
  createdAt: '2026-11-01T09:00:00Z',
  updatedAt: '2026-11-10T09:00:00Z',
  repository: { name: 'acme-api' },
  author: { login: 'build-bot' },
  labels: { nodes: [{ name: 'bug', color: 'd73a4a' }] },
  assignees: { nodes: [{ login: 'acme-dev' }] },
  commentCount: { totalCount: 2 },
  ...over,
});

describe('closedSearch', () => {
  it('asks for closed PRs in the org since the window start', () => {
    const q = closedSearch('prs', ['acme-co'], 30, NOW);
    expect(q).toContain('is:pr is:closed org:acme-co');
    expect(q).toContain('closed:>=2026-10-13T12:00:00Z');
  });

  it('asks for closed issues over a 90 day window', () => {
    const q = closedSearch('issues', ['acme-co', 'acme-dev'], 90, NOW);
    expect(q).toContain('is:issue is:closed org:acme-co org:acme-dev');
    expect(q).toContain('closed:>=2026-08-14T12:00:00Z');
  });

  it('never asks for open items', () => {
    expect(closedSearch('prs', ['acme-co'], 30, NOW)).not.toContain('is:open');
  });
});

describe('closed queries', () => {
  it('page 100 at a time and leave out the fan-out fields', () => {
    for (const q of [CLOSED_PR_QUERY, CLOSED_ISSUE_QUERY]) {
      expect(q).toContain('first: 100');
      expect(q).toContain('rateLimit { limit cost remaining resetAt }');
      expect(q).not.toContain('reviews');
      expect(q).not.toContain('statusCheckRollup');
    }
  });

  it('read stateReason for issues and mergedBy for PRs', () => {
    expect(CLOSED_ISSUE_QUERY).toContain('stateReason');
    expect(CLOSED_PR_QUERY).toContain('mergedBy { login }');
  });
});

describe('toClosedPr', () => {
  it('maps a merged PR with its full owner/name repo', () => {
    const pr = toClosedPr(rawPr());
    expect(pr).toMatchObject({
      repo: 'acme-co/acme-web',
      merged: true,
      mergedBy: 'acme-dev',
      closedAt: '2026-11-11T09:00:00Z',
      seen: 'seen',
    });
  });

  it('maps a closed PR without a merger', () => {
    const pr = toClosedPr(rawPr({ merged: false, mergedBy: null }));
    expect(pr.merged).toBe(false);
    expect(pr).not.toHaveProperty('mergedBy');
  });

  it('falls back to updatedAt when GitHub has no closedAt', () => {
    expect(toClosedPr(rawPr({ closedAt: null })).closedAt).toBe('2026-11-11T09:00:00Z');
  });
});

describe('toClosedIssue', () => {
  it('maps completed and not planned', () => {
    expect(toClosedIssue(rawIssue()).closeReason).toBe('COMPLETED');
    expect(toClosedIssue(rawIssue({ stateReason: 'NOT_PLANNED' })).closeReason).toBe('NOT_PLANNED');
  });

  it('reads a missing reason as completed', () => {
    expect(toClosedIssue(rawIssue({ stateReason: null })).closeReason).toBe('COMPLETED');
  });

  it('is closed and carries its labels and assignees', () => {
    const i = toClosedIssue(rawIssue());
    expect(i).toMatchObject({ state: 'closed', repo: 'acme-co/acme-api', assignees: ['acme-dev'] });
    expect(i.labels).toEqual([{ name: 'bug', color: 'd73a4a' }]);
  });
});

describe('fetchClosedPage', () => {
  const response = (nodes: unknown[], hasNextPage: boolean) => ({
    rateLimit: { limit: 5000, cost: 3, remaining: 4990, resetAt: '2026-11-12T13:00:00Z' },
    search: { pageInfo: { hasNextPage, endCursor: hasNextPage ? 'CUR1' : null }, nodes },
  });

  it('returns newest first, drops empty nodes and passes the cursor on', async () => {
    const older = rawPr({ id: 'PR_old', closedAt: '2026-11-01T00:00:00Z' });
    const newer = rawPr({ id: 'PR_new', closedAt: '2026-11-11T00:00:00Z' });
    const graphql = vi.fn().mockResolvedValue(response([older, {}, newer], true));
    const page = await fetchClosedPage({ graphql }, () => undefined, {
      kind: 'prs',
      orgs: ['acme-co'],
      window: 30,
      after: undefined,
      now: NOW,
    });
    expect(page.items.map((i) => i.id)).toEqual(['PR_new', 'PR_old']);
    expect(page).toMatchObject({ hasMore: true, cursor: 'CUR1' });
    expect(graphql.mock.calls[0]?.[1]).toMatchObject({ after: null });
  });

  it('sends the cursor for a later page and reports no more at the end', async () => {
    const graphql = vi.fn().mockResolvedValue(response([rawIssue()], false));
    const page = await fetchClosedPage({ graphql }, () => undefined, {
      kind: 'issues',
      orgs: ['acme-co'],
      window: 90,
      after: 'CUR1',
      now: NOW,
    });
    expect(graphql.mock.calls[0]?.[1]).toMatchObject({ after: 'CUR1' });
    expect(page.hasMore).toBe(false);
    expect(page).not.toHaveProperty('cursor');
  });

  it('logs the rate-limit cost of the page', async () => {
    const lines: string[] = [];
    const graphql = vi.fn().mockResolvedValue(response([rawPr()], false));
    await fetchClosedPage({ graphql }, (l) => lines.push(l), {
      kind: 'prs',
      orgs: ['acme-co'],
      window: 30,
      after: undefined,
      now: NOW,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('first page');
    expect(lines[0]).toContain('cost=3');
    expect(lines[0]).toContain('remaining=4990');
    expect(lines[0]).toContain('items=1');
  });
});

describe('fixture provider closed pages', () => {
  it('pages the 30 day PRs, then ends', async () => {
    const fx = new FixtureProvider();
    const first = await fx.closed('prs', 30, undefined, undefined);
    expect(first.items).toHaveLength(4);
    expect(first.hasMore).toBe(true);
    const second = await fx.closed('prs', 30, first.cursor, undefined);
    expect(second.items.length).toBeGreaterThan(0);
    expect(second.hasMore).toBe(false);
  });

  it('shows more issues over 90 days than over 30', async () => {
    const fx = new FixtureProvider();
    const count = async (w: 30 | 90) => {
      let n = 0;
      let after: string | undefined;
      for (;;) {
        const page = await fx.closed('issues', w, after, undefined);
        n += page.items.length;
        if (!page.hasMore) return n;
        after = page.cursor;
      }
    };
    expect(await count(90)).toBeGreaterThan(await count(30));
  });

  it('answers empty for the empty state', async () => {
    const page = await new FixtureProvider().closed('prs', 30, undefined, 'closed-empty');
    expect(page).toMatchObject({ items: [], hasMore: false });
  });
});
