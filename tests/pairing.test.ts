import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevicesResponse, PairCode } from '../shared/pairing';
import { createApp } from '../server/app';
import { DeviceStore, deviceNameFromUserAgent } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { CODE_TTL_MS, EXCHANGE_LIMIT, EXCHANGE_WINDOW_MS, PairingCodes } from '../server/pairing';
import type { PhoneAccess } from '../server/security';

const PORT = 4477;
const TOKEN = 'test-token';
const PHONE: PhoneAccess = { host: 'nod.example.invalid', owner: 'owner@example.com' };
const LOOPBACK = `http://127.0.0.1:${PORT}`;
const TAILNET = { host: `${PHONE.host}:8443`, 'tailscale-user-login': PHONE.owner };
const DESKTOP = { host: `127.0.0.1:${PORT}`, origin: LOOPBACK, 'x-nod-token': TOKEN };
const JSON_HEADERS = { 'content-type': 'application/json' };

/** Pass null for phone access off. */
function setup(phone: PhoneAccess | null = PHONE) {
  const devices = DeviceStore.memory();
  const pairing = new PairingCodes();
  const app = createApp({
    provider: new FixtureProvider(),
    port: PORT,
    token: TOKEN,
    phone: phone ?? undefined,
    devices,
    pairing,
  });
  const req = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    app.request(`${LOOPBACK}${path}`, init);
  const newCode = async () => {
    const res = await req('/api/pair/code', { method: 'POST', headers: { ...JSON_HEADERS, ...DESKTOP }, body: '{}' });
    return (await res.json()) as PairCode;
  };
  const exchange = (code: string, headers: Record<string, string> = TAILNET) =>
    req('/api/pair', { method: 'POST', headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify({ code }) });
  const keyFrom = (res: Response) => /nod_device=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';
  return { devices, pairing, req, newCode, exchange, keyFrom };
}

describe('pairing codes', () => {
  it('expires after ten minutes', () => {
    let now = 1_000;
    const codes = new PairingCodes(() => now);
    const { code } = codes.create();
    now += CODE_TTL_MS - 1;
    expect(codes.consume(code)).toBe(true);

    const second = codes.create();
    now += CODE_TTL_MS;
    expect(codes.consume(second.code)).toBe(false);
  });

  it('works once', () => {
    const codes = new PairingCodes();
    const { code } = codes.create();
    expect(codes.consume('wrong')).toBe(false);
    expect(codes.consume(code)).toBe(true);
    expect(codes.consume(code)).toBe(false);
  });

  it('is replaced by a newer code', () => {
    const codes = new PairingCodes();
    const first = codes.create();
    const second = codes.create();
    expect(codes.consume(first.code)).toBe(false);
    expect(codes.consume(second.code)).toBe(true);
  });

  it('limits tries to five a minute, then recovers', () => {
    let now = 0;
    const codes = new PairingCodes(() => now);
    for (let i = 0; i < EXCHANGE_LIMIT; i++) expect(codes.allow()).toBe(true);
    expect(codes.allow()).toBe(false);
    now += EXCHANGE_WINDOW_MS;
    expect(codes.allow()).toBe(true);
  });
});

