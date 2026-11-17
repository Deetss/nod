import { describe, expect, it } from 'vitest';
import { ApiError, type ApiErrorKind, type Stored } from '../server/github-client';
import { RULESET_TTL_MS, RulesetBypass } from '../server/ruleset-bypass';

const REPO = 'acme-co/orders-api';
const RULES = `/repos/${REPO}/rules/branches/main?per_page=100`;
const rulesetPath = (id: number) => `/repos/${REPO}/rulesets/${id}`;

interface Reply {
  status: number;
  body?: unknown;
  etag?: string;
  kind?: ApiErrorKind;
}

interface Call {
  path: string;
  etag?: string;
  cost: number;
}

/** A fake `restConditional`: a 304 reply reuses the stored body when an ETag went out. */
function setup(replies: Record<string, Reply>) {
  const calls: Call[] = [];
  let at = 1_000_000;
  const client = {
    restConditional: async <T, R>(path: string, prev: Stored<T> | undefined, pick: (raw: R) => T): Promise<Stored<T>> => {
      const r = replies[path];
      if (!r) throw new Error(`unexpected ${path}`);
      if (r.kind && r.kind !== 'http') throw new ApiError('offline', r.kind, r.status);
      if (r.status === 304 && prev?.etag) {
        calls.push({ path, etag: prev.etag, cost: 0 });
        return prev;
      }
      calls.push({ path, ...(prev?.etag ? { etag: prev.etag } : {}), cost: 1 });
      if (r.status >= 400) throw new ApiError(`GitHub API error ${r.status}`, 'http', r.status);
      return { ...(r.etag ? { etag: r.etag } : {}), body: pick(r.body as R) };
    },
  };
  const rulesets = new RulesetBypass(client, undefined, () => at);
  return {
    rulesets,
    calls,
    replies,
    advance: (ms: number) => {
      at += ms;
    },
    check: (opts?: { fresh?: boolean }) => rulesets.check(REPO, 'main', opts),
  };
}

const rule = (id: number, count = 1, type = 'pull_request') => ({
  type,
  ruleset_id: id,
  parameters: { required_approving_review_count: count },
});
const ok = (body: unknown, etag = 'W/"e1"'): Reply => ({ status: 200, body, etag });
const canBypass = (value?: string): Reply => ok(value === undefined ? {} : { current_user_can_bypass: value }, `W/"r-${value}"`);

describe('ruleset bypass decision', () => {
  it.each(['always', 'pull_requests_only', 'exempt'])('%s allows bypass', async (value) => {
    const t = setup({ [RULES]: ok([rule(11)]), [rulesetPath(11)]: canBypass(value) });
    expect(await t.check()).toEqual({ bypass: true, required: 1 });
  });

  it.each([['never'], [undefined]])('%s does not allow bypass', async (value) => {
    const t = setup({ [RULES]: ok([rule(11)]), [rulesetPath(11)]: canBypass(value) });
    expect((await t.check()).bypass).toBe(false);
  });

  it('needs every kept ruleset to allow bypass', async () => {
    const both = setup({
      [RULES]: ok([rule(11), rule(12, 2)]),
      [rulesetPath(11)]: canBypass('always'),
      [rulesetPath(12)]: canBypass('pull_requests_only'),
    });
    expect(await both.check()).toEqual({ bypass: true, required: 2 });
    const one = setup({
      [RULES]: ok([rule(11), rule(12)]),
      [rulesetPath(11)]: canBypass('always'),
      [rulesetPath(12)]: canBypass('never'),
    });
    expect((await one.check()).bypass).toBe(false);
  });

  it('asks each ruleset once even when it holds two rules', async () => {
    const t = setup({ [RULES]: ok([rule(11), rule(11, 2)]), [rulesetPath(11)]: canBypass('always') });
    await t.check();
    expect(t.calls.map((c) => c.path)).toEqual([RULES, rulesetPath(11)]);
  });

  it('ignores a pull_request rule that requires no approval', async () => {
    const t = setup({ [RULES]: ok([rule(11, 0)]) });
    expect((await t.check()).bypass).toBe(false);
    expect(t.calls).toHaveLength(1);
  });

  it('reads no bypass when the branch has no pull_request rule', async () => {
    const t = setup({ [RULES]: ok([{ type: 'required_signatures', ruleset_id: 11 }]) });
    expect((await t.check()).bypass).toBe(false);
  });

  it('encodes a base branch with a slash', async () => {
    const path = `/repos/${REPO}/rules/branches/release%2F1.2?per_page=100`;
    const t = setup({ [path]: ok([]) });
    await t.rulesets.check(REPO, 'release/1.2');
    expect(t.calls[0]?.path).toBe(path);
  });
});

