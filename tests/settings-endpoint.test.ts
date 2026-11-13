import { mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { exitRestarter, type Restarter } from '../server/restart';
import type { PhoneAccess } from '../server/security';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { RESTART_EXIT_CODE, type SettingsSaveResult } from '../shared/settings-save';

const PORT = 4477;
const TOKEN = 'test-token';
const PHONE: PhoneAccess = { host: 'phone.example.ts.net', owner: 'owner@example.com' };
const LOOPBACK = `http://127.0.0.1:${PORT}`;
const DESKTOP = { host: `127.0.0.1:${PORT}`, origin: LOOPBACK, 'x-nod-token': TOKEN, 'content-type': 'application/json' };
const TAILNET = {
  host: `${PHONE.host}:8443`,
  origin: `https://${PHONE.host}:8443`,
  'tailscale-user-login': PHONE.owner,
  'x-nod-token': TOKEN,
  'content-type': 'application/json',
};

const VALID = { ...DEFAULT_SETTINGS, orgs: ['acme-web'], bot: { ...DEFAULT_SETTINGS.bot, command: '/fixer' } };

async function setup(seed?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'nod-settings-'));
  const path = join(dir, 'app-settings.json');
  if (seed !== undefined) await writeFile(path, seed);
  const run = vi.fn();
  const restart: Restarter = { mode: 'exit', run };
  const devices = DeviceStore.memory();
  const app = createApp({
    provider: new FixtureProvider(),
    port: PORT,
    token: TOKEN,
    phone: PHONE,
    devices,
    settingsPath: path,
    restart,
  });
  const put = (body: unknown, headers: Record<string, string> = DESKTOP) =>
    app.request(`${LOOPBACK}/api/settings`, {
      method: 'PUT',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { dir, path, run, put, app, devices };
}

describe('PUT /api/settings', () => {
  it('writes a valid body, restarts, and says how', async () => {
    const { path, run, put } = await setup();
    const res = await put(VALID);
    expect(res.status).toBe(200);
    expect((await res.json()) as SettingsSaveResult).toEqual({ ok: true, restarting: true, mode: 'exit' });
    expect(run).toHaveBeenCalledOnce();
    const saved = JSON.parse(await readFile(path, 'utf8')) as typeof VALID;
    expect(saved.orgs).toEqual(['acme-web']);
    expect(saved.bot.command).toBe('/fixer');
  });

  it('refuses an invalid body with the path and writes nothing', async () => {
    const { dir, run, put } = await setup();
    const res = await put({ ...VALID, bot: { ...VALID.bot, command: 'fixer' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/^bot\.command: /);
    expect(await readdir(dir)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const { run, put } = await setup();
    expect((await put('{nope')).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('writes through a temp file: mode 0600 and no temp file left', async () => {
    const { dir, put } = await setup();
    await put(VALID);
    expect(await readdir(dir)).toEqual(['app-settings.json']);
    expect((await stat(join(dir, 'app-settings.json'))).mode & 0o777).toBe(0o600);
  });

  it('keeps the old file when the write fails', async () => {
    const { dir, path, run } = await setup('{"orgs":["old"]}');
    const blocked = join(dir, 'blocked');
    await writeFile(blocked, 'a file, not a folder');
    const app = createApp({
      provider: new FixtureProvider(),
      port: PORT,
      token: TOKEN,
      settingsPath: join(blocked, 'app-settings.json'),
      restart: { mode: 'exit', run },
    });
    const res = await app.request(`${LOOPBACK}/api/settings`, { method: 'PUT', headers: DESKTOP, body: JSON.stringify(VALID) });
    expect(res.status).toBe(500);
    expect(run).not.toHaveBeenCalled();
    expect(await readFile(path, 'utf8')).toBe('{"orgs":["old"]}');
  });

  it('keeps keys the schema does not know and drops a legacy org', async () => {
    const { path, put } = await setup(JSON.stringify({ phoneAccess: true, org: 'old-org', extra: { a: 1 } }));
    expect((await put(VALID)).status).toBe(200);
    const saved = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(saved.phoneAccess).toBe(true);
    expect(saved.extra).toEqual({ a: 1 });
    expect(saved).not.toHaveProperty('org');
    expect(saved.orgs).toEqual(['acme-web']);
  });

  it('refuses a paired phone on the tailnet', async () => {
    const { path, run, put, devices } = await setup();
    const key = await devices.add('Test phone');
    const res = await put(VALID, { ...TAILNET, cookie: `nod_device=${key}` });
    expect(res.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
    await expect(stat(path)).rejects.toThrow();
  });

  it('refuses an unpaired tailnet request', async () => {
    const { run, put } = await setup();
    expect((await put(VALID, TAILNET)).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('keeps the origin and token guards', async () => {
    const { put } = await setup();
    expect((await put(VALID, { ...DESKTOP, origin: 'https://evil.example' })).status).toBe(403);
    expect((await put(VALID, { ...DESKTOP, 'x-nod-token': 'wrong' })).status).toBe(403);
  });

  it('never echoes the settings back', async () => {
    const { put } = await setup();
    const text = await (await put(VALID)).text();
    expect(text).not.toContain('acme-web');
  });
});

describe('GET /api/settings/saved', () => {
  it('is false until the file exists', async () => {
    const { app, put } = await setup();
    const read = async () => ((await (await app.request(`${LOOPBACK}/api/settings/saved`, { headers: { host: DESKTOP.host } })).json()) as { saved: boolean }).saved;
    expect(await read()).toBe(false);
    await put(VALID);
    expect(await read()).toBe(true);
  });
});

describe('exitRestarter', () => {
  it('logs one line and exits with the documented code', () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const exit = vi.fn();
    exitRestarter(log, exit).run();
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain(String(RESTART_EXIT_CODE));
    expect(exit).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(exit).toHaveBeenCalledWith(RESTART_EXIT_CODE);
    vi.useRealTimers();
  });
});
