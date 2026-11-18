import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { frameNavigationAllowed, permissionAllowed, rateGate } from '../electron/hub';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import type { PhoneAccess } from '../server/security';

const HUB = 'https://hub.example.ts.net';
const LOCAL = 'http://127.0.0.1:4477';

describe('permission rule', () => {
  it('grants only clipboard writes, only to the window origin', () => {
    expect(permissionAllowed('clipboard-sanitized-write', `${HUB}/`, HUB)).toBe(true);
    expect(permissionAllowed('clipboard-sanitized-write', HUB, HUB)).toBe(true);
    expect(permissionAllowed('clipboard-sanitized-write', `${LOCAL}/`, LOCAL)).toBe(true);
  });

  it.each(['media', 'geolocation', 'notifications', 'openExternal', 'clipboard-read', 'midi', 'fullscreen'])(
    'refuses %s even to the window origin',
    (permission) => {
      expect(permissionAllowed(permission, `${HUB}/`, HUB)).toBe(false);
    },
  );

  it('refuses another origin, a look-alike or no origin', () => {
    expect(permissionAllowed('clipboard-sanitized-write', 'https://evil.example/', HUB)).toBe(false);
    expect(permissionAllowed('clipboard-sanitized-write', `${HUB}.evil.example/`, HUB)).toBe(false);
    expect(permissionAllowed('clipboard-sanitized-write', '', HUB)).toBe(false);
    expect(permissionAllowed('clipboard-sanitized-write', undefined, HUB)).toBe(false);
  });
});

describe('subframe navigation', () => {
  it('keeps subframes on the window origin over http or https', () => {
    expect(frameNavigationAllowed(`${HUB}/pair`, HUB)).toBe(true);
    expect(frameNavigationAllowed(`${LOCAL}/assets/x.html`, LOCAL)).toBe(true);
    expect(frameNavigationAllowed('https://evil.example/', HUB)).toBe(false);
    expect(frameNavigationAllowed('javascript:alert(1)', HUB)).toBe(false);
    expect(frameNavigationAllowed('data:text/html,hi', HUB)).toBe(false);
    expect(frameNavigationAllowed('file:///etc/passwd', HUB)).toBe(false);
  });
});

describe('notification rate gate', () => {
  it('lets one call through per second and drops the rest', () => {
    let t = 10_000;
    const gate = rateGate(1000, () => t);
    expect(gate()).toBe(true);
    expect(gate()).toBe(false);
    t += 999;
    expect(gate()).toBe(false);
    t += 1;
    expect(gate()).toBe(true);
  });
});

describe('framing header on HTML', () => {
  const PHONE: PhoneAccess = { host: 'hub.example.ts.net', owner: 'owner@example.com' };

  async function setup() {
    const dist = await mkdtemp(join(tmpdir(), 'nod-frame-'));
    await writeFile(join(dist, 'index.html'), '<!doctype html><meta name="nod-token" content="__NOD_TOKEN__"><title>Nod</title>');
    const app = createApp({ provider: new FixtureProvider(), port: 4477, token: 't', phone: PHONE, devices: DeviceStore.memory(), distDir: dist });
    return (path: string, headers: Record<string, string> = { host: '127.0.0.1:4477' }) =>
      app.request(`${LOCAL}${path}`, { headers });
  }

  const framed = (res: Response) => ({
    csp: res.headers.get('content-security-policy'),
    xfo: res.headers.get('x-frame-options'),
  });

  it('sends frame-ancestors on the app page, the pair page and the Not paired page', async () => {
    const req = await setup();
    const tailnet = { host: PHONE.host, 'tailscale-user-login': PHONE.owner };
    for (const res of [await req('/'), await req('/pair'), await req('/', tailnet)]) {
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(framed(res)).toEqual({ csp: "frame-ancestors 'self'", xfo: 'SAMEORIGIN' });
    }
  });

  it('keeps the app page and the pair page working', async () => {
    const req = await setup();
    const page = await req('/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('content="t"');
    expect((await req('/pair')).status).toBe(200);
  });

  it('leaves JSON answers alone', async () => {
    const req = await setup();
    const res = await req('/api/health');
    expect(framed(res)).toEqual({ csp: null, xfo: null });
  });
});
