// @vitest-environment jsdom
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import type { PushSender } from '../server/push';
import type { PhoneAccess } from '../server/security';
import { notifyTestLines, type NotifyTestResult } from '../shared/notify-test';
import type { PushPayload, PushSubscriptionJson } from '../shared/push';

const testNotifications = vi.fn<() => Promise<NotifyTestResult>>();
vi.mock('../web/api', () => ({ api: { testNotifications: () => testNotifications() } }));
const { TestNotifications } = await import('../web/TestNotifications');

const PORT = 4477;
const TOKEN = 'test-token';
const PHONE: PhoneAccess = { host: 'nod.example.invalid', owner: 'owner@example.com' };
const LOOPBACK = `http://127.0.0.1:${PORT}`;
const DESKTOP = { host: `127.0.0.1:${PORT}`, origin: LOOPBACK, 'x-nod-token': TOKEN, 'content-type': 'application/json' };
const tailnet = (key: string) => ({
  host: `${PHONE.host}:8443`,
  'tailscale-user-login': PHONE.owner,
  origin: `https://${PHONE.host}:8443`,
  'x-nod-token': TOKEN,
  'content-type': 'application/json',
  cookie: `nod_device=${key}`,
});
const sub = (n: number): PushSubscriptionJson => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` } });

/** An app whose push sender answers `gone` endpoints with 410. */
async function setup(opts: { push?: boolean; gone?: string[] } = {}) {
  const devices = DeviceStore.memory();
  const sent: { endpoint: string; payload: PushPayload }[] = [];
  const pushSender: PushSender = async (s, payload) => {
    if (opts.gone?.includes(s.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
    sent.push({ endpoint: s.endpoint, payload });
  };
  const push = opts.push ?? true;
  const app = createApp({
    provider: new FixtureProvider(),
    port: PORT,
    token: TOKEN,
    phone: PHONE,
    devices,
    vapidPublicKey: push ? 'k' : undefined,
    pushSender: push ? pushSender : undefined,
    androidDir: await mkdtemp(join(tmpdir(), 'nod-android-')),
  });
  const post = (headers: Record<string, string>) =>
    app.request(`${LOOPBACK}/api/notifications/test`, { method: 'POST', headers, body: '{}' });
  return { devices, sent, post };
}

describe('POST /api/notifications/test', () => {
  it('pushes the test to every subscribed phone and reports each by name', async () => {
    const { devices, sent, post } = await setup({ gone: [sub(2).endpoint] });
    await devices.setPush(await devices.add('Pixel'), sub(1));
    await devices.setPush(await devices.add('Old phone'), sub(2));
    await devices.add('No push');

    const res = await post(DESKTOP);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      push: true,
      phones: [
        { target: 'Pixel', ok: true },
        { target: 'Old phone', ok: false, detail: 'HTTP 410, subscription removed' },
      ],
    });
    expect(sent).toEqual([{ endpoint: sub(1).endpoint, payload: { title: 'Nod test', body: 'Notifications are working.' } }]);
    expect(devices.pushSubscriptions()).toEqual([sub(1)]);
  });

  it('says push is off when phone access is off', async () => {
    const { post } = await setup({ push: false });
    expect(await (await post(DESKTOP)).json()).toEqual({ push: false, phones: [] });
  });

  it('is loopback only: a paired phone gets 403 and nothing is sent', async () => {
    const { devices, sent, post } = await setup();
    const key = await devices.add('Pixel');
    await devices.setPush(key, sub(1));

    const res = await post(tailnet(key));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Loopback only');
    expect(sent).toEqual([]);
  });

  it('needs the session token', async () => {
    const { devices, sent, post } = await setup();
    await devices.setPush(await devices.add('Pixel'), sub(1));
    expect((await post({ ...DESKTOP, 'x-nod-token': 'wrong' })).status).toBe(403);
    expect(sent).toEqual([]);
  });
});

describe('result lines', () => {
  it('list the desktop, then each phone, with the reason for a failure', () => {
    const phones = { push: true, phones: [{ target: 'Pixel', ok: false, detail: 'HTTP 500' }] };
    expect(notifyTestLines(phones, { target: 'Desktop', ok: true })).toEqual(['Desktop: sent', 'Pixel: failed (HTTP 500)']);
  });

  it('explain an empty phone list', () => {
    expect(notifyTestLines({ push: true, phones: [] }, undefined)).toEqual(['Phones: none subscribed']);
    expect(notifyTestLines({ push: false, phones: [] }, undefined)).toEqual(['Phones: push is off (phone access is off)']);
  });
});

describe('Send test notification button', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.nod;
  });

  it('tests the desktop and the phones together and lists each result', async () => {
    testNotifications.mockResolvedValue({ push: true, phones: [{ target: 'Pixel', ok: true }] });
    const testNotify = vi.fn(async () => ({ target: 'Desktop', ok: true }));
    window.nod = { testNotify } as unknown as NonNullable<typeof window.nod>;
    const host = document.createElement('div');
    document.body.append(host);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => createRoot(host).render(createElement(TestNotifications)));

    await act(async () => host.querySelector('button')!.click());

    expect(testNotify).toHaveBeenCalledOnce();
    expect(testNotifications).toHaveBeenCalledOnce();
    expect([...host.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Desktop: sent', 'Pixel: sent']);
  });
});
