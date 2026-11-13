import { describe, expect, it } from 'vitest';
import type { GithubClient } from '../server/github-client';
import { canAdminMerge } from '../server/github-map';
import { GithubProvider } from '../server/github-provider';
import { SeenStore } from '../server/seen';

interface Over {
  viewer?: string;
  author?: string;
  admin?: boolean;
  permission?: string;
  ghError?: { stderr: string };
  rollup?: string | null;
  state?: string;
  draft?: boolean;
  headLogins?: string[];
}

function setup(over: Over = {}) {
  const calls: string[][] = [];
  const o = { viewer: 'me', author: 'me', admin: true, rollup: 'SUCCESS', state: 'OPEN', headLogins: [], ...over };
  const client = {
    lastRate: undefined,
    graphql: async () => ({
      viewer: { login: o.viewer },
      repository: {
        viewerPermission: o.permission,
        pullRequest: {
          title: 'fix: x',
          id: 'PR_7',
          state: o.state,
          isDraft: o.draft ?? false,
          baseRefName: 'main',
          headRefName: 'f',
          author: { login: o.author },
          viewerCanMergeAsAdmin: o.admin,
          commits: {
            nodes: [
              {
                commit: {
                  author: { user: o.headLogins[0] ? { login: o.headLogins[0] } : null },
                  committer: { user: null },
                  statusCheckRollup: o.rollup ? { state: o.rollup, contexts: { nodes: [] } } : null,
                },
              },
            ],
          },
        },
      },
    }),
  } as unknown as GithubClient;
  const p = new GithubProvider(client, new SeenStore(null), async (args) => {
    calls.push(args);
    if (o.ghError) throw Object.assign(new Error('gh failed'), o.ghError);
    return '';
  });
  return { p, calls };
}

const ref = { repo: 'acme-api', number: 7 };

describe('canAdminMerge', () => {
  it.each([
    [true, undefined, true],
    [false, 'ADMIN', true],
    [undefined, 'ADMIN', true],
    [false, 'WRITE', false],
    [false, undefined, false],
  ])('viewerCanMergeAsAdmin %s + permission %s gives %s', (flag, perm, want) => {
    expect(canAdminMerge(flag, perm)).toBe(want);
  });
});

describe('server-side admin merge guard', () => {
  it('merges the viewer own PR with admin rights and a passing rollup', async () => {
    const { p, calls } = setup();
    expect((await p.adminMerge(ref)).ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('--admin');
  });

  it('refuses a PR the viewer neither opened nor pushed', async () => {
    const { p, calls } = setup({ author: 'someone-else', headLogins: ['someone-else'] });
    const res = await p.adminMerge(ref);
    expect(res).toEqual({ ok: false, message: 'Admin merge refused: only the PR author or the latest pusher can admin merge' });
    expect(calls).toHaveLength(0);
  });

  it('allows the viewer who pushed the head commit on someone else PR', async () => {
    const { p, calls } = setup({ author: 'acme-bot', headLogins: ['me'] });
    expect((await p.adminMerge(ref)).ok).toBe(true);
    expect(calls[0]).toContain('--admin');
  });

  it('compares the author ignoring case', async () => {
    const { p } = setup({ author: 'ME' });
    expect((await p.adminMerge(ref)).ok).toBe(true);
  });

  it.each(['FAILURE', 'PENDING', 'ERROR', 'EXPECTED', null])('refuses while the rollup is %s', async (rollup) => {
    const { p, calls } = setup({ rollup });
    expect((await p.adminMerge(ref)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('refuses without admin permission', async () => {
    const { p, calls } = setup({ admin: false });
    expect((await p.adminMerge(ref)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('accepts a repo ADMIN when GitHub reports no admin merge (ruleset bypass)', async () => {
    const { p, calls } = setup({ admin: false, permission: 'ADMIN' });
    expect((await p.adminMerge(ref)).ok).toBe(true);
    expect(calls[0]).toContain('--admin');
  });

  it('refuses a repo WRITE viewer when GitHub reports no admin merge', async () => {
    const { p, calls } = setup({ admin: false, permission: 'WRITE' });
    expect((await p.adminMerge(ref)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('still refuses an ADMIN on a draft', async () => {
    const { p, calls } = setup({ admin: false, permission: 'ADMIN', draft: true });
    expect((await p.adminMerge(ref)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('shows GitHub message when it refuses the merge', async () => {
    const stderr = 'Pull request is not mergeable: required status check is expected';
    const { p } = setup({ admin: false, permission: 'ADMIN', ghError: { stderr } });
    const res = await p.adminMerge(ref);
    expect(res).toEqual({ ok: false, message: stderr });
  });

  it('refuses a PR that is not open', async () => {
    const { p, calls } = setup({ state: 'MERGED' });
    expect((await p.adminMerge(ref)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('refuses a draft and says to mark it ready', async () => {
    const { p, calls } = setup({ draft: true });
    const res = await p.adminMerge(ref);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Draft: mark ready first');
    expect(calls).toHaveLength(0);
  });

  it('refuses auto-merge on a draft', async () => {
    const { p, calls } = setup({ draft: true });
    const res = await p.merge(ref);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Draft: mark ready first');
    expect(calls).toHaveLength(0);
  });
});
