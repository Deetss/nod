import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { parseTailscaleStatus, phoneHttpsPort, phoneOrigin, type PhoneAccess } from '../server/security';

const PORT = 4477;
const TOKEN = 'test-token';
const URL_BASE = `http://127.0.0.1:${PORT}`;
const PHONE: PhoneAccess = { host: 'nod.example.invalid', owner: 'owner@example.com' };
const TAILNET_HOST = `${PHONE.host}:8443`;
const seenBody = JSON.stringify({ id: 'PR_x', updatedAt: 'now', headSha: 'abc', commitCount: 1 });

const devices = DeviceStore.memory();
let cookie = '';

beforeAll(async () => {
  cookie = `nod_device=${await devices.add('Test phone')}`;
});

function app(phone?: PhoneAccess) {
  return createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, phone, devices });
}

function get(phone: PhoneAccess | undefined, headers: Record<string, string>) {
  return app(phone).request(`${URL_BASE}/api/inbox`, { headers: { cookie, ...headers } });
}

function post(phone: PhoneAccess | undefined, headers: Record<string, string>) {
  return app(phone).request(`${URL_BASE}/api/seen`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, ...headers },
    body: seenBody,
  });
}

describe('tailnet host guard', () => {
  it('rejects the tailnet host when phone access is off', async () => {
    const res = await get(undefined, { host: TAILNET_HOST, 'tailscale-user-login': PHONE.owner });
    expect(res.status).toBe(403);
  });

  it('allows the tailnet host for the owner on any port', async () => {
    for (const host of [TAILNET_HOST, PHONE.host, `${PHONE.host}:443`]) {
      const res = await get(PHONE, { host, 'tailscale-user-login': PHONE.owner });
      expect(res.status).toBe(200);
    }
  });

  it('rejects the tailnet host with a wrong login', async () => {
    const res = await get(PHONE, { host: TAILNET_HOST, 'tailscale-user-login': 'other@example.com' });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Not your tailnet user');
  });

  it('rejects the tailnet host with no login header', async () => {
    const res = await get(PHONE, { host: TAILNET_HOST });
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Not your tailnet user');
  });

  it('rejects other hosts and lookalikes with phone access on', async () => {
    for (const host of ['evil.example', `${PHONE.host}.evil.com`, `evil.${PHONE.host}`]) {
      const res = await get(PHONE, { host, 'tailscale-user-login': PHONE.owner });
      expect(res.status).toBe(403);
    }
  });

  it('rejects a loopback host carrying a wrong login', async () => {
    const res = await get(PHONE, { host: `127.0.0.1:${PORT}`, 'tailscale-user-login': 'other@example.com' });
    expect(res.status).toBe(403);
  });

  it('allows a loopback host carrying the owner login', async () => {
    const res = await get(PHONE, { host: `127.0.0.1:${PORT}`, 'tailscale-user-login': PHONE.owner });
    expect(res.status).toBe(200);
  });

  it('rejects a loopback host carrying any login when phone access is off', async () => {
    const res = await get(undefined, { host: `127.0.0.1:${PORT}`, 'tailscale-user-login': PHONE.owner });
    expect(res.status).toBe(403);
  });

  it('leaves loopback unchanged with phone access on', async () => {
    const res = await get(PHONE, { host: `127.0.0.1:${PORT}` });
    expect(res.status).toBe(200);
  });
});

describe('tailnet mutation guard', () => {
  const headers = { host: TAILNET_HOST, 'tailscale-user-login': PHONE.owner, 'x-nod-token': TOKEN };

  it('accepts the tailnet Origin on the default port and the legacy :8443', async () => {
    for (const origin of [`https://${PHONE.host}:8443`, `https://${PHONE.host}`]) {
      const res = await post(PHONE, { ...headers, origin });
      expect(res.status).toBe(200);
    }
  });

  it('accepts the configured port alongside the default and :8443', async () => {
    vi.stubEnv('NOD_PHONE_HTTPS_PORT', '9443');
    try {
      for (const origin of [`https://${PHONE.host}:9443`, `https://${PHONE.host}:8443`, `https://${PHONE.host}`]) {
        const res = await post(PHONE, { ...headers, origin });
        expect(res.status).toBe(200);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects the tailnet Origin when phone access is off', async () => {
    const res = await post(undefined, { host: `127.0.0.1:${PORT}`, 'x-nod-token': TOKEN, origin: `https://${PHONE.host}:8443` });
    expect(res.status).toBe(403);
  });

  it('rejects other ports, schemes and lookalike Origins', async () => {
    for (const origin of [
      `https://${PHONE.host}:9999`,
      `http://${PHONE.host}:8443`,
      `https://${PHONE.host}.evil.com`,
      'https://evil.example',
    ]) {
      const res = await post(PHONE, { ...headers, origin });
      expect(res.status).toBe(403);
    }
  });

  it('still needs the session token', async () => {
    const res = await post(PHONE, { ...headers, origin: `https://${PHONE.host}:8443`, 'x-nod-token': 'nope' });
    expect(res.status).toBe(403);
  });

  it('still accepts the loopback Origin', async () => {
    const res = await post(PHONE, { host: `127.0.0.1:${PORT}`, 'x-nod-token': TOKEN, origin: URL_BASE });
    expect(res.status).toBe(200);
  });
});

describe('parseTailscaleStatus', () => {
  const fixture = {
    Self: { DNSName: 'nod.example.invalid.', UserID: 42 },
    User: { '42': { LoginName: 'owner@example.com' }, '7': { LoginName: 'other@example.com' } },
  };

  it('returns the host without the trailing dot and the owner login', () => {
    expect(parseTailscaleStatus(fixture)).toEqual({
      host: 'nod.example.invalid',
      owner: 'owner@example.com',
    });
  });

  it('returns undefined for malformed or incomplete status', () => {
    expect(parseTailscaleStatus(null)).toBeUndefined();
    expect(parseTailscaleStatus('x')).toBeUndefined();
    expect(parseTailscaleStatus({})).toBeUndefined();
    expect(parseTailscaleStatus({ ...fixture, Self: { DNSName: '', UserID: 42 } })).toBeUndefined();
    expect(parseTailscaleStatus({ ...fixture, User: {} })).toBeUndefined();
    expect(parseTailscaleStatus({ Self: { UserID: 42 }, User: fixture.User })).toBeUndefined();
  });
});

describe('advertised phone port', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to 443 and leaves the port out of the origin', () => {
    vi.stubEnv('NOD_PHONE_HTTPS_PORT', '');
    expect(phoneHttpsPort()).toBe(443);
    expect(phoneOrigin(PHONE.host)).toBe(`https://${PHONE.host}`);
  });

  it('takes NOD_PHONE_HTTPS_PORT, so the 8443 setup can still be chosen', () => {
    vi.stubEnv('NOD_PHONE_HTTPS_PORT', '8443');
    expect(phoneOrigin(PHONE.host)).toBe(`https://${PHONE.host}:8443`);
  });

  it('rejects a value that is not a port', () => {
    for (const raw of ['0', '70000', '443x', '-1']) expect(() => phoneHttpsPort(raw)).toThrow('NOD_PHONE_HTTPS_PORT');
  });
});
