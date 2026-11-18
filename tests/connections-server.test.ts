import { describe, expect, it, vi } from 'vitest';
import type { ConnectionsBody } from '../shared/connections';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { Orca } from '../server/orca';
import type { PhoneAccess } from '../server/security';
import { parseServeStatus, SERVE_TTL_MS, TailscaleServe } from '../server/tailscale-serve';

const PORT = 4477;
const TOKEN = 'test-session-token';
const PHONE: PhoneAccess = { host: 'hub.example.ts.net', owner: 'owner@example.com' };
const LOOPBACK = `http://127.0.0.1:${PORT}`;
const TAILNET = { host: PHONE.host, 'tailscale-user-login': PHONE.owner };
const PUSH = { endpoint: 'https://push.example.invalid/sub/secret-endpoint', keys: { p256dh: 'p256-secret', auth: 'auth-secret' } };

const served = (proxy = `http://127.0.0.1:${PORT}`, extra: Record<string, unknown> = {}) => ({
  TCP: { '443': { HTTPS: true } },
  Web: { 'hub.example.ts.net:443': { Handlers: { '/': { Proxy: proxy }, ...extra } } },
});

describe('parseServeStatus', () => {
  it('is served when the only 443 handler is / to this port', () => {
    expect(parseServeStatus(served(), PORT)).toBe('served');
  });

  it('is elsewhere for another port, another path or a second handler', () => {
    expect(parseServeStatus(served('http://127.0.0.1:9999'), PORT)).toBe('elsewhere');
    expect(parseServeStatus(served(undefined, { '/api': { Proxy: 'http://127.0.0.1:1' } }), PORT)).toBe('elsewhere');
    const pathOnly = { Web: { 'hub.example.ts.net:443': { Handlers: { '/nod': { Proxy: `http://127.0.0.1:${PORT}` } } } } };
    expect(parseServeStatus(pathOnly, PORT)).toBe('elsewhere');
  });

  it('is off with no config, no 443 site, or junk', () => {
    expect(parseServeStatus({}, PORT)).toBe('off');
    expect(parseServeStatus(null, PORT)).toBe('off');
    expect(parseServeStatus('nope', PORT)).toBe('off');
    expect(parseServeStatus({ Web: { 'hub.example.ts.net:8443': { Handlers: { '/': { Proxy: LOOPBACK } } } } }, PORT)).toBe('off');
  });
});

describe('TailscaleServe', () => {
  it('reads off when tailscale is missing, without an error', async () => {
    const serve = new TailscaleServe({ port: PORT, exec: () => Promise.reject(new Error('spawn tailscale ENOENT')) });
    expect(await serve.status('https://hub.example.ts.net')).toEqual({ serve: 'off', at: expect.any(Number) });
  });

  it('caches for 20 s, probes reach only while served, and fresh skips the cache', async () => {
    let now = 0;
    const exec = vi.fn(() => Promise.resolve(JSON.stringify(served())));
    const reach = vi.fn(() => Promise.resolve(false));
    const serve = new TailscaleServe({ port: PORT, exec, reach, now: () => now });
    expect(await serve.status('https://x')).toMatchObject({ serve: 'served', reachable: false });
    now = SERVE_TTL_MS - 1;
    await serve.status('https://x');
    expect(exec).toHaveBeenCalledTimes(1);
    await serve.status('https://x', true);
    expect(exec).toHaveBeenCalledTimes(2);
    now = 2 * SERVE_TTL_MS + 1;
    await serve.status('https://x');
    expect(exec).toHaveBeenCalledTimes(3);
    expect(reach).toHaveBeenCalledTimes(3);
  });
});

async function setup() {
  const devices = DeviceStore.memory();
  const phoneKey = await devices.add('Android phone');
  const laptopKey = await devices.add('Laptop browser');
  await devices.setPush(phoneKey, PUSH);
  const app = createApp({
    provider: new FixtureProvider(),
    port: PORT,
    token: TOKEN,
    phone: PHONE,
    devices,
    mode: 'service',
    buildId: 'build-abc',
    orca: new Orca({ exec: () => Promise.reject(new Error('missing')), candidates: ['orca-ide'] }),
    serve: new TailscaleServe({ port: PORT, exec: () => Promise.resolve(JSON.stringify(served())), reach: () => Promise.resolve(true) }),
  });
  const get = async (headers: Record<string, string>) => {
    const res = await app.request(`${LOOPBACK}/api/connections`, { headers });
    return { status: res.status, text: await res.text() };
  };
  return { get, phoneKey, laptopKey };
}

/** Nothing secret, by key name or by value, anywhere in the body. */
function expectNoSecrets(text: string, keys: string[]) {
  for (const k of ['"hash"', '"key"', '"token"', '"endpoint"', '"keys"', '"push":{']) expect(text).not.toContain(k);
  for (const v of [TOKEN, PUSH.endpoint, PUSH.keys.auth, PUSH.keys.p256dh, ...keys]) expect(text).not.toContain(v);
}

describe('GET /api/connections', () => {
  it('gives loopback the full body', async () => {
    const { get, phoneKey, laptopKey } = await setup();
    const res = await get({ host: `127.0.0.1:${PORT}` });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text) as ConnectionsBody;
    expect(body.nod).toEqual({ mode: 'service', port: PORT, build: 'build-abc' });
    expect(body.tailscale).toEqual({ on: true, url: 'https://hub.example.ts.net', serve: 'served', reachable: true });
    expect(body.github.login).toBe('acme-dev');
    expect(body.orca).toEqual({ running: false, sessions: 0 });
    expect(body.devices).toHaveLength(2);
    for (const d of body.devices) expect(Object.keys(d).sort()).toEqual(['id', 'lastSeen', 'name', 'push']);
    expect(body.devices.find((d) => d.name === 'Android phone')?.push).toBe(true);
    expectNoSecrets(res.text, [phoneKey, laptopKey]);
  });

  it('gives a paired phone its own row and only name, last-seen and push for the others', async () => {
    const { get, phoneKey, laptopKey } = await setup();
    const res = await get({ ...TAILNET, cookie: `nod_device=${phoneKey}` });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text) as ConnectionsBody;
    const self = body.devices.find((d) => d.self);
    expect(self).toMatchObject({ name: 'Android phone', push: true, self: true });
    const other = body.devices.find((d) => !d.self);
    expect(Object.keys(other ?? {}).sort()).toEqual(['lastSeen', 'name', 'push']);
    for (const d of body.devices) expect(d.id).toBeUndefined();
    expectNoSecrets(res.text, [phoneKey, laptopKey]);
  });

  it('refuses an unpaired tailnet caller', async () => {
    const { get } = await setup();
    expect((await get(TAILNET)).status).toBe(401);
  });
});
