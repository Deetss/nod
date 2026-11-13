import { describe, expect, it } from 'vitest';
import { ApiError, type GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import { EMPTY_STATE } from '../server/inbox-state';
import { IssueCache } from '../server/issue-cache';
import { ISSUE_INBOX_QUERY, MENTION_QUERY } from '../server/issue-queries';
import { EMPTY_ISSUE_STATE } from '../server/issue-state';
import { PrCache } from '../server/pr-cache';
import { ProjectConfig } from '../server/project-config';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { INBOX_QUERY, TEAMS_QUERY } from '../server/queries';
import { SeenStore } from '../server/seen';
import { SyncLoop } from '../server/sync-loop';

const MINUTE = 60_000;
const START = Date.parse('2026-11-06T12:00:00Z');
const NO_PAGE = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] as unknown[] };
const rate = { limit: 5000, cost: 1, remaining: 4999, resetAt: '2026-11-06T13:00:00Z' };
const viewer = { login: 'me', id: 'U1' };
const quietPoll = { viewer, rateLimit: rate, prs: NO_PAGE, issues: NO_PAGE, mentions: NO_PAGE };

function pr(n: number) {
  return {
    id: `PR_${n}`,
    number: n,
    title: 't',
    url: 'u',
    isDraft: false,
    state: 'OPEN',
    closedAt: null,
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
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
  };
}

interface Vars {
  q?: string;
  after?: string | null;
}

/** A client where every GraphQL call costs one point. Each call is recorded by query name. */
function mockClient(over: { poll?: () => unknown; inbox?: (v: Vars) => unknown } = {}) {
  const calls: { name: string; vars: Vars }[] = [];
  const client = {
    lastRate: undefined,
    graphqlRate: rate,
    graphql: async (query: string, vars: Vars) => {
      const name = /^\s*query (\w+)/.exec(query)?.[1] ?? 'unknown';
      calls.push({ name, vars });
      if (name === 'Poll') return over.poll?.() ?? quietPoll;
      if (query === INBOX_QUERY) {
        return over.inbox?.(vars) ?? { viewer, rateLimit: rate, search: NO_PAGE };
      }
      if (query === ISSUE_INBOX_QUERY || query === MENTION_QUERY) {
        return { viewer, rateLimit: rate, search: NO_PAGE };
      }
      if (query === TEAMS_QUERY) return { organization: { teams: { nodes: [] } } };
      if (name === 'ProjectMeta') return { organization: null };
      throw new Error(`unexpected query ${name}`);
    },
  };
  return { client: client as unknown as GithubClient, calls };
}

function setup(client: GithubClient, store?: PrCache, issueStore?: IssueCache, settings: Settings = DEFAULT_SETTINGS) {
  let now = START;
  const provider = new GithubProvider(
    client,
    new SeenStore(null),
    async () => '',
    store,
    () => undefined,
    () => now,
    issueStore,
    new ProjectConfig(settings),
  );
  const loop = new SyncLoop(provider, () => undefined);
  return { provider, loop, advance: (ms: number) => (now += ms) };
}

/** 60 simulated minutes with nothing changing, and `clients` browsers reading the lists each minute. */
async function quietHour(clients: number): Promise<number> {
  const m = mockClient();
  const { provider, loop, advance } = setup(m.client);
  for (let minute = 0; minute <= 60; minute += 1) {
    await loop.tick();
    for (let c = 0; c < clients; c += 1) {
      await provider.inbox(undefined, 'none');
      await provider.issues();
    }
    advance(MINUTE);
  }
  return m.calls.length;
}

describe('quiet hour cost', () => {
  it('spends at most 75 points an hour on PRs and issues together', async () => {
    expect(await quietHour(1)).toBeLessThanOrEqual(75);
  });

  it('costs the same with three connected clients as with one', async () => {
    expect(await quietHour(3)).toBe(await quietHour(1));
  });

  it('sweeps once an hour, with teams and project ids, not every 15 minutes', async () => {
    const m = mockClient();
    const { loop, advance } = setup(m.client, undefined, undefined, { ...DEFAULT_SETTINGS, orgs: ['acme-co'] });
    for (let minute = 0; minute <= 60; minute += 1) {
      await loop.tick();
      advance(MINUTE);
    }
    expect(m.calls.filter((c) => c.vars.q?.startsWith('is:open is:pr')).length).toBe(2);
    expect(m.calls.filter((c) => c.name === 'Teams').length).toBe(2);
  });
});

describe('delta paging', () => {
  it('continues a busy delta from its cursor instead of sweeping', async () => {
    const more = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [pr(2), pr(3)] };
    const m = mockClient({
      poll: () => ({
        ...quietPoll,
        prs: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [pr(1)] },
      }),
      inbox: (v) => ({ viewer, rateLimit: rate, search: v.after === 'c1' ? more : NO_PAGE }),
    });
    const { provider, advance } = setup(m.client);
    await provider.poll('delta');
    advance(MINUTE);
    m.calls.length = 0;
    await provider.poll('delta');
    expect(m.calls.map((c) => c.name)).toEqual(['Poll', 'InboxSync']);
    expect(m.calls[1]?.vars.after).toBe('c1');
    expect(m.calls[1]?.vars.q).toContain('updated:>=');
    expect((await provider.inbox(undefined, 'none')).prs).toHaveLength(3);
  });
});

