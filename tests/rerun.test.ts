import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import type { RerunMode } from '../server/provider';
import { SeenStore } from '../server/seen';

const PORT = 4478;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;

class Spy extends FixtureProvider {
  reruns: { repo: string; number: number; runId: number; mode: RerunMode }[] = [];
  override async rerun(args: { repo: string; number: number; runId: number; mode: RerunMode }) {
    this.reruns.push(args);
    return { ok: true, message: 'Failed jobs re-run' };
  }
}

const headers = (extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  host: `127.0.0.1:${PORT}`,
  origin: ORIGIN,
  'x-nod-token': TOKEN,
  ...extra,
});

function post(provider: Spy, body: unknown, extra: Record<string, string> = {}) {
  const app = createApp({ provider, port: PORT, token: TOKEN });
  return app.request(`${ORIGIN}/api/rerun`, {
    method: 'POST',
    headers: headers(extra),
    body: JSON.stringify(body),
  });
}

const good = { repo: 'acme-co/acme-api', number: 7, runId: 99, mode: 'failed' };

describe('POST /api/rerun', () => {
  it('re-runs the failed jobs of a run', async () => {
    const spy = new Spy();
    const res = await post(spy, good);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: 'Failed jobs re-run' });
    expect(spy.reruns).toEqual([{ repo: 'acme-co/acme-api', number: 7, runId: 99, mode: 'failed' }]);
  });

  it('refuses a repo name that fails REPO_RE', async () => {
    const spy = new Spy();
    expect((await post(spy, { ...good, repo: 'acme-api' })).status).toBe(400);
    expect((await post(spy, { ...good, repo: 'acme-co/acme-api/x' })).status).toBe(400);
    expect((await post(spy, { ...good, repo: '..' })).status).toBe(400);
    expect(spy.reruns).toEqual([]);
  });

  it('refuses a bad runId and an unknown mode', async () => {
    const spy = new Spy();
    expect((await post(spy, { ...good, runId: 1.5 })).status).toBe(400);
    expect((await post(spy, { ...good, runId: '99' })).status).toBe(400);
    expect((await post(spy, { ...good, runId: 0 })).status).toBe(400);
    expect((await post(spy, { ...good, mode: 'some' })).status).toBe(400);
    expect(spy.reruns).toEqual([]);
  });

  it('sits behind the mutation guard', async () => {
    const spy = new Spy();
    const res = await post(spy, good, { 'x-nod-token': 'wrong' });
    expect(res.status).toBe(403);
    expect(spy.reruns).toEqual([]);
  });
});

describe('GitHub rerun path', () => {
  function provider(status = 201) {
    const urls: { url: string; method: string | undefined }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      urls.push({ url: String(input), method: init?.method });
      return new Response('', { status });
    }) as typeof fetch;
    const client = new GithubClient(TOKEN, fetchImpl, () => undefined);
    const p = new GithubProvider(client, new SeenStore(null));
    return { p, urls };
  }

  it.each([
    ['failed', 'rerun-failed-jobs'],
    ['all', 'rerun'],
  ] as const)('POSTs the %s mode to the owner and repo path', async (mode, suffix) => {
    const { p, urls } = provider();
    const res = await p.rerun({ repo: 'acme-co/acme-api', number: 7, runId: 99, mode });
    expect(res.ok).toBe(true);
    expect(urls).toEqual([
      { url: `https://api.github.com/repos/acme-co/acme-api/actions/runs/99/${suffix}`, method: 'POST' },
    ]);
  });

  it('reports a GitHub refusal as not ok', async () => {
    const { p } = provider(403);
    const res = await p.rerun({ repo: 'acme-co/acme-api', number: 7, runId: 99, mode: 'all' });
    expect(res.ok).toBe(false);
  });
});
