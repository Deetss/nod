import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { attachOrStart, findRunningService, startupLines } from '../server/service';

const servers: Server[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

function listen(make: () => Server): Promise<number> {
  const server = make();
  servers.push(server);
  return new Promise((resolve) => {
    server.once('listening', () => resolve((server.address() as AddressInfo).port));
  });
}

/** A real nod server on a free port. */
function runService(): Promise<number> {
  const app = createApp({ provider: new FixtureProvider(), port: 0, token: 't' });
  return listen(() => serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }) as Server);
}

/** A port with nothing listening. */
async function freePort(): Promise<number> {
  const port = await listen(() => createServer().listen(0, '127.0.0.1'));
  servers.pop()?.close();
  return port;
}

describe('desktop attach', () => {
  it('uses a running service and does not start a second server', async () => {
    const port = await runService();
    const start = vi.fn(() => Promise.resolve('http://127.0.0.1:1'));
    const result = await attachOrStart(start, port);
    expect(result).toEqual({ origin: `http://127.0.0.1:${port}`, attached: true });
    expect(start).not.toHaveBeenCalled();
  });

  it('starts its own server when nothing answers', async () => {
    const start = vi.fn(() => Promise.resolve('http://127.0.0.1:5555'));
    const result = await attachOrStart(start, await freePort());
    expect(result).toEqual({ origin: 'http://127.0.0.1:5555', attached: false });
    expect(start).toHaveBeenCalledOnce();
  });

  it('ignores another program on the port', async () => {
    const port = await listen(() =>
      createServer((_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end('{"app":"something-else"}');
      }).listen(0, '127.0.0.1'),
    );
    expect(await findRunningService(port)).toBeUndefined();
  });
});

describe('attachOrStart when the port is lost', () => {
  const inUse = () => Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
  const healthy = () => new Response(JSON.stringify({ app: 'nod' }));

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('attaches when the service answers on the third re-probe', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('refused'))
      .mockRejectedValueOnce(new Error('refused'))
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValueOnce(healthy());
    vi.stubGlobal('fetch', fetchMock);
    const start = vi.fn(() => Promise.reject(inUse()));
    const pending = attachOrStart(start, 4477);
    await vi.advanceTimersByTimeAsync(300 * 3);
    expect(await pending).toEqual({ origin: 'http://127.0.0.1:4477', attached: true });
    expect(start).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rethrows when the service never answers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error('refused'));
    vi.stubGlobal('fetch', fetchMock);
    const pending = attachOrStart(() => Promise.reject(inUse()), 4477);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await vi.advanceTimersByTimeAsync(300 * 10);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it('rethrows other errors at once without re-probing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('refused'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(attachOrStart(() => Promise.reject(new Error('boom')), 4477)).rejects.toThrow('boom');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('startupLines', () => {
  const bound = 'http://127.0.0.1:4477';

  it('prints the bound address, the advertised address and the pairing status', () => {
    const lines = startupLines({
      bound,
      phone: { host: 'hq.example.ts.net', owner: 'owner@example.com' },
      deviceCount: 2,
      httpsPort: 443,
    });
    expect(lines[0]).toContain(bound);
    expect(lines).toContain('Advertised address: https://hq.example.ts.net');
    expect(lines).toContain('Tailscale Serve, run once: tailscale serve --bg --https=443 http://127.0.0.1:4477');
    expect(lines.join('\n')).toContain('2 phones paired');
  });

  it('advertises a configured port', () => {
    const phone = { host: 'hq.example.ts.net', owner: 'owner@example.com' };
    const lines = startupLines({ bound, phone, deviceCount: 0, httpsPort: 8443 });
    expect(lines).toContain('Advertised address: https://hq.example.ts.net:8443');
    expect(lines).toContain('Tailscale Serve, run once: tailscale serve --bg --https=8443 http://127.0.0.1:4477');
  });

  it('says so when tailscale is unavailable', () => {
    const text = startupLines({ bound, phone: undefined, deviceCount: 0 }).join('\n');
    expect(text).toContain('Advertised address: none');
    expect(text).toContain('Pairing: off');
  });
});
