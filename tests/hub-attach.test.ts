import { describe, expect, it, vi } from 'vitest';
import {
  chooseStart,
  frameNavigationAllowed,
  ipcAllowed,
  isOrigin,
  permissionAllowed,
  probeHub,
  rateGate,
  readHubSetting,
  type Fetcher,
} from '../electron/hub';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import type { PhoneAccess } from '../server/security';
import { hubStatusFrom, pairTarget, parseHubUrl, type HubStatus } from '../shared/hub';
import type { DeviceRole } from '../shared/pairing';

const HUB = 'https://hub.example.ts.net';

describe('parseHubUrl', () => {
  it('accepts an https origin, with or without a trailing slash, and empty', () => {
    expect(parseHubUrl('')).toEqual({ ok: true, url: '' });
    expect(parseHubUrl('  ')).toEqual({ ok: true, url: '' });
    expect(parseHubUrl(HUB)).toEqual({ ok: true, url: HUB });
    expect(parseHubUrl(`${HUB}/`)).toEqual({ ok: true, url: HUB });
    expect(parseHubUrl('https://HUB.example.ts.net:8443')).toEqual({ ok: true, url: 'https://hub.example.ts.net:8443' });
  });

  it.each([
    ['http://hub.example.ts.net', 'https://'],
    ['hub.example.ts.net', 'full URL'],
    ['javascript:alert(1)', 'https://'],
    ['file:///etc/passwd', 'https://'],
    ['https://user:pw@hub.example.ts.net', 'user name'],
    ['https://hub.example.ts.net/inbox', 'no path'],
    ['https://hub.example.ts.net/?x=1', 'no path'],
    ['https://hub.example.ts.net/#a', 'no path'],
    [`https://${'a'.repeat(200)}.net`, 'too long'],
  ])('refuses %s', (raw, why) => {
    const parsed = parseHubUrl(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(why);
  });
});

describe('pairTarget', () => {
  it('takes a link from the hub or a bare code', () => {
    expect(pairTarget(HUB, `${HUB}/pair#code=abcdEFGH_123-xy`)).toEqual({ ok: true, url: `${HUB}/pair#code=abcdEFGH_123-xy` });
    expect(pairTarget(HUB, ' abcdEFGH_123-xy ')).toEqual({ ok: true, url: `${HUB}/pair#code=abcdEFGH_123-xy` });
  });

  it('refuses a link to another host, a bad code, or no hub', () => {
    expect(pairTarget(HUB, 'https://evil.example/pair#code=abcdEFGH_123').ok).toBe(false);
    expect(pairTarget(HUB, `${HUB}/other#code=abcdEFGH_123`).ok).toBe(false);
    expect(pairTarget(HUB, 'abc"><script>').ok).toBe(false);
    expect(pairTarget(HUB, 'short').ok).toBe(false);
    expect(pairTarget('', 'abcdEFGH_123').ok).toBe(false);
  });
});

describe('hubStatusFrom', () => {
  it('reads paired, not paired and unreachable', () => {
    expect(hubStatusFrom(200, { role: 'admin', version: '0.2.32' })).toEqual({ state: 'paired', role: 'admin', version: '0.2.32' });
    expect(hubStatusFrom(401, { error: 'Not paired' })).toEqual({ state: 'not-paired' });
    expect(hubStatusFrom(200, { role: 'root' })).toEqual({ state: 'unreachable' });
    expect(hubStatusFrom(403, 'Forbidden host')).toEqual({ state: 'unreachable' });
    expect(hubStatusFrom(302, undefined)).toEqual({ state: 'unreachable' });
  });
});

describe('probeHub against a real hub', () => {
  const PHONE: PhoneAccess = { host: 'hub.example.ts.net', owner: 'owner@example.com' };

  /** Stands in for Tailscale Serve: the hub sees the tailnet Host and login, and the cookie the session holds. */
  async function hubFetcher(role?: DeviceRole): Promise<Fetcher> {
    const devices = DeviceStore.memory();
    const app = createApp({ provider: new FixtureProvider(), port: 4477, token: 't', phone: PHONE, devices, version: '0.2.32' });
    const key = role ? await devices.add('Desk', role) : undefined;
    return (url, init) =>
      Promise.resolve(
        app.request(url, {
          ...init,
          headers: { host: PHONE.host, 'tailscale-user-login': PHONE.owner, ...(key ? { cookie: `nod_device=${key}` } : {}) },
        }),
      );
  }

  it('reports the role of a paired desktop', async () => {
    expect(await probeHub(HUB, await hubFetcher('desktop'))).toEqual({ state: 'paired', role: 'desktop', version: '0.2.32' });
  });

  it('reports not paired without a cookie', async () => {
    expect(await probeHub(HUB, await hubFetcher())).toEqual({ state: 'not-paired' });
  });

  it('reports unreachable on a network error, and sends the session cookies without following redirects', async () => {
    const fetcher = vi.fn<Fetcher>(() => Promise.reject(new Error('ECONNREFUSED')));
    expect(await probeHub(HUB, fetcher)).toEqual({ state: 'unreachable' });
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${HUB}/api/devices/me`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include', redirect: 'manual' });
  });
});

describe('chooseStart', () => {
  const probe = (status: HubStatus) => vi.fn(() => Promise.resolve(status));

  it('stays local with no Hub URL and never probes', async () => {
    const p = probe({ state: 'unreachable' });
    expect(await chooseStart('', p)).toEqual({ mode: 'local' });
    expect(p).not.toHaveBeenCalled();
  });

  it('loads the hub when it answers and this desktop is paired', async () => {
    expect(await chooseStart(HUB, probe({ state: 'paired', role: 'admin' }))).toEqual({ mode: 'hub', origin: HUB });
  });

  it('starts locally with one log line when the hub is down', async () => {
    const choice = await chooseStart(HUB, probe({ state: 'unreachable' }));
    expect(choice).toEqual({ mode: 'local', down: true, log: `[hub] ${HUB} did not answer; starting a local server.` });
  });

  it('starts locally, not in local mode, when the hub answers but this desktop is not paired', async () => {
    const choice = await chooseStart(HUB, probe({ state: 'not-paired' }));
    expect(choice).toMatchObject({ mode: 'local', down: false });
    expect(choice.mode === 'local' && choice.log).toContain('not paired');
  });
});

describe('desktop hub setting', () => {
  it('reads a valid URL and drops anything else', () => {
    expect(readHubSetting({ hubUrl: `${HUB}/` })).toBe(HUB);
    expect(readHubSetting({ hubUrl: 'http://hub.example.ts.net' })).toBe('');
    expect(readHubSetting({ hubUrl: 42 })).toBe('');
    expect(readHubSetting(undefined)).toBe('');
  });

  it('matches an origin exactly', () => {
    expect(isOrigin('http://127.0.0.1:4477/', 'http://127.0.0.1:4477')).toBe(true);
    expect(isOrigin(`${HUB}/pair`, HUB)).toBe(true);
    expect(isOrigin('https://hub.example.ts.net.evil.example/', HUB)).toBe(false);
    expect(isOrigin('https://github.com/acme-co', HUB)).toBe(false);
    expect(isOrigin(undefined, HUB)).toBe(false);
  });
});

describe('IPC origin policy', () => {
  const LOCAL = 'http://127.0.0.1:4477';
  const HUB_CHANNELS = ['hub:get', 'hub:check', 'hub:pair', 'hub:retry', 'shell:relaunch'];
  const PAGE_CHANNELS = ['notify', 'notify:test', 'settings:get', 'settings:set', 'shell:build'];

  it('refuses shell:relaunch from a hub page', () => {
    expect(ipcAllowed('shell:relaunch', `${HUB}/`, { current: HUB, local: '' })).toBe(false);
    expect(ipcAllowed('shell:relaunch', `${HUB}/`, { current: HUB, local: LOCAL })).toBe(false);
    expect(ipcAllowed('shell:relaunch', `${LOCAL}/`, { current: LOCAL, local: LOCAL })).toBe(true);
  });


  it('lets this machine’s page use every channel', () => {
    const o = { current: LOCAL, local: LOCAL };
    for (const ch of [...HUB_CHANNELS, ...PAGE_CHANNELS]) expect(ipcAllowed(ch, `${LOCAL}/`, o), ch).toBe(true);
  });

  it('never lets a hub page change or pair the hub, started on the hub or moved there', () => {
    for (const o of [
      { current: HUB, local: '' },
      { current: HUB, local: LOCAL },
    ]) {
      for (const ch of HUB_CHANNELS) {
        expect(ipcAllowed(ch, `${HUB}/`, o), ch).toBe(false);
        expect(ipcAllowed(ch, `${LOCAL}/`, o), ch).toBe(false);
      }
      for (const ch of PAGE_CHANNELS) expect(ipcAllowed(ch, `${HUB}/`, o), ch).toBe(true);
    }
  });

  it('refuses other origins, look-alikes and unknown channels', () => {
    const o = { current: LOCAL, local: LOCAL };
    expect(ipcAllowed('notify', 'https://evil.example/', o)).toBe(false);
    expect(ipcAllowed('notify', 'http://127.0.0.1:4478/', o)).toBe(false);
    expect(ipcAllowed('hub:check', 'http://127.0.0.1.evil.example:4477/', o)).toBe(false);
    expect(ipcAllowed('notify', undefined, o)).toBe(false);
    expect(ipcAllowed('shell:exec', `${LOCAL}/`, o)).toBe(false);
    expect(ipcAllowed('notify', `${HUB}.evil.example/`, { current: HUB, local: '' })).toBe(false);
  });
});

