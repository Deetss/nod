import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import type { PrRef } from '../server/provider';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { TEST_SETTINGS } from './bot-settings';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;

class Spy extends FixtureProvider {
  posted: { ref: PrRef; body: string }[] = [];
  override async comment(ref: PrRef, body: string) {
    this.posted.push({ ref, body });
    return { ok: true, message: 'Comment posted' };
  }
}

const headers = (extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  host: `127.0.0.1:${PORT}`,
  origin: ORIGIN,
  'x-nod-token': TOKEN,
  ...extra,
});

function post(provider: Spy, body: unknown, extra: Record<string, string> = {}, settings: Settings = TEST_SETTINGS) {
  const app = createApp({ provider, port: PORT, token: TOKEN, settings });
  return app.request(`${ORIGIN}/api/pr-comment`, {
    method: 'POST',
    headers: headers(extra),
    body: JSON.stringify(body),
  });
}

const good = { repo: 'acme-co/acme-web', number: 42, body: '/bot fix the failing check "test (shard 2)": https://example.test/run/1' };

describe('POST /api/pr-comment', () => {
  it('posts a /bot comment', async () => {
    const spy = new Spy();
    const res = await post(spy, good);
    expect(res.status).toBe(200);
    expect(spy.posted).toEqual([{ ref: { repo: 'acme-co/acme-web', number: 42 }, body: good.body }]);
  });

  it('refuses a body without /bot', async () => {
    const spy = new Spy();
    const res = await post(spy, { ...good, body: 'please fix the checks' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'The comment must start with /bot' });
    expect(spy.posted).toEqual([]);
  });

  it('refuses an empty body and one over 4000 characters', async () => {
    const spy = new Spy();
    expect((await post(spy, { ...good, body: '  ' })).status).toBe(400);
    expect((await post(spy, { ...good, body: `/bot ${'x'.repeat(4000)}` })).status).toBe(400);
    expect(spy.posted).toEqual([]);
  });

  it('sits behind the mutation guard', async () => {
    const spy = new Spy();
    const res = await post(spy, good, { 'x-nod-token': 'wrong' });
    expect(res.status).toBe(403);
    expect(spy.posted).toEqual([]);
  });

  it('refuses a bad PR reference', async () => {
    const spy = new Spy();
    expect((await post(spy, { ...good, repo: '../etc' })).status).toBe(400);
  });

  it("checks for the configured bot's command", async () => {
    const spy = new Spy();
    const fixer = { ...TEST_SETTINGS, bot: { ...TEST_SETTINGS.bot, command: '/fixer' } };
    expect((await post(spy, good, {}, fixer)).status).toBe(400);
    expect((await post(spy, { ...good, body: '/fixer fix it' }, {}, fixer)).status).toBe(200);
  });

  it('refuses every comment when no bot is configured', async () => {
    const spy = new Spy();
    const res = await post(spy, good, {}, DEFAULT_SETTINGS);
    expect(res.status).toBe(400);
    expect(spy.posted).toEqual([]);
  });
});
