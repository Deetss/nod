import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_TRIGGERS_ON, DEFAULT_SETTINGS, gateDesktop, TRIGGER_KEYS, type NotifyItem } from '../shared/notify-rules';
import type { PushSubscriptionJson } from '../shared/push';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { sendTestPush } from '../server/notify-test';
import { pushPolled, type PushSender } from '../server/push';
import type { PhoneAccess } from '../server/security';

const PORT = 4477;
const TOKEN = 'test-token';
const PHONE: PhoneAccess = { host: 'nod.example.ts.net', owner: 'dev@example.com' };
const sub = (path: string): PushSubscriptionJson => ({
  endpoint: `https://push.example.com/${path}`,
  keys: { p256dh: 'p', auth: 'a' },
});

const item = (kind: NotifyItem['kind'], n: number): NotifyItem => ({
  title: `t${n}`,
  body: 'b',
  kind,
  target: { kind: 'pr', repo: 'acme-api', number: n },
});

/** A sender that records which endpoint got which title. */
function recorder() {
  const sent: { endpoint: string; title: string }[] = [];
  const send: PushSender = async (s, p) => {
    sent.push({ endpoint: s.endpoint, title: p.title });
  };
  return { sent, send };
}

function logs() {
  const lines: string[] = [];
  return { lines, log: { info: (l: string) => lines.push(l), warn: (l: string) => lines.push(l) } };
}

async function phone(devices: DeviceStore, name: string): Promise<string> {
  const key = await devices.add(name);
  await devices.setPush(key, sub(name));
  return key;
}

describe('per-phone notification switches', () => {
  it('default to every type on', async () => {
    const devices = DeviceStore.memory();
    const key = await phone(devices, 'Pixel');
    expect(devices.notifySwitches(key)).toEqual(ALL_TRIGGERS_ON);
    expect(devices.pushTargets()[0]!.switches).toEqual(ALL_TRIGGERS_ON);
  });

  it('skip only the type turned off, with one info line and no keys', async () => {
    const devices = DeviceStore.memory();
    const key = await phone(devices, 'Pixel');
    await devices.setNotifySwitches(key, { ci: false });
    const { sent, send } = recorder();
    const { lines, log } = logs();

    await pushPolled(devices, send, [item('review', 1), item('ci', 2), item('shipped', 3)], log);

    expect(sent.map((s) => s.title)).toEqual(['t1', 't3']);
    expect(lines).toContain('[notify] skipped ci for Pixel (off)');
    expect(lines.filter((l) => l.includes('skipped'))).toHaveLength(1);
    for (const l of lines) {
      expect(l).not.toContain('push.example.com');
      expect(l).not.toContain(key);
    }
  });

  it('on one phone leave another phone untouched', async () => {
    const devices = DeviceStore.memory();
    const a = await phone(devices, 'Pixel');
    const b = await phone(devices, 'Tablet');
    await devices.setNotifySwitches(a, { review: false });
    expect(devices.notifySwitches(b)).toEqual(ALL_TRIGGERS_ON);
    const { sent, send } = recorder();

    await pushPolled(devices, send, [item('review', 1)], logs().log);

    expect(sent).toEqual([{ endpoint: sub('Tablet').endpoint, title: 't1' }]);
  });

  it('collapse per phone after skipping', async () => {
    const devices = DeviceStore.memory();
    const a = await phone(devices, 'Pixel');
    await phone(devices, 'Tablet');
    await devices.setNotifySwitches(a, { ci: false });
    const { sent, send } = recorder();
    const items = [item('review', 1), item('review', 2), item('ci', 3), item('ci', 4)];

    await pushPolled(devices, send, items, logs().log);

    expect(sent.filter((s) => s.endpoint.endsWith('Pixel')).map((s) => s.title)).toEqual(['t1', 't2']);
    expect(sent.filter((s) => s.endpoint.endsWith('Tablet')).map((s) => s.title)).toEqual(['4 updates in Nod']);
  });

  it('never stop the test notification', async () => {
    const devices = DeviceStore.memory();
    const key = await phone(devices, 'Pixel');
    await devices.setNotifySwitches(key, Object.fromEntries(TRIGGER_KEYS.map((k) => [k, false])));
    const { sent, send } = recorder();

    const result = await sendTestPush(devices, send, logs().log);

    expect(sent).toHaveLength(1);
    expect(result.phones).toEqual([{ target: 'Pixel', ok: true }]);
  });

  it('are saved in devices.json and survive a reload', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'devices-')), 'devices.json');
    const devices = await DeviceStore.open(path);
    const key = await phone(devices, 'Pixel');
    await devices.setNotifySwitches(key, { shipped: false });
    const stored = JSON.parse(await readFile(path, 'utf8')) as { devices: { notify?: unknown }[] };
    expect(stored.devices[0]!.notify).toEqual({ shipped: false });
    expect((await DeviceStore.open(path)).notifySwitches(key)).toEqual({ ...ALL_TRIGGERS_ON, shipped: false });
  });
});

