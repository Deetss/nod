// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { IssueInboxData, IssueSummary } from '../shared/issue-types';
import { exactFirst, matchesQuery, parseNumberQuery } from '../shared/number-query';
import type { PrSummary } from '../shared/types';
import { ApiError } from '../server/github-client';
import { lookupNumber } from '../server/number-lookup';
import { filterPrs } from '../web/inbox-utils';
import { DEFAULT_ISSUE_FILTER, buildIssueSections } from '../web/issues/issue-filter';
import { mergeHits, missText, planSearch, type SearchItem } from '../web/search-logic';

describe('parseNumberQuery', () => {
  it.each([
    ['10', { number: 10 }],
    ['#10', { number: 10 }],
    ['  #10 ', { number: 10 }],
    ['Acme-Web#10', { number: 10, repo: 'Acme-Web' }],
    ['acme-web #10', { number: 10, repo: 'acme-web' }],
    ['acme-co/acme-web#10', { number: 10, repo: 'acme-web', owner: 'acme-co' }],
    ['acme-api#1343', { number: 1343, repo: 'acme-api' }],
  ])('reads %j', (text, want) => {
    expect(parseNumberQuery(text)).toEqual(want);
  });

  it.each(['', '#', '#abc', '10abc', 'abc', '0', '#0', 'repo#', 'a/b/c#1', '1.5', '-3'])('rejects %j', (text) => {
    expect(parseNumberQuery(text)).toBeUndefined();
  });
});

const ref = (repo: string, number: number) => ({ repo, number });

describe('matchesQuery', () => {
  it('matches a bare or hashed number exactly, not as a substring', () => {
    expect(matchesQuery(ref('acme-co/acme-api', 10), '10', 'x')).toBe(true);
    expect(matchesQuery(ref('acme-co/acme-api', 10), '#10', 'x')).toBe(true);
    expect(matchesQuery(ref('acme-co/acme-api', 100), '10', 'x')).toBe(false);
    expect(matchesQuery(ref('acme-co/acme-api', 1), '10', 'x')).toBe(false);
  });

  it('still matches a number inside the text', () => {
    expect(matchesQuery(ref('acme-co/acme-api', 3), '10', 'Upgrade to Rails 10')).toBe(true);
  });

  it('pins repo and org case-insensitively, with or without the org', () => {
    expect(matchesQuery(ref('acme-co/acme-web', 10), 'acme-web#10', '')).toBe(true);
    expect(matchesQuery(ref('acme-co/acme-web', 10), 'ACME-CO/Acme-Web#10', '')).toBe(true);
    expect(matchesQuery(ref('acme-co/acme-api', 10), 'acme-web#10', '')).toBe(false);
    expect(matchesQuery(ref('acme-co/acme-web', 10), 'other-org/acme-web#10', '')).toBe(false);
  });

  it('keeps plain text matching', () => {
    expect(matchesQuery(ref('acme-co/acme-api', 1), 'EXPORT', 'Export drops column')).toBe(true);
    expect(matchesQuery(ref('acme-co/acme-api', 1), 'nope', 'Export drops column')).toBe(false);
  });
});

describe('exactFirst', () => {
  it('moves exact number matches ahead and keeps the rest in order', () => {
    const items = [ref('a', 8), ref('a', 7), ref('b', 10), ref('c', 10)];
    expect(exactFirst(items, '10')).toEqual([ref('b', 10), ref('c', 10), ref('a', 8), ref('a', 7)]);
  });

  it('leaves text queries alone', () => {
    const items = [ref('a', 8), ref('b', 10)];
    expect(exactFirst(items, 'fix')).toEqual(items);
  });
});

function issue(over: Partial<IssueSummary> & { id: string; number: number }): IssueSummary {
  return {
    repo: 'acme-dev/notes',
    title: 't',
    author: 'build-bot',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    url: 'u',
    state: 'open',
    labels: [],
    assignees: [],
    commentCount: 0,
    seen: 'seen',
    ...over,
  };
}

describe('issue list filter by number', () => {
  const issues = [
    issue({ id: 'n8', number: 8, title: 'Banner font', updatedAt: '2026-11-09T00:00:00Z' }),
    issue({ id: 'n7', number: 7, title: 'Upgrade to node 10', updatedAt: '2026-11-08T00:00:00Z' }),
    issue({ id: 'n6', number: 6, title: 'Spacing', updatedAt: '2026-11-07T00:00:00Z' }),
    issue({ id: 'n10', number: 10, title: 'Preview photo', updatedAt: '2026-11-01T00:00:00Z' }),
    issue({ id: 'n100', number: 100, title: 'Other', updatedAt: '2026-11-06T00:00:00Z' }),
  ];
  const data: IssueInboxData = { viewer: 'acme-dev', issues, mentionedIds: [], syncedAt: 0 };
  const all = (text: string) =>
    buildIssueSections(data, { ...DEFAULT_ISSUE_FILTER, text }, new Set()).find((s) => s.key === 'all')?.issues.map((i) => i.id);

  it('shows #10 first, then the title match, and drops unrelated issues', () => {
    expect(all('10')).toEqual(['n10', 'n7']);
    expect(all('#10')).toEqual(['n10']);
  });
});

