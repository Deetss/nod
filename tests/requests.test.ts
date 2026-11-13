import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DiskCache } from '../server/disk-cache';
import { ApiError, GithubClient, type Stored } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import { detailKey, PrCache } from '../server/pr-cache';
import { ISSUE_INBOX_QUERY, MENTION_QUERY } from '../server/issue-queries';
import { CHECKS_QUERY, INBOX_QUERY, MERGE_STATE_QUERY, TEAMS_QUERY } from '../server/queries';
import { ProjectConfig } from '../server/project-config';
import { SeenStore } from '../server/seen';
import { DEFAULT_SETTINGS } from '../shared/settings';

const TOKEN = 'ghp_test_token_value';

function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), { status, headers });
}

describe('GithubClient.restConditional', () => {
  it('sends If-None-Match and reuses the stored body on a 304', async () => {
    const seen: Record<string, string>[] = [];
    const lines: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen.push({ ...(init.headers as Record<string, string>) });
      return seen.length === 1
        ? res(200, [{ filename: 'a.rb' }], { etag: 'W/"abc"' })
        : res(304, null);
    }) as unknown as typeof fetch;
    const client = new GithubClient(TOKEN, fetchImpl, (l) => lines.push(l));

    const first = await client.restConditional<{ filename: string }[]>('/repos/o/r/pulls/1/files');
    expect(first.etag).toBe('W/"abc"');
    expect(seen[0]?.['If-None-Match']).toBeUndefined();

    const second = await client.restConditional('/repos/o/r/pulls/1/files', first);
    expect(seen[1]?.['If-None-Match']).toBe('W/"abc"');
    expect(second.body).toEqual([{ filename: 'a.rb' }]);

    expect(lines).toEqual([
      '[gh] GET /repos/o/r/pulls/1/files cost=1 cache=miss',
      '[gh] GET /repos/o/r/pulls/1/files cost=0 cache=hit',
    ]);
    expect(lines.join('\n')).not.toContain(TOKEN);
  });

  it('records real GraphQL cost and logs the operation name only', async () => {
    const lines: string[] = [];
    const rateLimit = { limit: 5000, cost: 2, remaining: 4990, resetAt: 'r' };
    const fetchImpl = (async () => res(200, { data: { rateLimit, secret: 'body' } })) as unknown as typeof fetch;
    const client = new GithubClient(TOKEN, fetchImpl, (l) => lines.push(l));
    await client.graphql(INBOX_QUERY, { q: 'x', after: null }, 'InboxSync:delta');
    expect(client.graphqlRate?.cost).toBe(2);
    expect(lines).toEqual(['[gh] POST InboxSync:delta cost=2 cache=miss']);
    expect(lines.join('\n')).not.toContain('body');
  });
});

const rate = { limit: 5000, cost: 1, remaining: 4999, resetAt: '2026-11-06T13:00:00Z' };

function raw(over: Record<string, unknown> = {}) {
  return {
    id: 'PR_1',
    number: 7,
    title: 'fix: thing',
    url: 'https://github.com/acme-co/acme-api/pull/7',
    isDraft: false,
    state: 'OPEN',
    closedAt: null,
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    headRefOid: 'h1'.padEnd(40, '0'),
    repository: { name: 'acme-api' },
    author: { login: 'build-bot' },
    reviewDecision: null,
    reviewRequests: { nodes: [{ requestedReviewer: { login: 'me' } }] },
    approvals: { totalCount: 0 },
    anyReviews: { totalCount: 0 },
    commitCount: { totalCount: 1 },
    lastCommit: { nodes: [] },
    ...over,
  };
}

function detailPr(over: Record<string, unknown> = {}) {
  return {
    ...raw(over),
    body: '',
    baseRefName: 'main',
    headRefName: 'f',
    allCommits: { nodes: [] },
    myReviews: { nodes: [] },
    comments: { nodes: [] },
    threadReviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    files: { nodes: [{ path: 'a.rb', additions: 1, deletions: 1, viewerViewedState: 'UNVIEWED' }] },
    checkCommit: { nodes: [] },
  };
}

