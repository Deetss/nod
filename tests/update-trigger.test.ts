import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateCheckResult } from '../shared/app-update';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import { OPEN_CHECK_GAP_MS, checkOnOpen } from '../server/update-on-open';
import { requestErrorText, requestUpdate } from '../server/update-request';

describe('checkOnOpen', () => {
  it('skips opens inside the gap after start, then checks once per gap', () => {
    let t = 0;
    const check = vi.fn(async (): Promise<UpdateCheckResult> => ({ state: 'current', version: '0.2.10' }));
    const opened = checkOnOpen({ check }, 600, () => t);

    opened();
    expect(check).not.toHaveBeenCalled();

    t = 600;
    opened();
    opened();
    expect(check).toHaveBeenCalledOnce();

    t = 1200;
    opened();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('does nothing without an updater', () => {
    expect(() => checkOnOpen(undefined, 0)()).not.toThrow();
  });
});

describe('GET /api/events', () => {
  afterEach(() => vi.useRealTimers());

  it('asks the updater to check when a window or phone opens, past the gap', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const check = vi.fn(async (): Promise<UpdateCheckResult> => ({ state: 'current', version: '0.2.10' }));
    const app = createApp({ provider: new FixtureProvider(), port: 4477, token: 't', devices: DeviceStore.memory(), updates: { check } });
    const open = async () => (await app.request('http://127.0.0.1:4477/api/events', { headers: { host: '127.0.0.1:4477' } })).body?.cancel();

    await open();
    expect(check).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + OPEN_CHECK_GAP_MS);
    await open();
    expect(check).toHaveBeenCalledOnce();
  });
});

describe('requestUpdate', () => {
  let server: Server | undefined;

  afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

  function serve(status: number, body: string): Promise<{ port: number; seen: () => Record<string, unknown> }> {
    let headers: Record<string, unknown> = {};
    server = createServer((req, res) => {
      headers = { ...req.headers, method: req.method, url: req.url };
      res.writeHead(status, { 'content-type': 'application/json' }).end(body);
    });
    return new Promise((resolve) =>
      server?.listen(0, '127.0.0.1', () => resolve({ port: (server?.address() as AddressInfo).port, seen: () => headers })),
    );
  }

  it('posts with the token and a loopback origin, and returns the answer', async () => {
    const { port, seen } = await serve(200, JSON.stringify({ state: 'found', version: '0.2.11', installs: 'restart' }));
    const result = await requestUpdate('tok', port);

    expect(result).toEqual({ state: 'found', version: '0.2.11', installs: 'restart' });
    expect(seen()).toMatchObject({ method: 'POST', url: '/api/updates/check', 'x-nod-token': 'tok', origin: `http://127.0.0.1:${port}` });
  });

  it('rejects a refused request with the server status', async () => {
    const { port } = await serve(403, '{"error":"Bad token"}');
    await expect(requestUpdate('nope', port)).rejects.toThrow('HTTP 403');
  });

  it('says how to start the service when nothing listens', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(requestErrorText(refused, 4477)).toBe('No Nod server is listening on port 4477. Start it with: systemctl --user start nod');
  });
});
