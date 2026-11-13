import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pushPayload, type PushPayload, type PushSubscriptionJson } from '../shared/push';
import { buildAssetLinks, LEGACY_ANDROID_PACKAGE, loadAssetLinks, readFingerprint } from '../server/assetlinks';

const PACKAGE = 'org.example.reviewinbox';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { PushNotifier } from '../server/push';
import type { PhoneAccess } from '../server/security';
import { loadOrCreateVapid } from '../server/vapid';

const PORT = 4477;
const TOKEN = 'test-token';
const PHONE: PhoneAccess = { host: 'nod.example.invalid', owner: 'owner@example.com' };
const FINGERPRINT = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
const SUB: PushSubscriptionJson = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p', auth: 'a' } };

describe('VAPID key file', () => {
  it('creates a mode 600 file once and reuses it', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'vapid-')), 'sub', 'vapid.json');
    const first = await loadOrCreateVapid(path);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await loadOrCreateVapid(path)).toEqual(first);
    expect(first.publicKey.length).toBeGreaterThan(40);
  });

  it('replaces a malformed file with a fresh pair', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'vapid-')), 'vapid.json');
    await writeFile(path, '{"publicKey":1}');
    const keys = await loadOrCreateVapid(path);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(keys);
  });
});

describe('push payload', () => {
  it('carries only title, body and target', () => {
    const item = {
      title: 'Review requested: repo #4',
      body: 'Fix thing',
      target: { kind: 'pr' as const, repo: 'repo', number: 4, extra: 'x' },
      secret: 'nope',
    };
    expect(pushPayload(item)).toEqual({
      title: 'Review requested: repo #4',
      body: 'Fix thing',
      target: { kind: 'pr', repo: 'repo', number: 4 },
    });
  });

  it('omits the target when the item has none', () => {
    expect(pushPayload({ title: 't', body: 'b' })).toEqual({ title: 't', body: 'b' });
  });
});