describe('startup', () => {
  class SavedPrs extends PrCache {
    constructor(private readonly at: number) {
      super();
    }
    override async loadState() {
      return { ...EMPTY_STATE, viewer: 'me', lastSync: this.at };
    }
  }
  class SavedIssues extends IssueCache {
    constructor(private readonly at: number) {
      super();
    }
    override async loadState() {
      return { ...EMPTY_ISSUE_STATE, viewer: 'me', lastSync: this.at };
    }
  }

  it('runs a delta from a saved list under an hour old', async () => {
    const m = mockClient();
    const at = START - 30 * MINUTE;
    const { provider } = setup(m.client, new SavedPrs(at), new SavedIssues(at));
    await provider.poll('delta');
    expect(m.calls.some((c) => c.vars.q?.startsWith('is:open is:pr'))).toBe(false);
    expect(m.calls.filter((c) => c.name === 'Poll')).toHaveLength(1);
  });

  it('sweeps from a saved list that is over an hour old', async () => {
    const m = mockClient();
    const at = START - 90 * MINUTE;
    const { provider } = setup(m.client, new SavedPrs(at), new SavedIssues(at));
    await provider.poll('delta');
    expect(m.calls.some((c) => c.vars.q?.startsWith('is:open is:pr'))).toBe(true);
  });
});

describe('rate limit backoff', () => {
  it('reads nothing until resetAt, keeps serving the list and shows the limit', async () => {
    let limited = false;
    const resetAt = new Date(START + 10 * MINUTE).toISOString();
    const m = mockClient({
      poll: () => {
        if (limited) throw new ApiError('GitHub rate limit reached', 'ratelimit', 403, resetAt);
        return quietPoll;
      },
    });
    const { provider, loop, advance } = setup(m.client);
    await loop.tick();
    advance(MINUTE);
    limited = true;
    await loop.tick();
    const before = m.calls.length;
    for (let i = 0; i < 8; i += 1) {
      advance(MINUTE);
      await loop.tick();
    }
    expect(m.calls.length).toBe(before);
    const view = await provider.inbox(undefined, 'none');
    expect(view.stale?.kind).toBe('ratelimit');
    expect(view.stale?.resetAt).toBe(resetAt);

    limited = false;
    advance(2 * MINUTE);
    await loop.tick();
    expect(m.calls.length).toBe(before + 1);
    expect((await provider.inbox(undefined, 'none')).stale).toBeUndefined();
  });
});

describe('sync keyed by mode', () => {
  it('runs a requested full sweep after a running delta instead of dropping it', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const m = mockClient({ poll: () => gate.then(() => quietPoll) });
    const { provider, advance } = setup(m.client);
    await provider.poll('full');
    advance(MINUTE);
    m.calls.length = 0;
    const delta = provider.poll('delta');
    await new Promise((r) => setTimeout(r, 0));
    const full = provider.poll('full');
    release();
    await Promise.all([delta, full]);
    expect(m.calls.filter((c) => c.vars.q?.startsWith('is:open is:pr'))).toHaveLength(1);
  });
});

describe('own PRs with CI running', () => {
  const mine = (state: string) => ({
    ...pr(5),
    author: { login: 'me' },
    lastCommit: { nodes: [{ commit: { statusCheckRollup: { state } } }] },
  });

  it('are re-read on each delta, so CI turning red shows before the hourly sweep', async () => {
    let own: unknown[] = [];
    const m = mockClient({
      poll: () => ({ ...quietPoll, own: { nodes: own } }),
      inbox: () => ({ viewer, rateLimit: rate, search: { ...NO_PAGE, nodes: [mine('PENDING')] } }),
    });
    const { provider, advance } = setup(m.client);
    await provider.poll('delta');
    expect((await provider.inbox(undefined, 'none')).prs[0]?.ci).toBe('running');

    own = [mine('FAILURE')];
    advance(MINUTE);
    m.calls.length = 0;
    await provider.poll('delta');
    expect(m.calls.map((c) => c.name)).toEqual(['Poll']);
    expect(m.calls[0]?.vars).toMatchObject({ watchOwn: true, own: expect.stringContaining('author:me') });
    expect((await provider.inbox(undefined, 'none')).prs[0]?.ci).toBe('fail');
  });

  it('are not asked for while no own PR has CI running', async () => {
    const m = mockClient();
    const { provider, advance } = setup(m.client);
    await provider.poll('delta');
    advance(MINUTE);
    m.calls.length = 0;
    await provider.poll('delta');
    expect(m.calls[0]?.vars).toMatchObject({ watchOwn: false });
  });
});