describe('POST /api/pair', () => {
  it('trades a code for a device key cookie with the right flags', async () => {
    const { newCode, exchange } = setup();
    const { code } = await newCode();
    const res = await exchange(code);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^nod_device=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=34560000');
    expect(cookie).toContain('Path=/');
  });

  it('rejects a reused code and a wrong code', async () => {
    const { newCode, exchange } = setup();
    const { code } = await newCode();
    expect((await exchange(code)).status).toBe(200);
    expect((await exchange(code)).status).toBe(403);
    expect((await exchange('nope')).status).toBe(403);
  });

  it('answers 429 after five tries in a minute, even for a good code', async () => {
    const { newCode, exchange } = setup();
    const { code } = await newCode();
    for (let i = 0; i < EXCHANGE_LIMIT; i++) expect((await exchange('bad')).status).toBe(403);
    const res = await exchange(code);
    expect(res.status).toBe(429);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('is closed on loopback and when phone access is off', async () => {
    const on = setup();
    const { code } = await on.newCode();
    expect((await on.exchange(code, { host: `127.0.0.1:${PORT}` })).status).toBe(403);
    expect((await setup(null).exchange('x', { host: `127.0.0.1:${PORT}` })).status).toBe(403);
  });

  it('still needs the tailnet login', async () => {
    const { newCode, exchange } = setup();
    const { code } = await newCode();
    const res = await exchange(code, { host: TAILNET.host, 'tailscale-user-login': 'other@example.com' });
    expect(res.status).toBe(403);
  });
});

describe('device key on tailnet requests', () => {
  it('is required for data and for the app page', async () => {
    const { req } = setup();
    const api = await req('/api/inbox', { headers: TAILNET });
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: 'Not paired' });

    const page = await req('/', { headers: TAILNET });
    expect(page.status).toBe(401);
  });

  it('shows an unpaired phone a page with no data and no token', async () => {
    const { req } = setup();
    const page = await req('/', { headers: TAILNET });
    const html = await page.text();
    expect(html).toContain('<h1>Not paired</h1>');
    expect(html).toContain('click the phone icon in the top bar');
    expect(html).not.toContain(TOKEN);
    expect(html).not.toContain('nod-token');
  });

  it('refuses an unknown key', async () => {
    const { req } = setup();
    const res = await req('/api/inbox', { headers: { ...TAILNET, cookie: 'nod_device=forged' } });
    expect(res.status).toBe(401);
  });

  it('accepts a paired key, and a loopback host forwarded by Tailscale still needs it', async () => {
    const { newCode, exchange, keyFrom, req } = setup();
    const key = keyFrom(await exchange((await newCode()).code));
    const cookie = `nod_device=${key}`;
    expect((await req('/api/inbox', { headers: { ...TAILNET, cookie } })).status).toBe(200);

    const forwarded = { host: `127.0.0.1:${PORT}`, 'tailscale-user-login': PHONE.owner };
    expect((await req('/api/inbox', { headers: forwarded })).status).toBe(401);
    expect((await req('/api/inbox', { headers: { ...forwarded, cookie } })).status).toBe(200);
  });

  describe('cookie renewal', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const setCookieOf = (res: Response) => res.headers.get('set-cookie') ?? '';

    afterEach(() => vi.useRealTimers());

    it('re-sends the cookie at most once a day', async () => {
      vi.useFakeTimers();
      const { newCode, exchange, keyFrom, req } = setup();
      const key = keyFrom(await exchange((await newCode()).code));
      const headers = { ...TAILNET, cookie: `nod_device=${key}` };

      const first = setCookieOf(await req('/api/inbox', { headers }));
      expect(first).toContain(`nod_device=${key}`);
      expect(first).toContain('Max-Age=34560000');
      expect(first).toContain('HttpOnly');
      expect(first).toContain('Secure');
      expect(first).toContain('SameSite=Lax');

      vi.advanceTimersByTime(DAY_MS - 1000);
      expect(setCookieOf(await req('/api/inbox', { headers }))).toBe('');

      vi.advanceTimersByTime(2000);
      expect(setCookieOf(await req('/api/inbox', { headers }))).toContain('Max-Age=34560000');
    });

    it('never sets a cookie for a revoked or unknown key', async () => {
      const { newCode, exchange, keyFrom, req } = setup();
      const key = keyFrom(await exchange((await newCode()).code));
      const headers = { ...TAILNET, cookie: `nod_device=${key}` };
      const list = (await (await req('/api/devices', { headers: { host: `127.0.0.1:${PORT}` } })).json()) as DevicesResponse;
      await req('/api/devices/revoke', {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...DESKTOP },
        body: JSON.stringify({ id: list.devices[0]?.id }),
      });

      const revoked = await req('/api/inbox', { headers });
      expect(revoked.status).toBe(401);
      expect(setCookieOf(revoked)).toBe('');
      const forged = await req('/api/inbox', { headers: { ...TAILNET, cookie: 'nod_device=forged' } });
      expect(setCookieOf(forged)).toBe('');
    });

    it('does not set a cookie on loopback', async () => {
      const { req } = setup();
      const res = await req('/api/inbox', { headers: { host: `127.0.0.1:${PORT}` } });
      expect(setCookieOf(res)).toBe('');
    });
  });

  it('serves the pairing page and the manifest without a key', async () => {
    const { req } = setup();
    const pair = await req('/pair', { headers: TAILNET });
    expect(pair.status).toBe(200);
    expect(await pair.text()).toContain('/api/pair');
    expect((await req('/manifest.webmanifest', { headers: TAILNET })).status).not.toBe(401);
  });

  it('serves the app page only after the key checks out', async () => {
    const { newCode, exchange, keyFrom, req } = setup();
    const key = keyFrom(await exchange((await newCode()).code));
    const res = await req('/', { headers: { ...TAILNET, cookie: `nod_device=${key}` } });
    expect(res.status).toBe(200);
  });
});

describe('revoke', () => {
  it('invalidates the key at once', async () => {
    const { newCode, exchange, keyFrom, req } = setup();
    const cookie = `nod_device=${keyFrom(await exchange((await newCode()).code))}`;
    expect((await req('/api/inbox', { headers: { ...TAILNET, cookie } })).status).toBe(200);

    const list = (await (await req('/api/devices', { headers: { host: `127.0.0.1:${PORT}` } })).json()) as DevicesResponse;
    expect(list.devices).toHaveLength(1);
    const revoke = await req('/api/devices/revoke', {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...DESKTOP },
      body: JSON.stringify({ id: list.devices[0]?.id }),
    });
    expect(revoke.status).toBe(200);

    expect((await req('/api/inbox', { headers: { ...TAILNET, cookie } })).status).toBe(401);
  });

  it('renames a device', async () => {
    const { newCode, exchange, req } = setup();
    await exchange((await newCode()).code);
    const list = (await (await req('/api/devices', { headers: { host: `127.0.0.1:${PORT}` } })).json()) as DevicesResponse;
    await req('/api/devices/rename', {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...DESKTOP },
      body: JSON.stringify({ id: list.devices[0]?.id, name: 'Work phone' }),
    });
    const after = (await (await req('/api/devices', { headers: { host: `127.0.0.1:${PORT}` } })).json()) as DevicesResponse;
    expect(after.devices[0]?.name).toBe('Work phone');
  });
});