describe('subscriptions', () => {
  it('are removed when the device is revoked', async () => {
    const devices = DeviceStore.memory();
    const key = await devices.add('Phone');
    expect(await devices.setPush(key, SUB)).toBe(true);
    expect(devices.pushSubscriptions()).toEqual([SUB]);
    await devices.revoke(devices.list()[0]!.id);
    expect(devices.pushSubscriptions()).toEqual([]);
  });

  it.each([404, 410])('are dropped, with a warn line, when the push service answers %i', async (status) => {
    const devices = DeviceStore.memory();
    await devices.setPush(await devices.add('Phone'), SUB);
    const id = devices.list()[0]!.id;
    const sent: PushPayload[] = [];
    const lines = { info: [] as string[], warn: [] as string[] };
    const log = { info: (l: string) => lines.info.push(l), warn: (l: string) => lines.warn.push(l) };
    const notifier = new PushNotifier(new FixtureProvider(), devices, async (_s, p) => {
      sent.push(p);
      throw Object.assign(new Error(`gone ${SUB.endpoint}`), { statusCode: status });
    }, log);

    const outcomes = await notifier.deliver({ title: 't', body: 'b', kind: 'test' });

    expect(sent).toHaveLength(1);
    expect(devices.pushSubscriptions()).toEqual([]);
    expect(outcomes).toEqual([{ device: id, ok: false, status, dropped: true }]);
    expect(lines.warn).toEqual([`[notify] push to device ${id} failed: HTTP ${status}, subscription dropped`]);
    expect(lines.info).toEqual(['[notify] test -> 0 of 1 phone']);
  });

  it('keep the subscription on other failures, and no line carries the endpoint or keys', async () => {
    const devices = DeviceStore.memory();
    await devices.setPush(await devices.add('Phone'), SUB);
    const all: string[] = [];
    const log = { info: (l: string) => all.push(l), warn: (l: string) => all.push(l) };
    const flaky = new PushNotifier(new FixtureProvider(), devices, async () => {
      throw Object.assign(new Error(`boom ${SUB.endpoint}`), { statusCode: 500 });
    }, log);
    const offline = new PushNotifier(new FixtureProvider(), devices, async () => {
      throw new Error(`ECONNRESET ${SUB.endpoint}`);
    }, log);

    await flaky.deliver({ title: 't', body: 'b', kind: 'ci', target: { kind: 'pr', repo: 'acme-api', number: 3 } });
    await offline.deliver({ title: 't', body: 'b', kind: 'ci' });

    expect(devices.pushSubscriptions()).toEqual([SUB]);
    expect(all.filter((l) => l.includes('failed'))).toEqual([
      expect.stringMatching(/failed: HTTP 500$/),
      expect.stringMatching(/failed: no response$/),
    ]);
    expect(all).toContain('[notify] ci pr acme-api#3 -> 0 of 1 phone');
    for (const l of all) {
      expect(l).not.toContain(SUB.endpoint);
      expect(l).not.toContain('push.example.com');
    }
  });

  it('log one info line per notification sent, naming the kind, target and phone count', async () => {
    const devices = DeviceStore.memory();
    await devices.setPush(await devices.add('Phone'), SUB);
    await devices.setPush(await devices.add('Tablet'), { ...SUB, endpoint: 'https://push.example.com/def' });
    const info: string[] = [];
    const notifier = new PushNotifier(new FixtureProvider(), devices, async () => undefined, {
      info: (l) => info.push(l),
      warn: () => undefined,
    });
    await notifier.deliver({ title: 't', body: 'b', kind: 'review', target: { kind: 'pr', repo: 'acme-api', number: 7 } });
    expect(info).toEqual(['[notify] review pr acme-api#7 -> 2 of 2 phones']);
  });

  it('subscribe and unsubscribe routes need a paired phone', async () => {
    const devices = DeviceStore.memory();
    const key = await devices.add('Phone');
    const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, phone: PHONE, devices, vapidPublicKey: 'k' });
    const headers = {
      host: `${PHONE.host}:8443`,
      'tailscale-user-login': PHONE.owner,
      origin: `https://${PHONE.host}:8443`,
      'x-nod-token': TOKEN,
      'content-type': 'application/json',
      cookie: `nod_device=${key}`,
    };
    const url = `http://127.0.0.1:${PORT}`;
    const sub = await app.request(`${url}/api/push/subscribe`, { method: 'POST', headers, body: JSON.stringify(SUB) });
    expect(sub.status).toBe(200);
    expect(devices.pushSubscriptions()).toEqual([SUB]);
    const bad = await app.request(`${url}/api/push/subscribe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...SUB, endpoint: 'http://insecure.example.com' }),
    });
    expect(bad.status).toBe(400);
    const off = await app.request(`${url}/api/push/unsubscribe`, { method: 'POST', headers, body: '{}' });
    expect(off.status).toBe(200);
    expect(devices.pushSubscriptions()).toEqual([]);
  });
});

describe('assetlinks.json', () => {
  it('lists the configured and the pre-rename package with the same fingerprint', () => {
    const statement = (package_name: string) => ({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name, sha256_cert_fingerprints: [FINGERPRINT] },
    });
    expect(buildAssetLinks(FINGERPRINT, PACKAGE)).toEqual([statement(PACKAGE), statement(LEGACY_ANDROID_PACKAGE)]);
    expect(LEGACY_ANDROID_PACKAGE).toBe('dev.example.reviewinbox');
  });

  it('is served without a device key, and 404 when the app is not built', async () => {
    const mk = (assetLinks?: ReturnType<typeof buildAssetLinks>) =>
      createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, phone: PHONE, assetLinks });
    const headers = { host: `${PHONE.host}:8443`, 'tailscale-user-login': PHONE.owner };
    const url = `http://127.0.0.1:${PORT}/.well-known/assetlinks.json`;
    const ok = await mk(buildAssetLinks(FINGERPRINT, PACKAGE)).request(url, { headers });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(buildAssetLinks(FINGERPRINT, PACKAGE));
    expect((await mk().request(url, { headers })).status).toBe(404);
  });

  it('reads the fingerprint file and rejects a malformed one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fp-'));
    await writeFile(join(dir, 'ok.txt'), `${FINGERPRINT.toLowerCase()}\n`);
    await writeFile(join(dir, 'bad.txt'), 'not a fingerprint');
    expect(await readFingerprint(join(dir, 'ok.txt'))).toBe(FINGERPRINT);
    expect(await readFingerprint(join(dir, 'bad.txt'))).toBeUndefined();
    expect(await readFingerprint(join(dir, 'missing.txt'))).toBeUndefined();
  });

  // electron/main.ts startServer and server/index.ts both build assetLinks with loadAssetLinks(PACKAGE).
  it('is served by the desktop server once a fingerprint file exists, new path before old', async () => {
    const config = await mkdtemp(join(tmpdir(), 'fp-config-'));
    const saved = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = config;
    try {
      expect(await loadAssetLinks(PACKAGE)).toBeUndefined();

      const OLD = FINGERPRINT.replace(/^00/, 'FF');
      await mkdir(join(config, 'review-inbox'), { recursive: true });
      await writeFile(join(config, 'review-inbox', 'android-fingerprint.txt'), `${OLD}\n`);
      expect(await loadAssetLinks(PACKAGE)).toEqual(buildAssetLinks(OLD, PACKAGE));

      await mkdir(join(config, 'nod'), { recursive: true });
      await writeFile(join(config, 'nod', 'android-fingerprint.txt'), `${FINGERPRINT}\n`);
      const assetLinks = await loadAssetLinks(PACKAGE);
      expect(assetLinks).toEqual(buildAssetLinks(FINGERPRINT, PACKAGE));

      const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, phone: PHONE, assetLinks });
      const res = await app.request(`http://127.0.0.1:${PORT}/.well-known/assetlinks.json`, {
        headers: { host: `${PHONE.host}:8443`, 'tailscale-user-login': PHONE.owner },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as typeof assetLinks;
      expect(body?.map((s) => s.target.package_name)).toEqual([PACKAGE, LEGACY_ANDROID_PACKAGE]);
    } finally {
      if (saved === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = saved;
    }
  });
});
