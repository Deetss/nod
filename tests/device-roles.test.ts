import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { DeviceStore, deviceNameFromUserAgent } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { PairingCodes } from '../server/pairing';
import type { PhoneAccess } from '../server/security';
import type { DeviceRole, DeviceSelf, DevicesResponse, PairCode } from '../shared/pairing';
import { DEFAULT_SETTINGS } from '../shared/settings';

const PORT = 4477;
const TOKEN = 'test-token';
const PHONE: PhoneAccess = { host: 'hub.example.ts.net', owner: 'owner@example.com' };
const LOOPBACK = `http://127.0.0.1:${PORT}`;
const JSON_HEADERS = { 'content-type': 'application/json' };
const DESKTOP = { host: `127.0.0.1:${PORT}`, origin: LOOPBACK, 'x-nod-token': TOKEN };
const TAILNET = { host: PHONE.host, 'tailscale-user-login': PHONE.owner };
const TAILNET_WRITE = { ...TAILNET, origin: `https://${PHONE.host}`, 'x-nod-token': TOKEN };
const VALID_SETTINGS = { ...DEFAULT_SETTINGS, orgs: ['acme-co'] };

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'nod-roles-'));
  const devices = DeviceStore.memory();
  const settingsPath = join(dir, 'app-settings.json');
  const app = createApp({
    provider: new FixtureProvider(),
    port: PORT,
    token: TOKEN,
    phone: PHONE,
    devices,
    pairing: new PairingCodes(),
    settingsPath,
    version: '0.2.32',
  });
  const req = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    app.request(`${LOOPBACK}${path}`, init);
  const cookieFor = async (role: DeviceRole) => `nod_device=${await devices.add(`Test ${role}`, role)}`;
  return { devices, req, cookieFor, settingsPath };
}

/** Every admin route, as a tailnet request would send it. */
function adminCalls(firstDeviceId: string): { name: string; init: RequestInit & { path: string } }[] {
  const post = (path: string, body: unknown) => ({ path, method: 'POST', body: JSON.stringify(body) });
  return [
    { name: 'list devices', init: { path: '/api/devices', method: 'GET' } },
    { name: 'create a code', init: post('/api/pair/code', {}) },
    { name: 'create an admin code', init: post('/api/pair/code', { role: 'admin' }) },
    { name: 'rename', init: post('/api/devices/rename', { id: firstDeviceId, name: 'Renamed' }) },
    { name: 'revoke', init: post('/api/devices/revoke', { id: 'nope' }) },
    { name: 'save settings', init: { path: '/api/settings', method: 'PUT', body: JSON.stringify(VALID_SETTINGS) } },
  ];
}

