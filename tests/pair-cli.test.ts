import { describe, expect, it, vi } from 'vitest';
import type { PairCode } from '../shared/pairing';

const TOKEN = 'a'.repeat(64);
const PHONE = { host: 'hub.example.ts.net', owner: 'owner@example.com' };

const serviceRequest = vi.hoisted(() => vi.fn());
vi.mock('../server/update-request', async (real) => ({
  ...(await real<typeof import('../server/update-request')>()),
  serviceRequest,
}));

const { cliArgs, cliCommand, pairRole, pairText, runCli } = await import('../server/cli');
const { createApp } = await import('../server/app');
const { DeviceStore } = await import('../server/devices');
const { FixtureProvider } = await import('../server/fixture-provider');
const { PairingCodes } = await import('../server/pairing');

/** A real code from the server, as the service would answer `nod pair`. */
async function realCode(role: PairCode['role']): Promise<{ code: PairCode; pairing: InstanceType<typeof PairingCodes> }> {
  const pairing = new PairingCodes();
  const app = createApp({ provider: new FixtureProvider(), port: 4477, token: TOKEN, phone: PHONE, devices: DeviceStore.memory(), pairing });
  const origin = 'http://127.0.0.1:4477';
  const res = await app.request(`${origin}/api/pair/code`, {
    method: 'POST',
    headers: { host: '127.0.0.1:4477', origin, 'x-nod-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  return { code: (await res.json()) as PairCode, pairing };
}

describe('nod pair roles', () => {
  it('reads the role from the flags', () => {
    expect(pairRole(['pair'])).toBe('phone');
    expect(pairRole(['pair', '--admin'])).toBe('admin');
    expect(pairRole(['pair', '--desktop', '--ozone-platform=headless'])).toBe('desktop');
  });

  it.each(['phone', 'desktop', 'admin'] as const)('asks the service for a %s code and never prints the token', async (role) => {
    const { code, pairing } = await realCode(role);
    serviceRequest.mockResolvedValueOnce(code);
    const flags = role === 'phone' ? ['pair'] : ['pair', `--${role}`];

    const { out, code: exit } = await runCli('pair', flags, TOKEN);

    expect(serviceRequest).toHaveBeenLastCalledWith('POST', '/api/pair/code', TOKEN, { role });
    expect(exit).toBe(0);
    expect(out).toContain(`https://${PHONE.host}/pair#code=${code.code}`);
    expect(out).toContain('Expires in 10 min.');
    expect(out).not.toContain(TOKEN);
    expect(pairing.take(code.code)).toBe(role);
  });

  // A headless box: Chromium puts its switches ahead of the command word.
  it.each([
    ['phone', ['nod', '--ozone-platform=headless', '--no-sandbox', 'pair']],
    ['admin', ['nod', '--ozone-platform=headless', 'pair', '--admin']],
    ['desktop', ['nod', '--desktop', '--ozone-platform=headless', '--no-sandbox', 'pair']],
  ] as const)('recognises nod pair for a %s after Chromium switches and prints the link', async (role, argv) => {
    const command = cliCommand(argv);
    expect(command).toBe('pair');
    const { code } = await realCode(role);
    serviceRequest.mockResolvedValueOnce(code);

    const { out, code: exit } = await runCli(command!, cliArgs(argv), TOKEN);

    expect(serviceRequest).toHaveBeenLastCalledWith('POST', '/api/pair/code', TOKEN, { role });
    expect(exit).toBe(0);
    expect(out).toContain(`https://${PHONE.host}/pair#code=${code.code}`);
  });

  it('tells a desktop where to paste the link', () => {
    const text = pairText({ code: 'abc', link: 'https://hub.example.ts.net/pair#code=abc', expiresAt: new Date(Date.now() + 600_000).toISOString(), role: 'admin' });
    expect(text.split('\n')[0]).toBe('Pairs a desktop as admin. Paste the link in Settings > Hub > Pair this desktop:');
  });
});
