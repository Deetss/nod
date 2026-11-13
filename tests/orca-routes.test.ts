import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { OrcaPrefsStore } from '../server/orca-prefs';
import type { OrcaSessionsResponse } from '../shared/orca-sessions';
import { harness, type FakeSession } from './orca-helpers';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const host = `127.0.0.1:${PORT}`;
const post = { 'content-type': 'application/json', host, origin: ORIGIN, 'x-nod-token': TOKEN };

const crew: FakeSession = { name: 'crew-310', repo: 'acme-api', branch: 'crew/acmeapi-data-read-bonus' };
const linked: FakeSession = { name: 'bot-305', repo: 'acme-api', linkedPr: 305, state: 'done' };
const branch305: FakeSession = { name: 'crew-305-a', repo: 'acme-api', branch: 'feature/305' };
const possible: FakeSession = { name: 'crew-issue-412', repo: 'acme-api', linkedIssue: 412 };

function setup(sessions: FakeSession[], prefs = OrcaPrefsStore.memory()) {
  const h = harness(sessions);
  const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, orca: h.orca, orcaPrefs: prefs });
  return {
    h,
    prefs,
    sessions: async () => (await (await app.request(`${ORIGIN}/api/orca/sessions`, { headers: { host } })).json()) as OrcaSessionsResponse,
    post: (path: string, body: unknown) =>
      app.request(`${ORIGIN}/api${path}`, { method: 'POST', headers: post, body: JSON.stringify(body) }),
  };
}

describe('GET /api/orca/sessions', () => {
  it('sorts sessions into related and possible per PR, with one shared read', async () => {
    const s = setup([crew, linked, branch305, possible]);
    const res = await s.sessions();
    expect(res.available).toBe(true);
    expect(res.byPr['PR_acme-co/acme-api_310']?.related.map((r) => r.name)).toEqual(['crew-310']);
    expect(res.byPr['PR_acme-co/acme-api_310']?.related[0]).toMatchObject({ state: 'working', via: 'branch', reason: 'branch crew/acmeapi-data-read-bonus' });
    expect(res.byPr['PR_acme-co/acme-api_305']?.related.map((r) => r.name).sort()).toEqual(['bot-305', 'crew-305-a']);
    expect(res.byPr['PR_acme-co/acme-api_309']?.possible.map((r) => r.reason)).toEqual(['linked issue #412']);
    expect(res.byPr['PR_acme-co/acme-api_309']?.related).toEqual([]);
    expect(s.h.calls.filter((c) => c[2] === 'ps')).toHaveLength(1);
    expect(s.h.calls.filter((c) => c[2] === 'list' && c[1] === 'terminal')).toHaveLength(1);
  });

  it('lists the live sessions Orca links to each issue', async () => {
    const res = await setup([crew, possible, { ...possible, name: 'gone-412', hasLivePty: false }]).sessions();
    expect(res.byIssue['I_acme-co/acme-api_412']?.map((r) => [r.name, r.state, r.reason])).toEqual([
      ['crew-issue-412', 'working', 'linked issue #412'],
    ]);
    expect(Object.keys(res.byIssue)).toEqual(['I_acme-co/acme-api_412']);
  });

  it('omits PRs with nothing related or possible', async () => {
    const res = await setup([crew]).sessions();
    expect(Object.keys(res.byPr)).toEqual(['PR_acme-co/acme-api_310']);
  });

  it('reports available false when Orca is down, with no PR data', async () => {
    const s = setup([crew]);
    s.h.down.value = true;
    expect(await s.sessions()).toMatchObject({ available: false, byPr: {} });
  });

  it('carries the switch and overrides', async () => {
    const s = setup([crew]);
    s.prefs.patch({ repo: 'acme-co/acme-api', mode: 'off' });
    expect((await s.sessions()).prefs).toEqual({ enabled: true, repos: { 'acme-co/acme-api': 'off' } });
  });
});

describe('POST /api/orca/choose', () => {
  it('stores the choice, and the next read returns only that session', async () => {
    const s = setup([linked, branch305]);
    const before = await s.sessions();
    const pick = before.byPr['PR_acme-co/acme-api_305']!.related.find((r) => r.name === 'crew-305-a')!;
    const res = await s.post('/orca/choose', { prId: 'PR_acme-co/acme-api_305', sessionId: pick.id });
    expect(res.status).toBe(200);
    const after = await s.sessions();
    expect(after.byPr['PR_acme-co/acme-api_305']).toMatchObject({ chosen: pick.id });
    expect(after.byPr['PR_acme-co/acme-api_305']?.related.map((r) => r.name)).toEqual(['crew-305-a']);
  });

  it('refuses a session that is not running', async () => {
    const s = setup([linked]);
    const res = await s.post('/orca/choose', { prId: 'PR_acme-co/acme-api_305', sessionId: 'nope|nope' });
    expect(res.status).toBe(404);
    expect(s.prefs.get().chosen).toEqual({});
  });

  it('clears a choice with null', async () => {
    const s = setup([linked]);
    s.prefs.choose('PR_acme-co/acme-api_305', { worktreeId: 'w', sessionId: 'w|p' });
    await s.post('/orca/choose', { prId: 'PR_acme-co/acme-api_305', sessionId: null });
    expect(s.prefs.get().chosen).toEqual({});
  });
});

describe('POST /api/orca/prefs', () => {
  it('updates the switch and a repo override, and validates the body', async () => {
    const s = setup([]);
    expect(await (await s.post('/orca/prefs', { enabled: false })).json()).toEqual({ enabled: false, repos: {} });
    expect(await (await s.post('/orca/prefs', { repo: 'acme-co/acme-api', mode: 'on' })).json()).toEqual({ enabled: false, repos: { 'acme-co/acme-api': 'on' } });
    expect((await s.post('/orca/prefs', { repo: '../x', mode: 'on' })).status).toBe(400);
    expect((await s.post('/orca/prefs', { enabled: 'yes' })).status).toBe(400);
  });
});

describe('POST /api/orca/open', () => {
  it('switches to the session terminal found at call time', async () => {
    const s = setup([crew]);
    const res = await s.post('/orca/open', { sessionId: 'r-acme-api::/w/crew-310|tab-crew-310:leaf-crew-310' });
    expect(res.status).toBe(200);
    expect(s.h.calls.some((c) => c[1] === 'terminal' && c[2] === 'switch' && c.includes('term_crew-310'))).toBe(true);
  });

  it('fails for an unknown session', async () => {
    expect((await setup([crew]).post('/orca/open', { sessionId: 'x|y' })).status).toBe(502);
  });
});

describe('OrcaPrefsStore file', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('persists with mode 0600 and reloads', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orca-prefs-'));
    const path = join(dir, 'orca-prefs.json');
    const store = await OrcaPrefsStore.open(path);
    store.patch({ enabled: false });
    store.choose('PR_1', { worktreeId: 'w', sessionId: 'w|p' });
    await store.flush();
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ enabled: false, chosen: { PR_1: { sessionId: 'w|p' } } });
    const again = await OrcaPrefsStore.open(path);
    expect(again.get().enabled).toBe(false);
    expect(again.get().chosen.PR_1?.sessionId).toBe('w|p');
  });

  it('reads a damaged file as the defaults', async () => {
    dir = await mkdtemp(join(tmpdir(), 'orca-prefs-'));
    const path = join(dir, 'orca-prefs.json');
    await (await import('node:fs/promises')).writeFile(path, '{"enabled":"yes"}');
    expect((await OrcaPrefsStore.open(path)).get()).toEqual({ enabled: true, repos: {}, chosen: {}, dispatch: {} });
  });
});
