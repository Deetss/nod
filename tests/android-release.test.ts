import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apkBanner, apkUpdateAvailable, parseApkParam, parseRelease, type AndroidRelease } from '../shared/android-release';
import { createApp } from '../server/app';
import { publishRelease, readRelease } from '../server/android-release';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import type { PhoneAccess } from '../server/security';

const PORT = 4477;
const PHONE: PhoneAccess = { host: 'nod.example.invalid', owner: 'owner@example.com' };
const TAILNET = { host: `${PHONE.host}:8443`, 'tailscale-user-login': PHONE.owner };
const BYTES = 'PK\u0003\u0004 synthetic apk';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const release = (versionCode: number): AndroidRelease => ({
  versionCode,
  versionName: `1.0.${versionCode}`,
  sha256: sha('x'),
  builtAt: '2026-11-11T18:00:00.000Z',
});

async function published(versionCode = 7) {
  const dir = await mkdtemp(join(tmpdir(), 'nod-android-'));
  const src = join(dir, 'signed.apk');
  await writeFile(src, BYTES);
  await publishRelease(src, { versionCode, versionName: `1.0.${versionCode}` }, dir, new Date('2026-11-11T18:00:00Z'));
  return dir;
}

async function setup(androidDir: string) {
  const devices = DeviceStore.memory();
  const key = await devices.add('Pixel 8');
  const app = createApp({ provider: new FixtureProvider(), port: PORT, token: 't', phone: PHONE, devices, androidDir });
  const get = (path: string, headers: Record<string, string>) => app.request(`http://127.0.0.1:${PORT}${path}`, { headers });
  return { get, key };
}

describe('APK endpoints', () => {
  it('reject tailnet requests without a device key', async () => {
    const { get } = await setup(await published());
    for (const path of ['/api/android/latest', '/api/android/nod.apk']) {
      expect((await get(path, TAILNET)).status).toBe(401);
      expect((await get(path, { ...TAILNET, cookie: 'nod_device=wrong' })).status).toBe(401);
    }
  });

  it('serve the metadata and the file to a paired phone', async () => {
    const { get, key } = await setup(await published(7));
    const headers = { ...TAILNET, cookie: `nod_device=${key}` };
    const latest = await get('/api/android/latest', headers);
    expect(latest.status).toBe(200);
    expect(await latest.json()).toEqual({
      versionCode: 7,
      versionName: '1.0.7',
      sha256: sha(BYTES),
      builtAt: '2026-11-11T18:00:00.000Z',
    });
    const apk = await get('/api/android/nod.apk', headers);
    expect(apk.status).toBe(200);
    expect(apk.headers.get('content-type')).toBe('application/vnd.android.package-archive');
    expect(apk.headers.get('content-disposition')).toBe('attachment; filename="nod-1.0.7.apk"');
    expect(Buffer.from(await apk.arrayBuffer()).toString()).toBe(BYTES);
  });

  it('answer 404 before the first build', async () => {
    const { get, key } = await setup(await mkdtemp(join(tmpdir(), 'nod-android-')));
    const headers = { ...TAILNET, cookie: `nod_device=${key}` };
    expect((await get('/api/android/latest', headers)).status).toBe(404);
    expect((await get('/api/android/nod.apk', headers)).status).toBe(404);
  });
});

describe('version comparison and banner', () => {
  it('reads the version the app bakes into its start URL', () => {
    expect(parseApkParam('?apk=12')).toBe(12);
    expect(parseApkParam('?apk=0')).toBeUndefined();
    expect(parseApkParam('?apk=1e3')).toBeUndefined();
    expect(parseApkParam('?open=pr/nod/1')).toBeUndefined();
  });

  it('offers an update only for a newer APK in the app', () => {
    expect(apkUpdateAvailable(release(8), 7)).toBe(true);
    expect(apkUpdateAvailable(release(7), 7)).toBe(false);
    expect(apkUpdateAvailable(release(6), 7)).toBe(false);
    expect(apkUpdateAvailable(release(8), undefined)).toBe(false);
    expect(apkUpdateAvailable(undefined, 7)).toBe(false);
  });

  it('shows the banner until it is dismissed for that version', () => {
    expect(apkBanner({ latest: release(8), installed: 7, dismissed: undefined })).toEqual(release(8));
    expect(apkBanner({ latest: release(8), installed: 7, dismissed: 8 })).toBeUndefined();
    expect(apkBanner({ latest: release(9), installed: 7, dismissed: 8 })).toEqual(release(9));
    expect(apkBanner({ latest: release(7), installed: 7, dismissed: undefined })).toBeUndefined();
  });

  it('rejects malformed metadata', () => {
    expect(parseRelease(release(3))).toEqual(release(3));
    expect(parseRelease({ ...release(3), sha256: 'nope' })).toBeUndefined();
    expect(parseRelease({ ...release(3), versionCode: -1 })).toBeUndefined();
  });
});

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'android.mjs');

