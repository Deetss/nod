import { execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { appImageRelaunch } from '../server/restart';
import type { PhoneAccess } from '../server/security';
import { updateCheckText, type UpdateCheckResult } from '../shared/app-update';
import { DEV_BUILD, shellNotice } from '../shared/build-update';

const PORT = 4477;
const TOKEN = 'test-token';
const PHONE: PhoneAccess = { host: 'nod.example.invalid', owner: 'owner@example.com' };
const LOOPBACK = `http://127.0.0.1:${PORT}`;
const DESKTOP = { host: `127.0.0.1:${PORT}`, origin: LOOPBACK, 'x-nod-token': TOKEN, 'content-type': 'application/json' };
const OLD = '8152277-2026-11-11T17:00:00Z';
const NEW = 'a995b64-2026-11-11T18:00:00Z';

function setup(updates?: { check(): Promise<UpdateCheckResult> }) {
  const devices = DeviceStore.memory();
  const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, phone: PHONE, devices, updates });
  const post = (headers: Record<string, string>) => app.request(`${LOOPBACK}/api/updates/check`, { method: 'POST', headers, body: '{}' });
  return { devices, post };
}

describe('POST /api/updates/check', () => {
  it('answers with what the updater found', async () => {
    const check = vi.fn(async (): Promise<UpdateCheckResult> => ({ state: 'found', version: '0.2.4', installs: 'restart' }));
    const res = await setup({ check }).post(DESKTOP);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'found', version: '0.2.4', installs: 'restart' });
    expect(check).toHaveBeenCalledOnce();
  });

  it('says unsupported without an updater', async () => {
    expect(await (await setup().post(DESKTOP)).json()).toEqual({ state: 'unsupported' });
  });

  const fromPhone = (cookie?: string) => ({
    host: `${PHONE.host}:8443`,
    'tailscale-user-login': PHONE.owner,
    origin: `https://${PHONE.host}:8443`,
    'x-nod-token': TOKEN,
    'content-type': 'application/json',
    ...(cookie ? { cookie } : {}),
  });

  it('lets a paired phone check', async () => {
    const check = vi.fn(async (): Promise<UpdateCheckResult> => ({ state: 'current', version: '0.2.10' }));
    const { devices, post } = setup({ check });
    const key = await devices.add('Pixel');
    const res = await post(fromPhone(`nod_device=${key}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'current', version: '0.2.10' });
    expect(check).toHaveBeenCalledOnce();
  });

  it('refuses an unpaired phone and runs no check', async () => {
    const check = vi.fn(async (): Promise<UpdateCheckResult> => ({ state: 'unsupported' }));
    const res = await setup({ check }).post(fromPhone());
    expect(res.status).toBe(401);
    expect(check).not.toHaveBeenCalled();
  });
});

describe('updateCheckText', () => {
  it('says where a found release installs', () => {
    expect(updateCheckText({ state: 'found', version: '0.2.4', installs: 'restart' })).toBe(
      'Nod 0.2.4 is downloading. The service restarts on it when done.',
    );
    expect(updateCheckText({ state: 'found', version: '0.2.4', installs: 'quit' })).toBe('Nod 0.2.4 is downloading. It installs when you quit Nod.');
  });

  it('reads the other answers', () => {
    expect(updateCheckText({ state: 'current', version: '0.2.3' })).toBe('Nod 0.2.3 is the latest release.');
    expect(updateCheckText({ state: 'failed', error: 'offline' })).toBe('Update check failed: offline');
    expect(updateCheckText({ state: 'unsupported' })).toContain('AppImage');
  });
});

describe('shellNotice', () => {
  it('offers a relaunch when the page is newer than the shell', () => {
    expect(shellNotice(NEW, OLD)).toBe('relaunch');
  });

  it('asks for a manual restart from a shell too old to report its build', () => {
    expect(shellNotice(NEW, undefined)).toBe('restart');
  });

  it('stays quiet on a matching build and on dev builds', () => {
    expect(shellNotice(NEW, NEW)).toBe('none');
    expect(shellNotice(DEV_BUILD, OLD)).toBe('none');
    expect(shellNotice(NEW, DEV_BUILD)).toBe('none');
  });

  it("stays quiet on a hub page, whose build is the hub's", () => {
    expect(shellNotice(NEW, null)).toBe('none');
  });
});

describe('appImageRelaunch', () => {
  it('relaunches the AppImage file with the same arguments, not the binary on its mount', () => {
    const { command, args } = appImageRelaunch('/home/u/.local/opt/nod/nod.AppImage', ['/tmp/.mount_nod.x/nod', '--fixtures'], 4242);
    expect(command).toBe('/bin/sh');
    expect(args.slice(2)).toEqual(['4242', '/home/u/.local/opt/nod/nod.AppImage', '--fixtures']);
  });

  it('starts the new instance only after the old one exits', async () => {
    const old = spawn('sleep', ['0.4']);
    const exited = new Promise<number>((resolve) => old.on('exit', () => resolve(Date.now())));
    const { command, args } = appImageRelaunch(process.execPath, ['nod', '-e', 'process.stdout.write(String(Date.now()))'], old.pid!);
    const { stdout } = await promisify(execFile)(command, args);
    expect(Number(stdout)).toBeGreaterThanOrEqual(await exited);
  });
});

describe('nod.service', () => {
  const unit = readFileSync('scripts/nod.service', 'utf8');

  it('stops Nod before the AppImage mount it runs from', () => {
    expect(unit).toMatch(/^ExecStop=.*kill -TERM "\$\$MAINPID".*tail --pid="\$\$MAINPID"/m);
  });

  it('sends stdout to the journal', () => {
    expect(unit).toContain('Environment=ELECTRON_ENABLE_LOGGING=1');
  });
});
