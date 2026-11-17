import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import type { GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import type { RulesetBypass, RulesetVerdict } from '../server/ruleset-bypass';
import { SeenStore } from '../server/seen';

interface Over {
  viewer?: string;
  author?: string;
  state?: string;
  draft?: boolean;
  mergeable?: string;
  mergeState?: string;
  rollup?: string | null;
  decision?: string | null;
  threads?: { totalCount: number; nodes: { isResolved: boolean }[] };
  allowed?: { squash: boolean; merge: boolean; rebase: boolean };
  deleteOnMerge?: boolean;
  bypass?: boolean;
  ghError?: { stderr: string };
}

const RESOLVED = { totalCount: 2, nodes: [{ isResolved: true }, { isResolved: true }] };

/** A provider whose fresh merge state and ruleset answer come from `over`. No network, no real `gh`. */
function setup(over: Over = {}) {
  const o = {
    viewer: 'acme-dev',
    author: 'acme-dev',
    state: 'OPEN',
    draft: false,
    mergeable: 'MERGEABLE',
    mergeState: 'BLOCKED',
    rollup: 'SUCCESS' as string | null,
    decision: 'REVIEW_REQUIRED' as string | null,
    threads: RESOLVED,
    allowed: { squash: true, merge: true, rebase: false },
    deleteOnMerge: false,
    bypass: true,
    ...over,
  };
  const gh: string[][] = [];
  const checks: { repo: string; base: string; fresh: boolean }[] = [];
  const dropped: string[] = [];
  const client = {
    lastRate: undefined,
    graphql: async () => ({
      viewer: { login: o.viewer },
      repository: {
        viewerPermission: 'WRITE',
        squashMergeAllowed: o.allowed.squash,
        mergeCommitAllowed: o.allowed.merge,
        rebaseMergeAllowed: o.allowed.rebase,
        deleteBranchOnMerge: o.deleteOnMerge,
        pullRequest: {
          id: 'PR_372',
          title: 'feat: add refund endpoint',
          state: o.state,
          isDraft: o.draft,
          baseRefName: 'main',
          headRefName: 'feat/refunds',
          author: { login: o.author },
          viewerCanMergeAsAdmin: false,
          mergeStateStatus: o.mergeState,
          mergeable: o.mergeable,
          reviewDecision: o.decision,
          reviewThreads: o.threads,
          commits: {
            nodes: [{ commit: { statusCheckRollup: o.rollup ? { state: o.rollup, contexts: { nodes: [] } } : null } }],
          },
        },
      },
    }),
  } as unknown as GithubClient;
  const rulesets = {
    check: async (repo: string, base: string, opts: { fresh?: boolean } = {}): Promise<RulesetVerdict> => {
      checks.push({ repo, base, fresh: opts.fresh === true });
      return { bypass: o.bypass, required: 1 };
    },
    drop: async (repo: string, base: string) => void dropped.push(`${repo}@${base}`),
  } as unknown as RulesetBypass;
  const p = new GithubProvider(
    client,
    new SeenStore(null),
    async (args) => {
      gh.push(args);
      if (o.ghError) throw Object.assign(new Error('gh failed'), o.ghError);
      return '';
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    rulesets,
  );
  return { p, gh, checks, dropped };
}

const ref = { repo: 'acme-co/orders-api', number: 372 };

describe('server re-check before Merge (bypass)', () => {
  it('merges with gh pr merge --admin and the chosen flags when the fresh gate passes', async () => {
    const { p, gh, checks } = setup();
    const res = await p.bypassMerge(ref);
    expect(res).toEqual({ ok: true, message: 'Merged #372 without review. Branch deleted.' });
    expect(gh).toEqual([['pr', 'merge', '--admin', '--repo', 'acme-co/orders-api', '372', '--squash', '--delete-branch']]);
    expect(checks).toEqual([{ repo: 'acme-co/orders-api', base: 'main', fresh: true }]);
  });

  it('uses the method the repository allows and says when the branch stays', async () => {
    const { p, gh } = setup({ allowed: { squash: false, merge: true, rebase: false } });
    expect((await p.bypassMerge(ref)).message).toBe('Merged #372 without review.');
    expect(gh[0]?.slice(-1)).toEqual(['--merge']);
  });

  it.each<[string, Over, string]>([
    ['not own PR', { author: 'build-bot' }, 'only the PR author'],
    ['merged meanwhile', { state: 'MERGED' }, 'not open'],
    ['draft', { draft: true }, 'draft'],
    ['conflicting', { mergeable: 'CONFLICTING' }, 'mergeable'],
    ['behind', { mergeState: 'BEHIND' }, 'BEHIND'],
    ['a check failed', { rollup: 'FAILURE' }, 'every check'],
    ['checks pending', { rollup: 'PENDING' }, 'every check'],
    ['approved meanwhile', { decision: 'APPROVED' }, 'required review'],
    ['a thread reopened', { threads: { totalCount: 2, nodes: [{ isResolved: true }, { isResolved: false }] } }, 'resolved'],
    ['too many threads', { threads: { totalCount: 51, nodes: [] } }, 'more than 50'],
    ['bypass revoked', { bypass: false }, 'ruleset'],
    ['no method allowed', { allowed: { squash: false, merge: false, rebase: false } }, 'no merge method'],
  ])('refuses a stale gate: %s', async (_name, over, reason) => {
    const { p, gh } = setup(over);
    const res = await p.bypassMerge(ref);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/^Merge \(bypass\) refused: /);
    expect(res.message).toContain(reason);
    expect(gh).toHaveLength(0);
  });

  it('skips the ruleset call when an earlier row already fails', async () => {
    const { p, checks } = setup({ rollup: 'FAILURE' });
    await p.bypassMerge(ref);
    expect(checks).toHaveLength(0);
  });

  it('shows GitHub text and drops the ruleset cache when gh refuses', async () => {
    const stderr = 'HTTP 405: Repository rule violations found';
    const { p, dropped } = setup({ ghError: { stderr } });
    expect(await p.bypassMerge(ref)).toEqual({ ok: false, message: stderr });
    expect(dropped).toEqual(['acme-co/orders-api@main']);
  });
});

describe('POST /api/bypass-merge in fixture mode', () => {
  const PORT = 4478;
  const ORIGIN = `http://127.0.0.1:${PORT}`;
  const headers = { 'content-type': 'application/json', host: `127.0.0.1:${PORT}`, origin: ORIGIN, 'x-nod-token': 't' };
  const post = (provider: FixtureProvider, body: unknown, state = '') =>
    createApp({ provider, port: PORT, token: 't' }).request(`${ORIGIN}/api/bypass-merge${state}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

  it('merges the bypass fixture and then shows it merged', async () => {
    const provider = new FixtureProvider();
    const res = await post(provider, { repo: 'acme-co/orders-api', number: 372 });
    expect(await res.json()).toMatchObject({ ok: true, message: 'Merged #372 without review. Branch deleted.' });
    const detail = await provider.detail({ repo: 'acme-co/orders-api', number: 372 }, undefined);
    expect(detail).toMatchObject({ isOpen: false, merged: true });
  });

  it.each([
    [373, 'every check'],
    [374, 'ruleset'],
  ])('refuses the hidden fixture #%s', async (number, reason) => {
    const res = await post(new FixtureProvider(), { repo: 'acme-co/orders-api', number });
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message).toContain(reason);
  });

  it('refuses like GitHub under ?state=bypass-fail', async () => {
    const res = await post(new FixtureProvider(), { repo: 'acme-co/orders-api', number: 372 }, '?state=bypass-fail');
    expect(await res.json()).toMatchObject({ ok: false, message: '405: Repository rule violations found' });
  });

  it('rejects a body without a PR number', async () => {
    const res = await post(new FixtureProvider(), { repo: 'acme-co/orders-api' });
    expect(res.status).toBe(400);
  });
});
