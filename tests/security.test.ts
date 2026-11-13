import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;

function app() {
  return createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN });
}

const seenBody = JSON.stringify({ id: 'PR_x', updatedAt: 'now', headSha: 'abc', commitCount: 1 });

function post(headers: Record<string, string>) {
  return app().request(`${ORIGIN}/api/seen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${PORT}`, ...headers },
    body: seenBody,
  });
}

describe('host guard', () => {
  it('allows 127.0.0.1 and localhost on the server port', async () => {
    for (const host of [`127.0.0.1:${PORT}`, `localhost:${PORT}`]) {
      const res = await app().request(`${ORIGIN}/api/inbox`, { headers: { host } });
      expect(res.status).toBe(200);
    }
  });

  it('rejects a foreign Host header (DNS rebinding)', async () => {
    const res = await app().request(`${ORIGIN}/api/inbox`, { headers: { host: 'evil.example:4477' } });
    expect(res.status).toBe(403);
  });

  it('allows a *.localhost Host on any port', async () => {
    const res = await app().request(`${ORIGIN}/api/inbox`, {
      headers: { host: 'x.orca.localhost:37199' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a lookalike Host', async () => {
    const res = await app().request(`${ORIGIN}/api/inbox`, {
      headers: { host: 'localhost.evil.com:4477' },
    });
    expect(res.status).toBe(403);
  });
});

describe('mutation guard', () => {
  it('rejects a request without the session token', async () => {
    const res = await post({ origin: ORIGIN });
    expect(res.status).toBe(403);
  });

  it('rejects a wrong session token', async () => {
    const res = await post({ origin: ORIGIN, 'x-nod-token': 'nope' });
    expect(res.status).toBe(403);
  });

  it('rejects a foreign Origin even with the right token', async () => {
    const res = await post({ origin: 'https://evil.example', 'x-nod-token': TOKEN });
    expect(res.status).toBe(403);
  });

  it('allows an *.localhost Origin on any port', async () => {
    const res = await post({
      origin: 'http://x.orca.localhost:37199',
      'x-nod-token': TOKEN,
    });
    expect(res.status).toBe(200);
  });

  it('rejects lookalike, https and null Origins', async () => {
    for (const origin of [
      'http://evil.com',
      'http://localhost.evil.com',
      'https://x.localhost.evil.com',
      'null',
    ]) {
      const res = await post({ origin, 'x-nod-token': TOKEN });
      expect(res.status).toBe(403);
    }
  });

  it('rejects a good *.localhost Origin with a wrong token', async () => {
    const res = await post({
      origin: 'http://x.orca.localhost:37199',
      'x-nod-token': 'nope',
    });
    expect(res.status).toBe(403);
  });

  it('rejects a request with no Origin', async () => {
    const res = await post({ 'x-nod-token': TOKEN });
    expect(res.status).toBe(403);
  });

  it('accepts the right token from the right Origin', async () => {
    const res = await post({ origin: ORIGIN, 'x-nod-token': TOKEN });
    expect(res.status).toBe(200);
  });
});

describe('input validation', () => {
  it('rejects a malformed PR reference', async () => {
    const res = await app().request(`${ORIGIN}/api/pr/acme-co/bad%20repo/1`, {
      headers: { host: `127.0.0.1:${PORT}` },
    });
    expect(res.status).toBe(400);
  });
});
