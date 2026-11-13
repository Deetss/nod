// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, resetTokenCache } from '../web/api';

const page = (token: string) =>
  `<!doctype html><html><head><meta name="nod-token" content="${token}"></head><body></body></html>`;

interface Call {
  url: string;
  token: string | undefined;
}

function install(handler: (url: string, token: string | undefined, n: number) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const token = (init?.headers as Record<string, string> | undefined)?.['x-nod-token'];
      calls.push({ url, token });
      return handler(url, token, calls.length);
    }),
  );
  return calls;
}

beforeEach(() => {
  document.head.innerHTML = '<meta name="nod-token" content="old">';
  resetTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stale token recovery', () => {
  it('retries once with the refreshed token and succeeds', async () => {
    const calls = install((url, token) => {
      if (url === '/') return new Response(page('fresh'), { status: 200 });
      return token === 'fresh'
        ? Response.json({ ok: true })
        : new Response('Forbidden token', { status: 403 });
    });
    await expect(api.refresh()).resolves.toEqual({ ok: true });
    expect(calls.map((c) => [c.url, c.token])).toEqual([
      ['/api/refresh', 'old'],
      ['/', undefined],
      ['/api/refresh', 'fresh'],
    ]);
  });

  it('does not loop when the retry also fails', async () => {
    const calls = install((url) =>
      url === '/' ? new Response(page('fresh'), { status: 200 }) : new Response('Forbidden token', { status: 403 }),
    );
    await expect(api.refresh()).rejects.toThrow();
    expect(calls.filter((c) => c.url === '/api/refresh')).toHaveLength(2);
    expect(calls.filter((c) => c.url === '/')).toHaveLength(1);
  });

  it('leaves other 403s alone', async () => {
    const calls = install(() => new Response('Forbidden origin', { status: 403 }));
    await expect(api.refresh()).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
