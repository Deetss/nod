import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { DeviceStore } from '../server/devices';
import { FixtureProvider } from '../server/fixture-provider';
import type { PhoneAccess } from '../server/security';
import { SeenStore } from '../server/seen';
import { changedMarks, mergeMarks, parseSeenMap, type SeenMap } from '../server/seen-merge';
import type { DeviceRole } from '../shared/pairing';

const OLD = { id: 'PR_1', updatedAt: '2026-11-10T10:00:00Z', headSha: 'aaa', commitCount: 2 };
const NEW = { ...OLD, updatedAt: '2026-11-12T10:00:00Z', headSha: 'bbb', commitCount: 3 };
const ISSUE = { id: 'I_1', updatedAt: '2026-11-11T09:00:00Z', commentCount: 4 };

describe('mergeMarks', () => {
  it('keeps the later timestamp per item', () => {
    expect(mergeMarks({ PR_1: NEW }, [OLD])).toEqual({ map: { PR_1: NEW }, changed: 0 });
    expect(mergeMarks({ PR_1: OLD }, [NEW])).toEqual({ map: { PR_1: NEW }, changed: 1 });
  });

  it('adds missing items and counts each change', () => {
    const { map, changed } = mergeMarks({ PR_1: OLD }, [NEW, ISSUE]);
    expect(changed).toBe(2);
    expect(map).toEqual({ PR_1: NEW, I_1: ISSUE });
  });

  it('is idempotent', () => {
    const once = mergeMarks({ PR_1: OLD }, [NEW, ISSUE]);
    const twice = mergeMarks(once.map, [NEW, ISSUE]);
    expect(twice).toEqual({ map: once.map, changed: 0 });
  });
});

describe('changedMarks', () => {
  it('lists marks new or changed since the snapshot', () => {
    const before: SeenMap = { PR_1: OLD, I_1: ISSUE };
    expect(changedMarks(before, { PR_1: NEW, I_1: ISSUE, I_2: { ...ISSUE, id: 'I_2' } })).toEqual([NEW, { ...ISSUE, id: 'I_2' }]);
    expect(changedMarks(before, before)).toEqual([]);
  });

  it('reads a damaged file as the entries that parse', () => {
    expect(parseSeenMap({ PR_1: OLD, bad: { id: 'bad' }, I_9: ISSUE })).toEqual({ PR_1: OLD });
    expect(parseSeenMap('nope')).toEqual({});
  });
});

describe('SeenStore.merge', () => {
  it('saves the merged map and reports changes', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'nod-seen-')), 'seen.json');
    const store = new SeenStore(path);
    await store.mark(OLD);
    expect(await store.merge([NEW, ISSUE])).toBe(2);
    expect(await store.merge([NEW, ISSUE])).toBe(0);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ PR_1: NEW, I_1: ISSUE });
  });
});

const PORT = 4477;
const TOKEN = 'test-token';
const PHONE: PhoneAccess = { host: 'hub.example.ts.net', owner: 'owner@example.com' };
const TAILNET = { host: PHONE.host, 'tailscale-user-login': PHONE.owner, 'content-type': 'application/json' };
const ORIGIN = `https://${PHONE.host}`;

function setup() {
  const devices = DeviceStore.memory();
  const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, phone: PHONE, devices });
  const push = (headers: Record<string, string>, marks: unknown[] = [NEW, ISSUE]) =>
    app.request(`${ORIGIN}/api/seen/merge`, { method: 'POST', headers: { ...TAILNET, ...headers }, body: JSON.stringify({ marks }) });
  const cookie = async (role: DeviceRole) => `nod_device=${await devices.add(`Test ${role}`, role)}`;
  return { push, cookie };
}

describe('POST /api/seen/merge', () => {
  it.each(['desktop', 'admin'] as const)('takes marks from a %s and counts changes once', async (role) => {
    const { push, cookie } = setup();
    const headers = { cookie: await cookie(role), origin: ORIGIN, 'x-nod-token': TOKEN };
    const first = await push(headers);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ changed: 2 });
    expect(await (await push(headers)).json()).toEqual({ changed: 0 });
  });

  it('refuses a phone key', async () => {
    const { push, cookie } = setup();
    const res = await push({ cookie: await cookie('phone'), origin: ORIGIN, 'x-nod-token': TOKEN });
    expect(res.status).toBe(403);
  });

  it('refuses a request without the token or the Origin', async () => {
    const { push, cookie } = setup();
    const key = await cookie('desktop');
    expect((await push({ cookie: key, origin: ORIGIN })).status).toBe(403);
    expect((await push({ cookie: key, 'x-nod-token': TOKEN })).status).toBe(403);
    expect((await push({ cookie: key, origin: 'https://evil.example', 'x-nod-token': TOKEN })).status).toBe(403);
  });

  it('refuses a request without a device key', async () => {
    const { push } = setup();
    expect((await push({ origin: ORIGIN, 'x-nod-token': TOKEN })).status).toBe(401);
  });

  it('rejects a bad body', async () => {
    const { push, cookie } = setup();
    const res = await push({ cookie: await cookie('desktop'), origin: ORIGIN, 'x-nod-token': TOKEN }, [{ id: 'x', updatedAt: 'later' }]);
    expect(res.status).toBe(400);
  });
});
