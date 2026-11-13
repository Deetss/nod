import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import type { InlineCommentArgs, PrRef } from '../server/provider';
import { PENDING_REVIEW_QUERY, ADD_PENDING_REVIEW, ADD_REVIEW_THREAD, SUBMIT_REVIEW } from '../server/queries';
import { PrCache } from '../server/pr-cache';
import { SeenStore } from '../server/seen';

const PORT = 4479;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;

class Spy extends FixtureProvider {
  calls: { name: string; args: unknown }[] = [];
  override async addReviewComment(args: InlineCommentArgs) {
    this.calls.push({ name: 'addReviewComment', args });
    return { ok: true, message: 'Comment posted' };
  }
  override async addDraftComment(args: InlineCommentArgs) {
    this.calls.push({ name: 'addDraftComment', args });
    return { ok: true, message: 'Draft added' };
  }
  override async replyToThread(args: unknown) {
    this.calls.push({ name: 'replyToThread', args });
    return { ok: true, message: 'Reply posted' };
  }
  override async resolveThread(args: unknown) {
    this.calls.push({ name: 'resolveThread', args });
    return { ok: true, message: 'Thread resolved' };
  }
  override async unresolveThread(args: unknown) {
    this.calls.push({ name: 'unresolveThread', args });
    return { ok: true, message: 'Thread reopened' };
  }
  override async editDraftComment(args: unknown) {
    this.calls.push({ name: 'editDraftComment', args });
    return { ok: true, message: 'Draft updated' };
  }
  override async deleteDraftComment(args: unknown) {
    this.calls.push({ name: 'deleteDraftComment', args });
    return { ok: true, message: 'Draft deleted' };
  }
  override async discardPendingReview(ref: PrRef) {
    this.calls.push({ name: 'discardPendingReview', args: ref });
    return { ok: true, message: 'Pending review discarded' };
  }
}

const headers = (extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  host: `127.0.0.1:${PORT}`,
  origin: ORIGIN,
  'x-nod-token': TOKEN,
  ...extra,
});