describe('journal lines', () => {
  const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => String(c[0]));

  afterEach(() => vi.useRealTimers());

  it('logs a pairing and a revoke', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { newCode, exchange, req } = setup();
      await exchange((await newCode()).code);
      const list = (await (await req('/api/devices', { headers: { host: `127.0.0.1:${PORT}` } })).json()) as DevicesResponse;
      const id = list.devices[0]?.id ?? '';
      await req('/api/devices/revoke', {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...DESKTOP },
        body: JSON.stringify({ id }),
      });
      expect(lines(spy).some((l) => l.includes('paired') && l.includes(id))).toBe(true);
      expect(lines(spy).some((l) => l.includes('revoked') && l.includes(id))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('logs a request with no cookie once a minute per path', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { req } = setup();
      await req('/api/inbox', { headers: TAILNET });
      await req('/api/inbox', { headers: TAILNET });
      expect(lines(spy).filter((l) => l.includes('/api/inbox'))).toHaveLength(1);
      vi.advanceTimersByTime(61_000);
      await req('/api/inbox', { headers: TAILNET });
      expect(lines(spy).filter((l) => l.includes('/api/inbox'))).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('logs a bad cookie without its value or a hash', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { req } = setup();
      const value = 'forged-secret-value';
      await req('/api/inbox', { headers: { ...TAILNET, cookie: `nod_device=${value}` } });
      const out = lines(spy).filter((l) => l.includes('/api/inbox'));
      expect(out).toHaveLength(1);
      expect(out[0]).not.toContain(value);
      expect(out[0]).not.toContain(createHash('sha256').update(value).digest('hex'));
    } finally {
      spy.mockRestore();
    }
  });
});

describe('loopback', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('stays unchanged: no key needed with phone access on', async () => {
    const { req } = setup();
    expect((await req('/api/inbox', { headers: { host: `127.0.0.1:${PORT}` } })).status).toBe(200);
  });

  it('is the only place that creates codes and manages devices', async () => {
    const { req, newCode, exchange, keyFrom } = setup();
    const paired = { ...TAILNET, cookie: `nod_device=${keyFrom(await exchange((await newCode()).code))}` };
    const code = await req('/api/pair/code', {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...paired, origin: `https://${PHONE.host}:8443`, 'x-nod-token': TOKEN },
      body: '{}',
    });
    expect(code.status).toBe(403);
    expect((await req('/api/devices', { headers: paired })).status).toBe(403);
  });

  it('refuses a code when phone access is off', async () => {
    const res = await setup(null).req('/api/pair/code', {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...DESKTOP },
      body: '{}',
    });
    expect(res.status).toBe(409);
  });

  it('returns a link on the default port with the code in the fragment', async () => {
    vi.stubEnv('NOD_PHONE_HTTPS_PORT', '');
    const { newCode } = setup();
    const made = await newCode();
    expect(made.link).toBe(`https://${PHONE.host}/pair#code=${made.code}`);
    expect(Date.parse(made.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('puts the configured port in the link', async () => {
    vi.stubEnv('NOD_PHONE_HTTPS_PORT', '8443');
    const made = await setup().newCode();
    expect(made.link).toBe(`https://${PHONE.host}:8443/pair#code=${made.code}`);
  });

  it('answers the health check', async () => {
    const res = await setup().req('/api/health', { headers: { host: `127.0.0.1:${PORT}` } });
    expect(await res.json()).toEqual({ app: 'nod', build: 'dev' });
  });
});

describe('device store file', () => {
  it('stores only a key hash, in a mode 600 file, and reloads', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ri-devices-'));
    const path = join(dir, 'state', 'devices.json');
    const store = await DeviceStore.open(path);
    const key = await store.add('Galaxy');

    const raw = await readFile(path, 'utf8');
    expect(raw).not.toContain(key);
    expect(raw).toContain(createHash('sha256').update(key).digest('hex'));
    expect((await stat(path)).mode & 0o777).toBe(0o600);

    const again = await DeviceStore.open(path);
    expect(again.verify(key)).toBe(true);
    expect(again.list().map((d) => d.name)).toEqual(['Galaxy']);
  });

  it('names a phone from its user agent', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 15; SM-S938B Build/AP3A) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
    expect(deviceNameFromUserAgent(ua)).toBe('SM-S938B');
    expect(deviceNameFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone');
    expect(deviceNameFromUserAgent('Mozilla/5.0 (Linux; Android 10; K) Chrome/130 Mobile')).toBe('Android phone');
    expect(deviceNameFromUserAgent(undefined)).toBe('Phone');
  });
});
