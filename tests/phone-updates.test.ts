import { describe, expect, it } from 'vitest';
import type { PhonesUpdateResult } from '../shared/build-update';
import type { PushPayload, PushSubscriptionJson } from '../shared/push';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import type { PushSender } from '../server/push';
import type { PhoneAccess } from '../server/security';
import { publishRelease } from '../server/android-release';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4477;
const TOKEN = 'test-token';
const BUILD = 'a995b64-2026-11-11T18:00:00Z';
const PHONE: PhoneAccess = { host: 'nod.example.invalid', owner: 'owner@example.com' };
const LOOPBACK = `http://127.0.0.1:${PORT}`;
const DESKTOP = { host: `127.0.0.1:${PORT}`, origin: LOOPBACK, 'x-nod-token': TOKEN, 'content-type': 'application/json' };
const tailnet = (key: string) => ({
  host: `${PHONE.host}:8443`,
  'tailscale-user-login': PHONE.owner,
  origin: `https://${PHONE.host}:8443`,
  'x-nod-token': TOKEN,
  cookie: `nod_device=${key}`,
});
const sub = (n: number): PushSubscriptionJson => ({
  endpoint: `https://push.example.com/${n}`,
  keys: { p256dh: `p${n}`, auth: `a${n}` },
});

async function setup(opts: { androidDir?: string } = {}) {
  const devices = DeviceStore.memory();
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const pushSender: PushSender = async (s, payload) => {
    sent.push({ endpoint: s.endpoint, payload });
  };
  const app = createApp({
    provider: new FixtureProvider(),
    port: PORT,
    token: TOKEN,
    phone: PHONE,
    devices,
    vapidPublicKey: 'k',
    pushSender,
    buildId: BUILD,
    androidDir: opts.androidDir ?? (await mkdtemp(join(tmpdir(), 'nod-android-'))),
  });
  const req = (path: string, init: RequestInit = {}) => app.request(`${LOOPBACK}${path}`, init);
  const update = () => req('/api/phones/update', { method: 'POST', headers: DESKTOP, body: '{}' });
  return { app, devices, sent, req, update };
}

/** Opens `/api/events` and reads it until `until` holds. */
async function events(req: (p: string, i?: RequestInit) => Response | Promise<Response>, path: string, headers: Record<string, string>) {
  const res = await req(path, { headers });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const until = async (needle: string) => {
    while (!text.includes(needle)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    return text;
  };
  return { res, until, close: () => reader.cancel() };
}

describe('build id on the server', () => {
  it('is reported by /api/health', async () => {
    const { req } = await setup();
    const res = await req('/api/health', { headers: { host: `127.0.0.1:${PORT}` } });
    expect(await res.json()).toEqual({ app: 'nod', build: BUILD });
  });

  it('is the first event on the live stream', async () => {
    const { req } = await setup();
    const stream = await events(req, '/api/events', { host: `127.0.0.1:${PORT}` });
    const text = await stream.until('event: sync');
    expect(text.indexOf('event: build')).toBeLessThan(text.indexOf('event: sync'));
    expect(text).toContain(`"build":"${BUILD}"`);
    await stream.close();
  });
});

describe('Update phones', () => {
  it('reloads live phones and pushes to subscribed phones that are not connected', async () => {
    const { req, devices, sent, update } = await setup();
    const live = await devices.add('Pixel 8');
    const away = await devices.add('Pixel 6');
    // Paired with no push subscription and no stream: nothing reaches it.
    await devices.add('Tablet');
    await devices.setPush(live, sub(1));
    await devices.setPush(away, sub(2));

    const phone = await events(req, '/api/events', tailnet(live));
    await phone.until('event: sync');
    // The desktop's own stream is not a phone and is not counted.
    const desktop = await events(req, '/api/events', { host: `127.0.0.1:${PORT}` });
    await desktop.until('event: sync');

    const res = await update();
    expect(res.status).toBe(200);
    expect((await res.json()) as PhonesUpdateResult).toEqual({ reloaded: 1, notified: 1, apkNotified: 0 });
    const text = await phone.until('event: reload');
    expect(text).toMatch(/event: reload\ndata: \{"kind":"reload","build":"a995b64[^"]*","nonce":"[0-9a-f]+"\}/);
    expect(sent).toEqual([{ endpoint: sub(2).endpoint, payload: { title: 'Nod updated', body: 'Tap to open the new version' } }]);
    await phone.close();
    await desktop.close();
  });

  it('tells a phone on an older APK about the app update', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-android-'));
    const apk = join(dir, 'signed.apk');
    await writeFile(apk, 'APK');
    await publishRelease(apk, { versionCode: 5, versionName: '1.0.5' }, dir);
    const { req, devices, sent, update } = await setup({ androidDir: dir });
    const old = await devices.add('Pixel 8');
    await devices.setPush(old, sub(1));

    // The app reports its version on the live stream; then the phone goes away.
    const phone = await events(req, '/api/events?apk=4', tailnet(old));
    await phone.until('event: sync');
    await phone.close();
    await new Promise((r) => setTimeout(r, 10));

    expect(await (await update()).json()).toEqual({ reloaded: 0, notified: 1, apkNotified: 1 });
    expect(sent[0]?.payload.title).toBe('App update available');
  });

  it('without push reloads live phones only', async () => {
    const devices = DeviceStore.memory();
    const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, phone: PHONE, devices });
    await devices.setPush(await devices.add('Pixel'), sub(1));
    const res = await app.request(`${LOOPBACK}/api/phones/update`, { method: 'POST', headers: DESKTOP, body: '{}' });
    expect(await res.json()).toEqual({ reloaded: 0, notified: 0, apkNotified: 0 });
  });

  it('is loopback only and needs the session token', async () => {
    const { devices, req, sent } = await setup();
    const key = await devices.add('Pixel');
    await devices.setPush(key, sub(1));
    const fromPhone = await req('/api/phones/update', { method: 'POST', headers: { ...tailnet(key), 'content-type': 'application/json' }, body: '{}' });
    expect(fromPhone.status).toBe(403);
    expect(await fromPhone.text()).toBe('Loopback only');
    const noToken = await req('/api/phones/update', {
      method: 'POST',
      headers: { ...DESKTOP, 'x-nod-token': 'wrong' },
      body: '{}',
    });
    expect(noToken.status).toBe(403);
    const crossSite = await req('/api/phones/update', {
      method: 'POST',
      headers: { ...DESKTOP, origin: 'https://evil.example.com' },
      body: '{}',
    });
    expect(crossSite.status).toBe(403);
    expect(sent).toEqual([]);
  });
});