function post(spy: Spy, path: string, body: unknown, extra: Record<string, string> = {}) {
  const app = createApp({ provider: spy, port: PORT, token: TOKEN });
  return app.request(`${ORIGIN}/api/pr/acme-co/acme-api/7${path}`, {
    method: 'POST',
    headers: headers(extra),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const line = { body: 'Cap it.', path: 'a.ts', line: 12, side: 'RIGHT', subjectType: 'line' } as const;
const range = { ...line, startLine: 10, startSide: 'RIGHT' } as const;
const file = { body: 'Split this file.', path: 'a.ts', subjectType: 'file' } as const;
const ref = { repo: 'acme-co/acme-api', number: 7 };

describe('POST /api/pr/:owner/:name/:number/comments/inline', () => {
  it('posts a line comment with the PR ref and the body fields', async () => {
    const spy = new Spy();
    const res = await post(spy, '/comments/inline', line);
    expect(res.status).toBe(200);
    expect(spy.calls).toEqual([{ name: 'addReviewComment', args: { ...ref, ...line } }]);
  });

  it('accepts a range and a file comment, and rejects a file comment with a line', async () => {
    const spy = new Spy();
    expect((await post(spy, '/comments/inline', range)).status).toBe(200);
    expect((await post(spy, '/comments/inline', file)).status).toBe(200);
    expect((await post(spy, '/comments/inline', { ...file, line: 3 })).status).toBe(400);
    expect(spy.calls.map((c) => c.name)).toEqual(['addReviewComment', 'addReviewComment']);
  });

  it('refuses a line comment without line or side, and a half range', async () => {
    const spy = new Spy();
    expect((await post(spy, '/comments/inline', { ...line, side: undefined })).status).toBe(400);
    expect((await post(spy, '/comments/inline', { ...line, line: undefined })).status).toBe(400);
    expect((await post(spy, '/comments/inline', { ...line, startLine: 10 })).status).toBe(400);
    expect((await post(spy, '/comments/inline', { ...line, startLine: 13, startSide: 'RIGHT' })).status).toBe(400);
    expect(spy.calls).toEqual([]);
  });

  it('refuses an empty body, an unknown side, and a bad subject', async () => {
    const spy = new Spy();
    expect((await post(spy, '/comments/inline', { ...line, body: '   ' })).status).toBe(400);
    expect((await post(spy, '/comments/inline', { ...line, side: 'MIDDLE' })).status).toBe(400);
    expect((await post(spy, '/comments/inline', { ...line, subjectType: 'thread' })).status).toBe(400);
    expect(spy.calls).toEqual([]);
  });

  it('refuses a body that is not JSON, and a bad PR reference', async () => {
    const spy = new Spy();
    expect((await post(spy, '/comments/inline', 'not json')).status).toBe(400);
    const app = createApp({ provider: spy, port: PORT, token: TOKEN });
    const res = await app.request(`${ORIGIN}/api/pr/acme-co/acme-api/0/comments/inline`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(line),
    });
    expect(res.status).toBe(400);
    expect(spy.calls).toEqual([]);
  });

  it('sits behind the mutation guard', async () => {
    const spy = new Spy();
    expect((await post(spy, '/comments/inline', line, { 'x-nod-token': 'wrong' })).status).toBe(403);
    expect((await post(spy, '/comments/inline', line, { origin: 'https://evil.example' })).status).toBe(403);
    expect(spy.calls).toEqual([]);
  });
});

describe('POST /api/pr/:owner/:name/:number/comments/draft', () => {
  it('adds a draft with the same body rules', async () => {
    const spy = new Spy();
    expect((await post(spy, '/comments/draft', range)).status).toBe(200);
    expect((await post(spy, '/comments/draft', file)).status).toBe(200);
    expect((await post(spy, '/comments/draft', { ...line, side: undefined })).status).toBe(400);
    expect(spy.calls.map((c) => c.name)).toEqual(['addDraftComment', 'addDraftComment']);
    expect(spy.calls[0]?.args).toEqual({ ...ref, ...range });
  });
});

describe('thread and draft routes', () => {
  it('replies, resolves and unresolves a thread by its id', async () => {
    const spy = new Spy();
    expect((await post(spy, '/threads/reply', { threadId: 'T1', body: 'Done.' })).status).toBe(200);
    expect((await post(spy, '/threads/resolve', { threadId: 'T1' })).status).toBe(200);
    expect((await post(spy, '/threads/unresolve', { threadId: 'T1' })).status).toBe(200);
    expect(spy.calls).toEqual([
      { name: 'replyToThread', args: { ...ref, threadId: 'T1', body: 'Done.' } },
      { name: 'resolveThread', args: { ...ref, threadId: 'T1' } },
      { name: 'unresolveThread', args: { ...ref, threadId: 'T1' } },
    ]);
  });

  it('refuses a reply with no body and a thread route with no id', async () => {
    const spy = new Spy();
    expect((await post(spy, '/threads/reply', { threadId: 'T1', body: '' })).status).toBe(400);
    expect((await post(spy, '/threads/resolve', {})).status).toBe(400);
    expect(spy.calls).toEqual([]);
  });

  it('edits and deletes a draft by its comment id', async () => {
    const spy = new Spy();
    expect((await post(spy, '/drafts/edit', { commentId: 'C1', body: 'Better.' })).status).toBe(200);
    expect((await post(spy, '/drafts/delete', { commentId: 'C1' })).status).toBe(200);
    expect((await post(spy, '/drafts/edit', { commentId: 'C1', body: ' ' })).status).toBe(400);
    expect(spy.calls).toEqual([
      { name: 'editDraftComment', args: { ...ref, commentId: 'C1', body: 'Better.' } },
      { name: 'deleteDraftComment', args: { ...ref, commentId: 'C1' } },
    ]);
  });

  it('discards the pending review for the PR in the path', async () => {
    const spy = new Spy();
    expect((await post(spy, '/review/discard', {})).status).toBe(200);
    expect(spy.calls).toEqual([{ name: 'discardPendingReview', args: ref }]);
  });
});

describe('GitHub inline comment path', () => {
  const HEAD = 'deadbeef';
  function provider(opts: { review?: { id: string; drafts: number } } = {}) {
    const calls: { query?: string; path?: string; body?: Record<string, unknown>; vars?: Record<string, unknown> }[] = [];
    const client = {
      lastRate: undefined,
      graphqlRate: undefined,
      async graphql(query: string, vars: Record<string, unknown>) {
        calls.push({ query, vars });
        if (query === PENDING_REVIEW_QUERY) {
          return {
            repository: {
              pullRequest: {
                id: 'PR_7',
                headRefOid: HEAD,
                reviews: { nodes: opts.review ? [{ id: opts.review.id, comments: { totalCount: opts.review.drafts } }] : [] },
              },
            },
          };
        }
        if (query === ADD_PENDING_REVIEW) return { addPullRequestReview: { pullRequestReview: { id: 'PRR_new' } } };
        return {};
      },
      async rest(path: string, init: RequestInit) {
        calls.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
        return {};
      },
    } as unknown as GithubClient;
    const p = new GithubProvider(client, new SeenStore(null), async () => '', new PrCache(), () => {}, Date.now);
    return { p, calls };
  }

  it('posts a line comment over REST with commit_id and the side fields', async () => {
    const { p, calls } = provider();
    const res = await p.addReviewComment({ ...ref, ...range, side: 'RIGHT' });
    expect(res.ok).toBe(true);
    const rest = calls.find((c) => c.path !== undefined);
    expect(rest?.path).toBe('/repos/acme-co/acme-api/pulls/7/comments');
    expect(rest?.body).toEqual({
      body: 'Cap it.',
      commit_id: HEAD,
      path: 'a.ts',
      line: 12,
      side: 'RIGHT',
      start_line: 10,
      start_side: 'RIGHT',
    });
  });

  it('posts a file comment over REST with subject_type file and no line', async () => {
    const { p, calls } = provider();
    await p.addReviewComment({ ...ref, ...file, line: 0, side: 'RIGHT' });
    const rest = calls.find((c) => c.path !== undefined);
    expect(rest?.body).toEqual({ body: 'Split this file.', commit_id: HEAD, path: 'a.ts', subject_type: 'file' });
  });

  it('adds a draft to the existing pending review without creating one', async () => {
    const { p, calls } = provider({ review: { id: 'PRR_old', drafts: 2 } });
    const res = await p.addDraftComment({ ...ref, ...line });
    expect(res).toEqual({ ok: true, message: 'Draft comment added (3 pending)' });
    expect(calls.some((c) => c.query === ADD_PENDING_REVIEW)).toBe(false);
    const draft = calls.find((c) => c.query === ADD_REVIEW_THREAD);
    expect(draft?.vars).toMatchObject({ pullRequestReviewId: 'PRR_old', path: 'a.ts', line: 12, side: 'RIGHT', subjectType: 'LINE' });
  });

  it('creates the pending review first when there is none', async () => {
    const { p, calls } = provider();
    await p.addDraftComment({ ...ref, ...file, line: 0, side: 'RIGHT' });
    const created = calls.find((c) => c.query === ADD_PENDING_REVIEW);
    expect(created?.vars).toEqual({ pullRequestId: 'PR_7', commitOID: HEAD });
    const draft = calls.find((c) => c.query === ADD_REVIEW_THREAD);
    expect(draft?.vars).toMatchObject({ pullRequestReviewId: 'PRR_new', subjectType: 'FILE', line: null, side: null });
  });

  it('submits the pending review with the event instead of creating one', async () => {
    const { p, calls } = provider({ review: { id: 'PRR_old', drafts: 1 } });
    const res = await p.review(ref, 'REQUEST_CHANGES', 'Please fix.');
    expect(res.ok).toBe(true);
    const submit = calls.find((c) => c.query === SUBMIT_REVIEW);
    expect(submit?.vars).toEqual({ id: 'PRR_old', event: 'REQUEST_CHANGES', body: 'Please fix.' });
    expect(calls.some((c) => c.path !== undefined)).toBe(false);
  });

  it('keeps the old REST review path when there is no pending review', async () => {
    const { p, calls } = provider();
    await p.review(ref, 'APPROVE', '');
    expect(calls.some((c) => c.query === SUBMIT_REVIEW)).toBe(false);
    const rest = calls.find((c) => c.path !== undefined);
    expect(rest?.path).toBe('/repos/acme-co/acme-api/pulls/7/reviews');
    expect(rest?.body).toEqual({ event: 'APPROVE', body: '' });
  });
});

describe('fixture inline state', () => {
  it('shows two threads (one open and outdated, one resolved) and a pending review with two drafts', async () => {
    const fx = new FixtureProvider();
    const detail = await fx.detail({ repo: 'acme-co/acme-api', number: 310 }, undefined);
    const threads = (detail.thread ?? []).filter((t) => t.kind === 'thread');
    expect(threads.some((t) => t.kind === 'thread' && t.isOutdated === true && !t.resolved)).toBe(true);
    expect(threads.some((t) => t.kind === 'thread' && t.resolved === true)).toBe(true);
    expect(detail.pendingReview?.drafts).toBe(2);
  });

  it('changes in memory when a thread is resolved and a draft is added', async () => {
    const fx = new FixtureProvider();
    const r = { repo: 'acme-co/acme-api', number: 310 };
    const before = await fx.detail(r, undefined);
    const openThread = (before.thread ?? []).find((t) => t.kind === 'thread' && !t.resolved && t.pending !== true);
    expect(openThread?.kind).toBe('thread');
    if (openThread?.kind !== 'thread' || !openThread.threadId) throw new Error('fixture has no thread id');
    await fx.resolveThread({ ...r, threadId: openThread.threadId });
    await fx.addDraftComment({ ...r, ...line });
    const after = await fx.detail(r, undefined);
    expect((after.thread ?? []).find((t) => t.kind === 'thread' && t.threadId === openThread.threadId)).toMatchObject({ resolved: true });
    expect(after.pendingReview?.drafts).toBe(3);
  });

  it('clears the drafts when the pending review is discarded', async () => {
    const fx = new FixtureProvider();
    const r = { repo: 'acme-co/acme-api', number: 310 };
    await fx.discardPendingReview(r);
    expect((await fx.detail(r, undefined)).pendingReview).toBeUndefined();
  });
});