/** Fake client that counts calls by kind. */
function fakeClient() {
  const calls = { inbox: [] as string[], detail: 0, merge: 0, teams: 0, issues: 0, poll: 0, rest: [] as string[] };
  let mergeState = {
    title: 'fix: thing',
    state: 'OPEN',
    baseRefName: 'main',
    headRefName: 'f',
    author: { login: 'build-bot' },
    viewerCanMergeAsAdmin: false,
    mergeStateStatus: 'CLEAN',
    reviewDecision: null as string | null,
    commits: { nodes: [] as unknown[] },
  };
  let teams: string[] | Error = ['platform'];
  let list = [raw()];
  let detail = detailPr();
  const client = {
    lastRate: undefined,
    graphqlRate: rate,
    graphql: async (query: string, vars: { q?: string; prs?: string }) => {
      const empty = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };
      if (query === ISSUE_INBOX_QUERY || query === MENTION_QUERY) {
        calls.issues += 1;
        return { viewer: { login: 'me' }, rateLimit: rate, search: empty };
      }
      if (query.includes('query Poll(')) {
        calls.inbox.push(vars.prs ?? '');
        calls.poll += 1;
        return {
          viewer: { login: 'me' },
          rateLimit: rate,
          prs: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: list },
          issues: empty,
          mentions: empty,
        };
      }
      if (query === INBOX_QUERY) {
        calls.inbox.push(vars.q ?? '');
        return {
          viewer: { login: 'me' },
          rateLimit: rate,
          search: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: list },
        };
      }
      if (query.includes('query ProjectMeta(')) return { organization: null };
      if (query === TEAMS_QUERY) {
        calls.teams += 1;
        if (teams instanceof Error) throw teams;
        return { organization: { teams: { nodes: teams.map((slug) => ({ slug })) } } };
      }
      if (query === MERGE_STATE_QUERY || query === CHECKS_QUERY) {
        calls.merge += 1;
        return { viewer: { login: 'me' }, repository: { pullRequest: mergeState } };
      }
      calls.detail += 1;
      return { viewer: { login: 'me' }, rateLimit: rate, repository: { pullRequest: detail } };
    },
    restConditional: async (path: string): Promise<Stored<unknown>> => {
      calls.rest.push(path);
      return { etag: 'e', body: [{ filename: 'a.rb', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-a\n+b' }] };
    },
  };
  return {
    client: client as unknown as GithubClient,
    calls,
    setTeams: (t: string[] | Error) => (teams = t),
    setList: (l: ReturnType<typeof raw>[]) => (list = l),
    setDetail: (d: ReturnType<typeof detailPr>) => (detail = d),
    setRollup: (state: string, contexts: unknown[] = [], hasNextPage = false) => {
      mergeState = {
        ...mergeState,
        commits: { nodes: [{ commit: { statusCheckRollup: { state, contexts: { pageInfo: { hasNextPage }, nodes: contexts } } } }] },
      };
    },
  };
}

function provider(f: ReturnType<typeof fakeClient>, cache = new PrCache()) {
  let now = Date.parse('2026-11-06T12:00:00Z');
  const p = new GithubProvider(f.client, new SeenStore(null), async () => '', cache, () => undefined, () => now, undefined, WITH_ORG());
  return { p, tick: (ms: number) => (now += ms) };
}

const ref = { repo: 'acme-co/acme-api', number: 7 };
const WITH_ORG = () => new ProjectConfig({ ...DEFAULT_SETTINGS, orgs: ['acme-co'] });

describe('cache keying by head SHA', () => {
  it('builds the key as owner/repo#n@head', () => {
    expect(detailKey('acme-co/acme-api#7', 'abc')).toBe('acme-co/acme-api#7@abc');
  });

  it('serves an unchanged PR detail with zero requests', async () => {
    const f = fakeClient();
    const { p } = provider(f);
    await p.inbox(undefined, 'full');
    await p.detail(ref);
    expect(f.calls.detail).toBe(1);
    await p.detail(ref);
    await p.detail(ref);
    expect(f.calls.detail).toBe(1);
  });

  it('never serves checks or merge state from the detail cache', async () => {
    const f = fakeClient();
    const { p } = provider(f);
    await p.inbox(undefined, 'full');
    f.setRollup('PENDING', [{ __typename: 'StatusContext', context: 'ci', state: 'PENDING' }]);
    const first = await p.detail(ref);
    expect(f.calls.detail).toBe(1);
    expect(first.checks).toEqual([]);

    f.setRollup('FAILURE', [{ __typename: 'StatusContext', context: 'ci', state: 'FAILURE' }], true);
    const second = await p.detail(ref);
    expect(f.calls.detail).toBe(1);
    expect(second.summary.ci).toBe('fail');
    expect(second.checks.map((c) => c.status)).toEqual(['fail']);
    expect(second.checksTruncated).toBe(true);
  });

  it('refetches when the list shows a new head and updatedAt', async () => {
    const f = fakeClient();
    const { p, tick } = provider(f);
    await p.inbox(undefined, 'full');
    await p.detail(ref);
    const moved = { headRefOid: 'h2'.padEnd(40, '0'), updatedAt: '2026-11-06T12:05:00Z' };
    f.setList([raw(moved)]);
    f.setDetail(detailPr(moved));
    tick(60_000);
    await p.inbox(undefined, 'delta');
    await p.detail(ref);
    expect(f.calls.detail).toBe(2);
  });

  it('keeps cached patches by commit SHA and never refetches them', async () => {
    const f = fakeClient();
    const { p } = provider(f);
    await p.inbox(undefined, 'full');
    await p.diff(ref, 'all');
    await p.diff(ref, 'all');
    expect(f.calls.rest).toHaveLength(1);
  });

  it('survives a restart: the list renders and the detail loads with no request', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ri-cache-'));
    try {
      const f1 = fakeClient();
      const first = provider(f1, new PrCache(new DiskCache(dir)));
      await first.p.inbox(undefined, 'full');
      await first.p.detail(ref);

      const f2 = fakeClient();
      const second = provider(f2, new PrCache(new DiskCache(dir)));
      const saved = await second.p.inbox(undefined, 'none');
      expect(saved.prs).toHaveLength(1);
      await second.p.detail(ref);
      expect(f2.calls.inbox).toHaveLength(0);
      expect(f2.calls.detail).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prunes cache files of PRs closed over seven days ago', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ri-cache-'));
    try {
      const f = fakeClient();
      const { p, tick } = provider(f, new PrCache(new DiskCache(dir)));
      await p.inbox(undefined, 'full');
      await p.detail(ref);
      f.setList([]);
      tick(900_000);
      await p.inbox(undefined, 'full');
      expect(await readdir(join(dir, 'detail'))).toHaveLength(1);
      tick(8 * 24 * 3_600_000);
      await p.inbox(undefined, 'full');
      expect(await readdir(join(dir, 'detail'))).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('incremental polling', () => {
  it('costs one query for a quiet poll and merges a changed PR into the cache', async () => {
    const f = fakeClient();
    const { p, tick } = provider(f);
    const first = await p.inbox(undefined, 'full');
    expect(first.prs).toHaveLength(1);

    f.setList([]);
    tick(60_000);
    const quiet = await p.inbox(undefined, 'delta');
    expect(f.calls.inbox).toHaveLength(2);
    expect(f.calls.poll).toBe(1);
    expect(f.calls.inbox[1]).toBe('is:pr org:acme-co updated:>=2026-11-06T11:59:00Z');
    expect(quiet.prs).toHaveLength(1);

    f.setList([raw({ state: 'MERGED', closedAt: '2026-11-06T12:01:30Z' })]);
    tick(60_000);
    const closed = await p.inbox(undefined, 'delta');
    expect(closed.prs).toHaveLength(0);
  });

  it('serves the saved list with no request in none mode', async () => {
    const f = fakeClient();
    const { p } = provider(f);
    await p.inbox(undefined, 'full');
    await p.inbox(undefined, 'none');
    expect(f.calls.inbox).toHaveLength(1);
  });
});

describe('team review requests', () => {
  it('fetches the viewer teams on a full sweep, stores them and skips them on a delta', async () => {
    const f = fakeClient();
    const { p, tick } = provider(f);
    const first = await p.inbox(undefined, 'full');
    expect(first.teams).toEqual(['platform']);
    expect(f.calls.teams).toBe(1);
    tick(60_000);
    const next = await p.inbox(undefined, 'delta');
    expect(f.calls.teams).toBe(1);
    expect(next.teams).toEqual(['platform']);
  });

  it('falls back to user-only matching with one log line when teams are forbidden', async () => {
    const f = fakeClient();
    f.setTeams(new ApiError('Resource not accessible by personal access token', 'http', 200));
    const lines: string[] = [];
    const p = new GithubProvider(f.client, new SeenStore(null), async () => '', new PrCache(), (l) => lines.push(l), undefined, undefined, WITH_ORG());
    const first = await p.inbox(undefined, 'full');
    await p.inbox(undefined, 'full');
    expect(first.teams).toEqual([]);
    expect(lines.filter((l) => l.includes('teams unavailable'))).toHaveLength(1);
  });
});

describe('in-flight coalescing', () => {
  const rateLimit = { limit: 5000, cost: 1, remaining: 4999, resetAt: 'r' };

  function counting() {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      await new Promise((r) => setTimeout(r, 5));
      return res(200, url.endsWith('/graphql') ? { data: { rateLimit } } : [{ filename: 'a' }]);
    }) as unknown as typeof fetch;
    return { urls, client: new GithubClient(TOKEN, fetchImpl, () => undefined) };
  }

  it('shares one GraphQL call between identical concurrent queries', async () => {
    const { urls, client } = counting();
    const vars = { owner: 'o', name: 'r', number: 1 };
    await Promise.all([
      client.graphql('query Detail { x }', vars),
      client.graphql('query Detail { x }', { ...vars }),
    ]);
    expect(urls).toHaveLength(1);
    await client.graphql('query Detail { x }', vars);
    expect(urls).toHaveLength(2);
  });

  it('keeps calls with different variables, and mutations, separate', async () => {
    const { urls, client } = counting();
    await Promise.all([
      client.graphql('query Detail { x }', { number: 1 }),
      client.graphql('query Detail { x }', { number: 2 }),
      client.graphql('mutation M { y }', { id: 1 }),
      client.graphql('mutation M { y }', { id: 1 }),
    ]);
    expect(urls).toHaveLength(4);
  });

  it('shares one REST read per path', async () => {
    const { urls, client } = counting();
    await Promise.all([
      client.restConditional('/repos/o/r/pulls/1/files'),
      client.restConditional('/repos/o/r/pulls/1/files'),
      client.restConditional('/repos/o/r/pulls/2/files'),
    ]);
    expect(urls).toHaveLength(2);
  });

  it('runs one Detail query when detail and diff load together', async () => {
    let details = 0;
    const fetchImpl = (async (url: string) => {
      await new Promise((r) => setTimeout(r, 5));
      if (url.endsWith('/graphql')) {
        details += 1;
        return res(200, {
          data: { viewer: { login: 'me' }, rateLimit, repository: { pullRequest: detailPr() } },
        });
      }
      return res(200, [{ filename: 'a.rb', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-a\n+b' }]);
    }) as unknown as typeof fetch;
    const client = new GithubClient(TOKEN, fetchImpl, () => undefined);
    const p = new GithubProvider(client, new SeenStore(null), async () => '', new PrCache(), () => undefined);
    await Promise.all([p.detail(ref), p.diff(ref, 'all')]);
    expect(details).toBe(1);
  });
});