describe('android.mjs in a temporary HOME', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(home: string) {
    vi.stubEnv('HOME', home);
    vi.stubEnv('XDG_STATE_HOME', '');
    vi.stubEnv('XDG_CONFIG_HOME', '');
    vi.resetModules();
    const path = SCRIPT;
    return (await import(path)) as {
      twaManifest: (host: string, iconBase: string, version: number) => Record<string, unknown>;
      finishBuild: (signed: string, version: number, releaseApk?: string) => Promise<AndroidRelease>;
    };
  }

  it('bakes the version code into the start URL', async () => {
    const mod = await load(await mkdtemp(join(tmpdir(), 'nod-home-')));
    const m = mod.twaManifest(PHONE.host, 'http://127.0.0.1:1', 12);
    expect(m.startUrl).toBe('/?apk=12');
    expect(m.appVersionCode).toBe(12);
  });

  it('points Bubblewrap at the monochrome icon for the status bar, served like the others', async () => {
    const mod = await load(await mkdtemp(join(tmpdir(), 'nod-home-')));
    const m = mod.twaManifest(PHONE.host, 'http://127.0.0.1:1', 12);
    expect(m.monochromeIconUrl).toBe('http://127.0.0.1:1/icons/icon-monochrome-512.png');
    expect(m.iconUrl).toBe('http://127.0.0.1:1/icons/icon-512.png');
    expect(existsSync(join(process.cwd(), 'web/public/icons/icon-monochrome-512.png'))).toBe(true);
  });

  // Bubblewrap turns `host` into the autoVerify intent filter (`https`, `@string/hostName`, no
  // port or path), so the app claims every URL on the default origin, `/pair` included.
  it('claims the whole tailnet origin on the default port', async () => {
    const mod = await load(await mkdtemp(join(tmpdir(), 'nod-home-')));
    const m = mod.twaManifest(PHONE.host, 'http://127.0.0.1:1', 12);
    expect(m.host).toBe(PHONE.host);
    expect(m.webManifestUrl).toBe(`https://${PHONE.host}/manifest.webmanifest`);
    expect(m).not.toHaveProperty('additionalTrustedOrigins');
    expect(m).not.toHaveProperty('shareTarget');
  });

  it('publishes the APK and its metadata to the state dir and counts the version', async () => {
    const home = await mkdtemp(join(tmpdir(), 'nod-home-'));
    const mod = await load(home);
    const signed = join(home, 'app-release-signed.apk');
    await writeFile(signed, BYTES);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await mod.finishBuild(signed, 12, join(home, 'release', 'nod.apk'));

    const dir = join(home, '.local', 'state', 'nod', 'android');
    expect(await readFile(join(dir, 'nod.apk'), 'utf8')).toBe(BYTES);
    const meta = await readRelease(dir);
    expect(meta).toMatchObject({ versionCode: 12, versionName: '1.0.12', sha256: sha(BYTES) });
    expect(Number.isNaN(Date.parse(meta?.builtAt ?? ''))).toBe(false);
    expect(await readFile(join(home, '.config', 'nod', 'android-version.txt'), 'utf8')).toBe('12\n');
    expect(await readFile(join(home, 'release', 'nod.apk'), 'utf8')).toBe(BYTES);
  });

  it('builds nothing when imported, and still runs as a script', async () => {
    const home = await mkdtemp(join(tmpdir(), 'nod-home-'));
    const run = promisify(execFile);
    const err = await run(join(ROOT, 'node_modules', '.bin', 'tsx'), [SCRIPT, 'bogus'], {
      cwd: ROOT,
      env: { ...process.env, HOME: home, XDG_STATE_HOME: '', XDG_CONFIG_HOME: '' },
    }).then(
      () => undefined,
      (e: { code?: number; stderr?: string }) => e,
    );
    expect(err?.code).toBe(1);
    expect(err?.stderr).toContain('Usage: node scripts/android.mjs build|install');
  }, 20_000);
});