describe('device roles', () => {
  it('loads records saved before roles existed as phones', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-roles-'));
    const path = join(dir, 'devices.json');
    const old = { id: 'a1', name: 'Pixel', hash: 'h1', createdAt: '2026-11-01T00:00:00Z', lastSeen: '2026-11-01T00:00:00Z' };
    const odd = { ...old, id: 'a2', hash: 'h2', role: 'root' };
    await writeFile(path, JSON.stringify({ devices: [old, odd] }));
    const store = await DeviceStore.open(path);
    expect(store.list().map((d) => d.role)).toEqual(['phone', 'phone']);
  });

  it('defaults a new device to phone and keeps the role on disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-roles-'));
    const path = join(dir, 'devices.json');
    const store = await DeviceStore.open(path);
    const phone = await store.add('Pixel');
    const admin = await store.add('Desk', 'admin');
    expect(store.roleForKey(phone)).toBe('phone');
    expect(store.roleForKey(admin)).toBe('admin');
    expect(store.roleForKey('unknown')).toBeUndefined();
    const reopened = await DeviceStore.open(path);
    expect(reopened.list().map((d) => [d.name, d.role])).toEqual([
      ['Pixel', 'phone'],
      ['Desk', 'admin'],
    ]);
  });

  it('names a desktop from a desktop user agent', () => {
    const linux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Electron/44.9.1';
    expect(deviceNameFromUserAgent(linux, 'admin')).toBe('Desktop');
    expect(deviceNameFromUserAgent(linux)).toBe('Phone');
  });

  it('carries the code role to the paired device', async () => {
    const { req, devices } = await setup();
    for (const role of ['phone', 'desktop', 'admin'] as const) {
      const res = await req('/api/pair/code', {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...DESKTOP },
        body: JSON.stringify(role === 'phone' ? {} : { role }),
      });
      const code = (await res.json()) as PairCode;
      expect(code.role).toBe(role);
      const paired = await req('/api/pair', {
        method: 'POST',
        headers: { ...JSON_HEADERS, ...TAILNET },
        body: JSON.stringify({ code: code.code }),
      });
      expect(paired.status).toBe(200);
      const key = /nod_device=([^;]+)/.exec(paired.headers.get('set-cookie') ?? '')?.[1] ?? '';
      expect(devices.roleForKey(key)).toBe(role);
    }
    expect(devices.list().map((d) => d.role)).toEqual(['phone', 'desktop', 'admin']);
  });

  it('refuses an unknown role for a code', async () => {
    const { req } = await setup();
    const res = await req('/api/pair/code', {
      method: 'POST',
      headers: { ...JSON_HEADERS, ...DESKTOP },
      body: JSON.stringify({ role: 'root' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('admin routes over the tailnet', () => {
  for (const role of ['phone', 'desktop'] as const) {
    it(`refuses a ${role} key on every admin route, even with token and Origin`, async () => {
      const { req, cookieFor, devices, settingsPath } = await setup();
      const cookie = await cookieFor(role);
      const id = devices.list()[0]!.id;
      for (const call of adminCalls(id)) {
        const { path, ...init } = call.init;
        const res = await req(path, { ...init, headers: { ...JSON_HEADERS, ...TAILNET_WRITE, cookie } });
        expect(res.status, call.name).toBe(403);
        expect(await res.text(), call.name).toBe('Admin device only');
      }
      expect(devices.list()[0]!.name).toBe(`Test ${role}`);
      await expect(readFile(settingsPath, 'utf8')).rejects.toThrow();
    });
  }

  it('allows an admin key on every admin route', async () => {
    const { req, cookieFor, devices, settingsPath } = await setup();
    const cookie = await cookieFor('admin');
    const id = devices.list()[0]!.id;
    for (const call of adminCalls(id)) {
      const { path, ...init } = call.init;
      const res = await req(path, { ...init, headers: { ...JSON_HEADERS, ...TAILNET_WRITE, cookie } });
      expect(res.status, call.name).toBe(call.name === 'revoke' ? 404 : 200);
    }
    expect(devices.list()[0]!.name).toBe('Renamed');
    expect((JSON.parse(await readFile(settingsPath, 'utf8')) as { orgs: string[] }).orgs).toEqual(['acme-co']);
  });

  it('still needs the session token and the Origin for an admin key', async () => {
    const { req, cookieFor } = await setup();
    const cookie = await cookieFor('admin');
    const noToken = { ...JSON_HEADERS, ...TAILNET, origin: `https://${PHONE.host}`, cookie };
    const badOrigin = { ...JSON_HEADERS, ...TAILNET_WRITE, origin: 'https://evil.example', cookie };
    const noOrigin = { ...JSON_HEADERS, ...TAILNET, 'x-nod-token': TOKEN, cookie };
    for (const headers of [noToken, badOrigin, noOrigin]) {
      const res = await req('/api/pair/code', { method: 'POST', headers, body: '{}' });
      expect(res.status).toBe(403);
    }
  });

  it('refuses an unknown key before the admin check', async () => {
    const { req } = await setup();
    const res = await req('/api/devices', { headers: { ...TAILNET, cookie: 'nod_device=forged' } });
    expect(res.status).toBe(401);
  });

  it('keeps Update phones and the test push loopback only, even for an admin key', async () => {
    const { req, cookieFor } = await setup();
    const cookie = await cookieFor('admin');
    for (const path of ['/api/phones/update', '/api/notifications/test']) {
      const res = await req(path, { method: 'POST', headers: { ...JSON_HEADERS, ...TAILNET_WRITE, cookie }, body: '{}' });
      expect(res.status, path).toBe(403);
    }
  });

  it('never returns a key or a hash', async () => {
    const { req, cookieFor } = await setup();
    const cookie = await cookieFor('admin');
    const key = cookie.split('=')[1]!;
    const text = await (await req('/api/devices', { headers: { ...TAILNET, cookie } })).text();
    const body = JSON.parse(text) as DevicesResponse;
    expect(Object.keys(body.devices[0]!).sort()).toEqual(['createdAt', 'id', 'lastSeen', 'name', 'role']);
    const me = await (await req('/api/devices/me', { headers: { ...TAILNET, cookie } })).text();
    for (const out of [text, me]) {
      expect(out).not.toContain(key);
      expect(out).not.toMatch(/[0-9a-f]{64}/);
    }
  });
});

describe('GET /api/devices/me', () => {
  it('reports the role of the calling device and the version', async () => {
    const { req, cookieFor } = await setup();
    for (const role of ['phone', 'desktop', 'admin'] as const) {
      const res = await req('/api/devices/me', { headers: { ...TAILNET, cookie: await cookieFor(role) } });
      expect((await res.json()) as DeviceSelf).toEqual({ role, version: '0.2.32' });
    }
  });

  it('says not paired with no key, and admin on loopback', async () => {
    const { req } = await setup();
    expect((await req('/api/devices/me', { headers: TAILNET })).status).toBe(401);
    const local = await req('/api/devices/me', { headers: { host: `127.0.0.1:${PORT}` } });
    expect(((await local.json()) as DeviceSelf).role).toBe('admin');
  });
});