describe('desktop notification switches', () => {
  const items = [item('review', 1), item('ci', 2), { title: 'Nod test', body: 'b', kind: 'test' as const }];

  it('show every type by default', () => {
    expect(gateDesktop(items, DEFAULT_SETTINGS)).toEqual({ show: items, skipped: [] });
  });

  it('drop a type switched off and name it once', () => {
    const { show, skipped } = gateDesktop([...items, item('ci', 3)], { ...DEFAULT_SETTINGS, ci: false });
    expect(show.map((i) => i.kind)).toEqual(['review', 'test']);
    expect(skipped).toEqual(['ci']);
  });

  it('show nothing while muted', () => {
    expect(gateDesktop(items, { ...DEFAULT_SETTINGS, muted: true }).show).toEqual([]);
  });
});

describe('/api/push/prefs', () => {
  const url = `http://127.0.0.1:${PORT}/api/push/prefs`;
  const headers = (cookie?: string) => ({
    host: `${PHONE.host}:8443`,
    'tailscale-user-login': PHONE.owner,
    origin: `https://${PHONE.host}:8443`,
    'x-nod-token': TOKEN,
    'content-type': 'application/json',
    ...(cookie ? { cookie: `nod_device=${cookie}` } : {}),
  });

  async function setup() {
    const devices = DeviceStore.memory();
    const a = await phone(devices, 'Pixel');
    const b = await phone(devices, 'Tablet');
    const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, phone: PHONE, devices, vapidPublicKey: 'k' });
    return { devices, a, b, app };
  }

  it('read and set the calling phone only', async () => {
    const { devices, a, b, app } = await setup();
    const get = await app.request(url, { headers: headers(a) });
    expect(await get.json()).toEqual(ALL_TRIGGERS_ON);

    const set = await app.request(url, { method: 'POST', headers: headers(a), body: JSON.stringify({ ci: false }) });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ ...ALL_TRIGGERS_ON, ci: false });
    expect(devices.notifySwitches(a)).toEqual({ ...ALL_TRIGGERS_ON, ci: false });
    expect(devices.notifySwitches(b)).toEqual(ALL_TRIGGERS_ON);
  });

  it('refuse a missing or wrong device key', async () => {
    const { devices, a, app } = await setup();
    const body = JSON.stringify({ review: false });
    for (const cookie of [undefined, 'not-a-key']) {
      expect((await app.request(url, { headers: headers(cookie) })).status).toBe(401);
      expect((await app.request(url, { method: 'POST', headers: headers(cookie), body })).status).toBe(401);
    }
    expect(devices.notifySwitches(a)).toEqual(ALL_TRIGGERS_ON);
  });

  it('refuse a desktop request without a device key', async () => {
    const { app } = await setup();
    const res = await app.request(url, { headers: { host: `127.0.0.1:${PORT}` } });
    expect(res.status).toBe(401);
  });

  it('refuse unknown keys and non-boolean values', async () => {
    const { a, app } = await setup();
    for (const body of [{ deviceId: 'x' }, { ci: 'off' }]) {
      const res = await app.request(url, { method: 'POST', headers: headers(a), body: JSON.stringify(body) });
      expect(res.status).toBe(400);
    }
  });
});
