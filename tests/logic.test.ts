import { describe, expect, it } from 'vitest';
import { parsePatch } from '../shared/patch';
import { mergeMethodFor, type PrSummary } from '../shared/types';
import type { GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import { SeenStore } from '../server/seen';
import { formatReset } from '../web/inbox-utils';

describe('formatReset', () => {
  const now = Date.UTC(2026, 10, 6, 12, 0, 0);

  it('shows whole minutes left, rounded up', () => {
    expect(formatReset(new Date(now + 11 * 60_000 + 10_000).toISOString(), now).left).toBe('12m');
  });

  it('shows <1m under one minute', () => {
    expect(formatReset(new Date(now + 20_000).toISOString(), now).left).toBe('<1m');
  });

  it('shows now once the reset has passed', () => {
    expect(formatReset(new Date(now - 5_000).toISOString(), now).left).toBe('now');
  });

  it('formats the local clock time as HH:MM', () => {
    expect(formatReset(new Date(now).toISOString(), now, '24h').at).toMatch(/^\d{2}:\d{2}$/);
  });
});

function pr(over: Partial<PrSummary> = {}): PrSummary {
  return {
    id: 'PR_1',
    repo: 'acme-api',
    number: 1,
    title: 't',
    author: 'acme-dev',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    headSha: 'aaa',
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commitCount: 3,
    ci: 'pass',
    reviewStatus: 'needs review',
    seen: 'seen',
    url: 'u',
    ...over,
  };
}

describe('parsePatch', () => {
  it('numbers old and new lines across a hunk', () => {
    const hunks = parsePatch('@@ -10,3 +10,3 @@ x\n a\n-b\n+c\n d');
    expect(hunks).toHaveLength(1);
    const lines = hunks[0]?.lines ?? [];
    expect(lines.map((l) => [l.kind, l.oldNo, l.newNo])).toEqual([
      ['ctx', 10, 10],
      ['del', 11, undefined],
      ['add', undefined, 11],
      ['ctx', 12, 12],
    ]);
  });
});

describe('mergeMethodFor', () => {
  it('uses a merge commit for release PRs and squash for the rest', () => {
    expect(mergeMethodFor('feat: release staging to main (2026-11-06)', 'main', 'staging')).toBe('merge');
    expect(mergeMethodFor('fix: hide sale bonus', 'staging', 'feature/1')).toBe('squash');
    expect(mergeMethodFor('release staging to main', 'main', 'feature/1')).toBe('squash');
  });
});

describe('SeenStore', () => {
  it('flags new, updated and seen PRs', async () => {
    const store = new SeenStore(null);
    const [fresh] = await store.annotate([pr()]);
    expect(fresh?.seen).toBe('new');

    await store.mark({ id: 'PR_1', updatedAt: '2026-11-06T10:00:00Z', headSha: 'aaa', commitCount: 3 });
    const [same] = await store.annotate([pr()]);
    expect(same?.seen).toBe('seen');

    const [changed] = await store.annotate([pr({ headSha: 'bbb', commitCount: 5 })]);
    expect(changed?.seen).toBe('updated');
    expect(changed?.updatedNote).toBe('2 commits since you looked');
  });
});

describe('auto-merge', () => {
  function provider(title: string, calls: string[][], base = 'main', head = 'staging') {
    const pullRequest = { title, state: 'OPEN', baseRefName: base, headRefName: head, author: null, commits: { nodes: [] } };
    const client = {
      graphql: async () => ({ viewer: { login: 'me' }, repository: { pullRequest } }),
      lastRate: undefined,
    } as unknown as GithubClient;
    return new GithubProvider(client, new SeenStore(null), async (args) => {
      calls.push(args);
      return '';
    });
  }

  it('merges release PRs with a merge commit', async () => {
    const calls: string[][] = [];
    const res = await provider('feat: release staging to main (2026-11-06)', calls).merge({
      repo: 'acme-co/acme-api',
      number: 307,
    });
    expect(res.ok).toBe(true);
    expect(calls).toEqual([
      ['pr', 'merge', '--auto', '--repo', 'acme-co/acme-api', '307', '--merge'],
    ]);
  });

  it('squashes and deletes the branch for any other title', async () => {
    const calls: string[][] = [];
    await provider('fix: hide sale bonus', calls, 'staging', 'feature/1').merge({ repo: 'acme-co/acme-api', number: 310 });
    expect(calls).toEqual([
      ['pr', 'merge', '--auto', '--repo', 'acme-co/acme-api', '310', '--squash', '--delete-branch'],
    ]);
  });
});
