import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { loadOrCreateSessionToken } from '../server/session-token';

let dir: string | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function tokenPath(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'ri-token-'));
  return join(dir, 'state', 'session-token');
}

describe('session token store', () => {
  it('persists across two store instances', async () => {
    const path = await tokenPath();
    const first = await loadOrCreateSessionToken(path);
    const second = await loadOrCreateSessionToken(path);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it('regenerates a malformed file', async () => {
    const path = await tokenPath();
    await loadOrCreateSessionToken(path);
    await writeFile(path, 'not-a-token');
    const token = await loadOrCreateSessionToken(path);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect((await readFile(path, 'utf8')).trim()).toBe(token);
  });

  it('writes the file with mode 600', async () => {
    const path = await tokenPath();
    await loadOrCreateSessionToken(path);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});

describe('403 log line', () => {
  it('names the reason and path and never the token', async () => {
    const sent = 'sent-secret-token-value';
    const real = 'real-secret-token-value';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp({ provider: new FixtureProvider(), port: 4477, token: real });
    const res = await app.request('http://127.0.0.1:4477/api/refresh', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:4477',
        origin: 'http://127.0.0.1:4477',
        'x-nod-token': sent,
      },
    });
    expect(res.status).toBe(403);
    const lines = spy.mock.calls.map((c) => c.join(' '));
    expect(lines).toContain('[security] 403 Forbidden token on /api/refresh');
    for (const line of lines) {
      expect(line).not.toContain(sent);
      expect(line).not.toContain(real);
    }
  });
});
