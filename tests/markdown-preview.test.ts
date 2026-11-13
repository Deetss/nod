import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { GithubClient } from '../server/github-client';
import { GithubProvider } from '../server/github-provider';
import { SeenStore } from '../server/seen';

const PORT = 4480;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;

class Spy extends FixtureProvider {
  renders: { repo: string; text: string }[] = [];
  override async renderMarkdown(args: { repo: string; text: string }) {
    this.renders.push(args);
    return { html: '<p>spy</p>' };
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
  return app.request(`${ORIGIN}/api/markdown`, {
    method: 'POST',
    headers: headers(extra),
    body: JSON.stringify(body),
  });
}

const good = { repo: 'acme-co/acme-api', text: 'Looks **good**' };

describe('POST /api/markdown', () => {
  it('returns the rendered html from the provider', async () => {
    const spy = new Spy();
    const res = await post(spy, good);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ html: '<p>spy</p>' });
    expect(spy.renders).toEqual([good]);
  });

  it('refuses a repo name that fails REPO_RE', async () => {
    const spy = new Spy();
    expect((await post(spy, { ...good, repo: 'acme-api' })).status).toBe(400);
    expect((await post(spy, { ...good, repo: 'acme-co/acme-api/x' })).status).toBe(400);
    expect((await post(spy, { ...good, repo: '..' })).status).toBe(400);
    expect(spy.renders).toEqual([]);
  });

  it('refuses empty text and text over 65536 characters', async () => {
    const spy = new Spy();
    expect((await post(spy, { ...good, text: '' })).status).toBe(400);
    expect((await post(spy, { ...good, text: 'x'.repeat(65537) })).status).toBe(400);
    expect(spy.renders).toEqual([]);
  });

  it('accepts text at exactly 65536 characters', async () => {
    const spy = new Spy();
    expect((await post(spy, { ...good, text: 'x'.repeat(65536) })).status).toBe(200);
    expect(spy.renders.length).toBe(1);
  });

  it('sits behind the mutation guard', async () => {
    const spy = new Spy();
    const res = await post(spy, good, { 'x-nod-token': 'wrong' });
    expect(res.status).toBe(403);
    expect(spy.renders).toEqual([]);
  });
});

describe('GitHub markdown path', () => {
  function provider(status = 200, html = '<p>Looks <strong>good</strong></p>') {
    const calls: { url: string; method: string | undefined; body: unknown }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(html, { status, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;
    const client = new GithubClient(TOKEN, fetchImpl, () => undefined);
    const p = new GithubProvider(client, new SeenStore(null));
    return { p, calls };
  }

  it('POSTs gfm text with the repo as context and returns the html as is', async () => {
    const { p, calls } = provider();
    const res = await p.renderMarkdown({ repo: 'acme-co/acme-api', text: good.text });
    expect(res).toEqual({ html: '<p>Looks <strong>good</strong></p>' });
    expect(calls).toEqual([
      {
        url: 'https://api.github.com/markdown',
        method: 'POST',
        body: { text: good.text, mode: 'gfm', context: 'acme-co/acme-api' },
      },
    ]);
  });

  it('throws GitHub error text when GitHub refuses', async () => {
    const { p } = provider(422, JSON.stringify({ message: 'Bad' }));
    await expect(p.renderMarkdown({ repo: 'acme-co/acme-api', text: 'x' })).rejects.toThrow();
  });

  it('fixture preview escapes html and wraps it in a paragraph', async () => {
    const p = new FixtureProvider();
    const res = await p.renderMarkdown({ repo: 'acme-co/acme-api', text: '<b>&"x\'</b>' });
    expect(res).toEqual({ html: '<p>&lt;b&gt;&amp;&quot;x&#39;&lt;/b&gt;</p>' });
  });
});