describe('ruleset bypass errors and cache', () => {
  it.each([403, 404])('caches %s on the rules call as no bypass for an hour', async (status) => {
    const t = setup({ [RULES]: { status } });
    expect((await t.check()).bypass).toBe(false);
    t.advance(RULESET_TTL_MS - 1);
    await t.check();
    expect(t.calls).toHaveLength(1);
    t.advance(2);
    await t.check();
    expect(t.calls).toHaveLength(2);
  });

  it('caches a 404 on an org ruleset as no bypass', async () => {
    const t = setup({ [RULES]: ok([rule(11)]), [rulesetPath(11)]: { status: 404 } });
    expect((await t.check()).bypass).toBe(false);
    await t.check();
    expect(t.calls).toHaveLength(2);
  });

  it.each<[string, Reply]>([
    ['a 500', { status: 500 }],
    ['a network error', { status: 0, kind: 'network' }],
    ['a rate limit', { status: 403, kind: 'ratelimit' }],
  ])('does not cache %s', async (_name, reply) => {
    const t = setup({ [RULES]: reply });
    expect((await t.check()).bypass).toBe(false);
    t.replies[RULES] = ok([rule(11)]);
    t.replies[rulesetPath(11)] = canBypass('always');
    expect((await t.check()).bypass).toBe(true);
  });

  it('answers from the cache inside the TTL', async () => {
    const t = setup({ [RULES]: ok([rule(11)]), [rulesetPath(11)]: canBypass('always') });
    await t.check();
    await t.check();
    expect(t.calls).toHaveLength(2);
  });

  it('sends If-None-Match after the TTL and reuses the body on a 304 at no cost', async () => {
    const t = setup({ [RULES]: ok([rule(11)], 'W/"rules"'), [rulesetPath(11)]: canBypass('always') });
    await t.check();
    t.advance(RULESET_TTL_MS + 1);
    t.replies[RULES] = { status: 304 };
    t.replies[rulesetPath(11)] = { status: 304 };
    expect(await t.check()).toEqual({ bypass: true, required: 1 });
    expect(t.calls.slice(2)).toEqual([
      { path: RULES, etag: 'W/"rules"', cost: 0 },
      { path: rulesetPath(11), etag: 'W/"r-always"', cost: 0 },
    ]);
  });

  it('skips the TTL when fresh but still sends the ETag', async () => {
    const t = setup({ [RULES]: ok([rule(11)], 'W/"rules"'), [rulesetPath(11)]: canBypass('always') });
    await t.check();
    t.replies[rulesetPath(11)] = canBypass('never');
    expect((await t.check({ fresh: true })).bypass).toBe(false);
    expect(t.calls[2]).toMatchObject({ path: RULES, etag: 'W/"rules"' });
  });

  it('forgets an entry once dropped', async () => {
    const t = setup({ [RULES]: ok([rule(11)]), [rulesetPath(11)]: canBypass('always') });
    await t.check();
    await t.rulesets.drop(REPO, 'main');
    await t.check();
    expect(t.calls).toHaveLength(4);
  });
});
