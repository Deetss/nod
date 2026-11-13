// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pushSubscribe = vi.fn(async (_sub: unknown) => ({ ok: true }));
vi.mock('../web/api', () => ({ api: { pushSubscribe: (s: unknown) => pushSubscribe(s) } }));

const { resyncPush } = await import('../web/phone/usePush');

const SW_SOURCE = readFileSync(join(process.cwd(), 'web/public/sw.js'), 'utf8');
const ORIGIN = 'https://nod.example.ts.net';

interface FakeWindow {
  navigate?: (url: string) => Promise<FakeWindow | null>;
  focus: () => Promise<FakeWindow>;
}

/** Loads sw.js against a fake worker scope and returns its listeners and recorders. */
function loadWorker(windows: FakeWindow[] = []) {
  const listeners = new Map<string, (event: unknown) => void>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn),
    skipWaiting: () => undefined,
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: async () => undefined,
      matchAll: async () => windows,
      openWindow: async (url: string) => {
        opened.push(url);
        return null;
      },
    },
  };
  runInNewContext(SW_SOURCE, { self, URL, encodeURIComponent });
  const fire = async (name: string, event: Record<string, unknown>) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get(name)?.({ ...event, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { fire, shown, opened };
}

const target = { kind: 'pr', repo: 'acme-api', number: 7 };
const targetUrl = `${ORIGIN}/?open=pr/acme-api/7`;

describe('service worker', () => {
  it('shows a push with its title, body and a tag per target', async () => {
    const sw = loadWorker();
    await sw.fire('push', { data: { json: () => ({ title: 'Merged: acme-api #7', body: 'Ship it', target }) } });
    expect(sw.shown).toEqual([
      {
        title: 'Merged: acme-api #7',
        options: expect.objectContaining({ body: 'Ship it', tag: 'pr/acme-api/7', data: { target } }),
      },
    ]);
  });

  it('passes the monochrome badge for the status bar and keeps the colour icon', async () => {
    const sw = loadWorker();
    await sw.fire('push', { data: { json: () => ({ title: 't', body: 'b', target }) } });
    expect(sw.shown[0]!.options).toMatchObject({ badge: '/icons/badge-96.png', icon: '/icons/icon-192.png' });
    expect(existsSync(join(process.cwd(), 'web/public/icons/badge-96.png'))).toBe(true);
  });

  it('still shows a notification when the payload is not JSON', async () => {
    const sw = loadWorker();
    await sw.fire('push', { data: { json: () => JSON.parse('nope') } });
    expect(sw.shown.map((s) => s.title)).toEqual(['Nod']);
  });

  it('a tap navigates an open window to the target and focuses it', async () => {
    const win: FakeWindow = { navigate: async () => win, focus: vi.fn(async () => win) };
    const navigate = vi.spyOn(win, 'navigate' as never);
    const sw = loadWorker([win]);
    await sw.fire('notificationclick', { notification: { close: () => undefined, data: { target } } });
    expect(navigate).toHaveBeenCalledWith(targetUrl);
    expect(win.focus).toHaveBeenCalled();
    expect(sw.opened).toEqual([]);
  });

  it('a tap opens a new window when the open one is not controlled by the worker', async () => {
    const stranger: FakeWindow = {
      navigate: async () => {
        throw new TypeError('not controlled');
      },
      focus: vi.fn(),
    };
    const sw = loadWorker([stranger]);
    await sw.fire('notificationclick', { notification: { close: () => undefined, data: { target } } });
    expect(sw.opened).toEqual([targetUrl]);
  });
});

describe('push subscription resync', () => {
  afterEach(() => {
    pushSubscribe.mockClear();
    vi.unstubAllGlobals();
  });

  function stubBrowser(permission: NotificationPermission, sub: object | null) {
    vi.stubGlobal('Notification', { permission });
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) },
    });
  }

  it('sends the subscription the browser holds, so a re-paired or reinstalled phone is reachable', async () => {
    const sub = {
      endpoint: 'https://fcm.example/new',
      toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
    };
    stubBrowser('granted', sub);
    await resyncPush();
    expect(pushSubscribe).toHaveBeenCalledWith({ endpoint: 'https://fcm.example/new', keys: { p256dh: 'p', auth: 'a' } });
  });

  it('sends nothing without permission or a subscription', async () => {
    stubBrowser('default', { endpoint: 'x', toJSON: () => ({}) });
    await resyncPush();
    stubBrowser('granted', null);
    await resyncPush();
    expect(pushSubscribe).not.toHaveBeenCalled();
  });
});