function pr(id: string, number: number, title: string): PrSummary {
  return {
    id, repo: 'acme-co/acme-api', number, title, author: 'mlopez', createdAt: '', updatedAt: '', headSha: '',
    additions: 0, deletions: 0, changedFiles: 0, commitCount: 1, ci: 'pass', reviewStatus: '', seen: 'seen', url: '',
  };
}

describe('PR list filter by number', () => {
  it('puts the exact PR first and skips #100', () => {
    const prs = [pr('a', 9, 'bump to 10.2'), pr('b', 100, 'other'), pr('c', 10, 'fix')];
    expect(filterPrs(prs, '10').map((p) => p.id)).toEqual(['c', 'a']);
  });
});

const item = (kind: SearchItem['kind'], repo: string, number: number, title = 't'): SearchItem => ({
  id: `${kind}:${repo}#${number}`, kind, repo, number, title, extra: '',
});

describe('top-bar planSearch', () => {
  const items = [
    item('pr', 'acme-co/acme-api', 10), item('issue', 'acme-co/acme-web', 10), item('issue', 'acme-co/acme-web', 8, 'about 10'),
    item('pr', 'acme-dev/tools', 12),
  ];

  it('lists every PR and issue with the number and asks only repos without one', () => {
    const plan = planSearch(items, '#10', 'pr');
    expect(plan.results.map((r) => r.id)).toEqual(['pr:acme-co/acme-api#10', 'issue:acme-co/acme-web#10']);
    expect(plan.lookup).toEqual(['acme-dev/tools']);
  });

  it('pins Repo#n to that repo, asking GitHub only when it is not listed locally', () => {
    expect(planSearch(items, 'acme-web#10', 'pr')).toMatchObject({ lookup: [], repos: ['acme-co/acme-web'] });
    expect(planSearch(items, 'Tools#10', 'pr')).toMatchObject({ results: [], lookup: ['acme-dev/tools'] });
    expect(planSearch(items, 'unknown#10', 'pr')).toMatchObject({ results: [], lookup: [], repos: [] });
  });

  it('keeps text search on the current view', () => {
    expect(planSearch(items, 'about', 'issue').results).toHaveLength(1);
    expect(planSearch(items, 'about', 'pr').results).toHaveLength(0);
  });

  it('merges lookup hits after local results and words the miss', () => {
    const merged = mergeHits([item('pr', 'acme-co/acme-api', 10)], [
      { kind: 'issue', repo: 'acme-dev/tools', number: 10, title: 'x', url: 'https://github.com/x' },
      { kind: 'pr', repo: 'acme-co/acme-api', number: 10, title: 't', url: 'u' },
    ]);
    expect(merged.map((m) => m.id)).toEqual(['pr:acme-co/acme-api#10', 'issue:acme-dev/tools#10']);
    expect(missText(10, ['acme-co/acme-web', 'acme-co/acme-api'])).toBe('No issue or PR #10 in acme-co/acme-web, acme-co/acme-api');
  });
});

describe('lookupNumber (top-bar fallback fetch)', () => {
  const notFound = () => Promise.reject(new ApiError('Not Found', 'http', 404));

  it('makes one call per repo and maps PRs and issues', async () => {
    const rest = vi.fn((path: string) => {
      if (path === `/repos/acme-dev/tools/issues/10`) {
        return Promise.resolve({ number: 10, title: 'feat: retry', html_url: 'https://github.com/pr', pull_request: {} });
      }
      if (path === `/repos/acme-co/acme-web/issues/10`) {
        return Promise.resolve({ number: 10, title: 'Preview', html_url: 'https://github.com/issue' });
      }
      return notFound();
    });
    const hits = await lookupNumber({ rest } as never, 10, ['acme-dev/tools', 'acme-co/acme-web', 'acme-co/acme-api']);
    expect(rest).toHaveBeenCalledTimes(3);
    expect(new Set(rest.mock.calls.map((c) => c[0])).size).toBe(3);
    expect(hits).toEqual([
      { kind: 'pr', repo: 'acme-dev/tools', number: 10, title: 'feat: retry', url: 'https://github.com/pr' },
      { kind: 'issue', repo: 'acme-co/acme-web', number: 10, title: 'Preview', url: 'https://github.com/issue' },
    ]);
  });

  it('returns nothing on a miss and fails on a rate limit', async () => {
    await expect(lookupNumber({ rest: vi.fn(notFound) } as never, 10, ['acme-co/acme-api'])).resolves.toEqual([]);
    const limited = vi.fn(() => Promise.reject(new ApiError('limit', 'ratelimit', 403)));
    await expect(lookupNumber({ rest: limited } as never, 10, ['acme-co/acme-api'])).rejects.toThrow('limit');
  });

  it('makes no call for an empty repo list', async () => {
    const rest = vi.fn();
    await expect(lookupNumber({ rest } as never, 10, [])).resolves.toEqual([]);
    expect(rest).not.toHaveBeenCalled();
  });
});
