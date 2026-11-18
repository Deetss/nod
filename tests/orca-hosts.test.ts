import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { Orca, type OrcaExec } from '../server/orca';
import { parseEnvironments, pickHost } from '../server/orca-hosts';
import { OrcaPrefsStore } from '../server/orca-prefs';
import type { HostStatus } from '../shared/orca-hosts';
import { applyPrefsPatch, DEFAULT_ORCA_PREFS, parseOrcaPrefs } from '../shared/orca-prefs';
import type { NoticeResult, OrcaSessionsResponse } from '../shared/orca-sessions';
import { harness, type FakeSession } from './orca-helpers';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const host = `127.0.0.1:${PORT}`;
const headers = { 'content-type': 'application/json', host, origin: ORIGIN, 'x-nod-token': TOKEN };

/** acme-co/acme-api #310 has head ref crew/acmeapi-data-read-bonus in the fixtures. */
const crew: FakeSession = { name: 'crew-310', repo: 'acme-api', branch: 'crew/acmeapi-data-read-bonus' };
const remote305: FakeSession = { name: 'bot-305', repo: 'acme-api', linkedPr: 305 };
const dispatch = { repo: 'acme-co/acme-api', number: 12, agent: 'claude', name: 'issue-12-x', prompt: 'Fix it' };

function setup(local: FakeSession[], remotes: Record<string, { sessions: FakeSession[]; down?: boolean }> = {}, prefs = OrcaPrefsStore.memory()) {
  const h = harness(local);
  Object.assign(h.remotes, remotes);
  const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, orca: h.orca, orcaPrefs: prefs });
  return {
    h,
    prefs,
    get: async <T>(path: string) => (await (await app.request(`${ORIGIN}/api${path}`, { headers: { host } })).json()) as T,
    post: (path: string, body: unknown) => app.request(`${ORIGIN}/api${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
  };
}

const writes = (calls: string[][]) => calls.filter((c) => (c[1] === 'terminal' && c[2] === 'send') || (c[1] === 'worktree' && c[2] === 'create'));

describe('the cli choke point', () => {
  it('appends --environment for a paired host and never for local', async () => {
    const calls: string[][] = [];
    const exec: OrcaExec = async (_bin, args) => {
      calls.push(args);
      return '{}';
    };
    const orca = new Orca({ exec, candidates: ['orca-ide'] });
    await orca.cli(['worktree', 'ps', '--json'], 1000, 'laptop');
    await orca.cli(['worktree', 'ps', '--json'], 1000, 'local');
    expect(calls[1]).toEqual(['worktree', 'ps', '--json', '--environment', 'laptop']);
    expect(calls[2]).toEqual(['worktree', 'ps', '--json']);
  });

  it('names a host by name, else by id, and never lists local', () => {
    const json = JSON.stringify({
      result: { environments: [{ id: 'e1', name: 'laptop' }, { id: 'e2' }, { id: 'e3', name: 'has space' }, { name: 'local' }, { name: '-x' }] },
    });
    expect(parseEnvironments(json)).toEqual(['laptop', 'e2', 'e3']);
  });
});

describe('host selection', () => {
  const hosts: HostStatus[] = [
    { name: 'local', online: true, lastSeen: 1 },
    { name: 'laptop', online: true, lastSeen: 1 },
    { name: 'desktop', online: false, lastSeen: null },
  ];

  it('takes the asked host, then the repo host, then the default host, then local', () => {
    const prefs = { defaultHost: 'laptop', hosts: { 'acme-co/acme-api': 'local' } };
    expect(pickHost('laptop', hosts, prefs, 'acme-co/acme-api')).toEqual({ ok: true, host: 'laptop' });
    expect(pickHost(undefined, hosts, prefs, 'acme-co/acme-api')).toEqual({ ok: true, host: 'local' });
    expect(pickHost(undefined, hosts, prefs, 'acme-co/other')).toEqual({ ok: true, host: 'laptop' });
    expect(pickHost(undefined, hosts, { hosts: {} }, 'acme-co/other')).toEqual({ ok: true, host: 'local' });
  });

  it('refuses an unknown host with 400 and an offline host with 503, naming it', () => {
    expect(pickHost('nowhere', hosts, { hosts: {} })).toEqual({ ok: false, status: 400, error: 'Unknown Orca host: nowhere' });
    expect(pickHost('desktop', hosts, { hosts: {} })).toEqual({ ok: false, status: 503, error: 'Orca host desktop is offline' });
  });
});

describe('host-aware routes', () => {
  it('returns 400 for an unknown host before any write reaches Orca', async () => {
    const s = setup([crew], { laptop: { sessions: [remote305] } });
    const id = 'r-acme-api::/w/crew-310|tab-crew-310:leaf-crew-310';
    expect((await s.post('/orca/send', { sessionId: id, host: 'nowhere', text: '[nod] hi' })).status).toBe(400);
    expect((await s.post('/orca/open', { sessionId: id, host: 'nowhere' })).status).toBe(400);
    expect((await s.post('/orca/dispatch', { ...dispatch, host: 'nowhere' })).status).toBe(400);
    expect((await s.post('/orca/send', { sessionId: id, host: '--bad', text: '[nod] hi' })).status).toBe(400);
    expect(writes(s.h.calls)).toEqual([]);
  });

  it('names an offline host and queues nothing', async () => {
    const s = setup([crew], { desktop: { sessions: [remote305], down: true } });
    const res = await s.post('/orca/dispatch', { ...dispatch, host: 'desktop' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Orca host desktop is offline' });
    expect((await s.post('/orca/send', { sessionId: 'x', host: 'desktop', text: '[nod] hi' })).status).toBe(503);
    expect(writes(s.h.calls)).toEqual([]);
  });

  it('dispatches to the default host when none is asked', async () => {
    const prefs = OrcaPrefsStore.memory();
    prefs.patch({ defaultHost: 'laptop' });
    const s = setup([], { laptop: { sessions: [] } }, prefs);
    const res = await s.post('/orca/dispatch', dispatch);
    expect(res.status).toBe(200);
    expect(writes(s.h.calls)[0]?.slice(-2)).toEqual(['--environment', 'laptop']);
  });

  it('merges sessions from every online host, each with its host, and sends back to it', async () => {
    const s = setup([crew], { laptop: { sessions: [remote305] }, desktop: { sessions: [], down: true } });
    const res = await s.get<OrcaSessionsResponse>('/orca/sessions');
    expect(res.byPr['PR_acme-co/acme-api_310']?.related.map((r) => [r.name, r.host])).toEqual([['crew-310', 'local']]);
    const remote = res.byPr['PR_acme-co/acme-api_305']?.related[0];
    expect([remote?.name, remote?.host]).toEqual(['bot-305', 'laptop']);

    expect((await s.post('/orca/send', { sessionId: remote!.id, host: 'laptop', text: '[nod] hi' })).status).toBe(200);
    const send = s.h.sends()[0]!;
    expect(send.slice(-2)).toEqual(['--environment', 'laptop']);
    expect(send).toContain('term_bot-305');
  });

  it('remembers a chosen session with its host', async () => {
    const s = setup([], { laptop: { sessions: [remote305] } });
    const id = 'r-acme-api::/w/bot-305|tab-bot-305:leaf-bot-305';
    expect((await s.post('/orca/choose', { prId: 'PR_1', sessionId: id, host: 'laptop' })).status).toBe(200);
    expect(s.prefs.get().chosen.PR_1).toEqual({ host: 'laptop', worktreeId: 'r-acme-api::/w/bot-305', sessionId: id });
    expect((await s.post('/orca/choose', { prId: 'PR_2', sessionId: id, host: 'local' })).status).toBe(404);
  });

  it('lists hosts with their online state and last seen time', async () => {
    const s = setup([crew], { laptop: { sessions: [] }, desktop: { sessions: [], down: true } });
    const hosts = await s.get<HostStatus[]>('/orca/hosts');
    expect(hosts).toEqual([
      { name: 'local', online: true, lastSeen: expect.any(Number) },
      { name: 'laptop', online: true, lastSeen: expect.any(Number) },
      { name: 'desktop', online: false, lastSeen: null },
    ]);
  });

  it('refuses a host preference for a host it does not know', async () => {
    const s = setup([]);
    expect((await s.post('/orca/prefs', { defaultHost: 'nowhere' })).status).toBe(400);
    expect((await s.post('/orca/prefs', { repo: 'acme-co/acme-api', host: 'local' })).status).toBe(200);
    expect(s.prefs.get().hosts).toEqual({ 'acme-co/acme-api': 'local' });
  });
});

describe('automatic messages across hosts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('notifies a related session on a paired host and skips an offline host with one line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const s = setup([], { laptop: { sessions: [crew] }, desktop: { sessions: [], down: true } });
    const res = await s.post('/review', { repo: 'acme-co/acme-api', number: 310, event: 'APPROVE', body: '' });
    const { noticeId } = (await res.json()) as { noticeId: string };
    const notice = await s.get<NoticeResult>(`/orca/notice/${noticeId}`);
    expect(notice).toMatchObject({ status: 'notified', name: 'crew-310' });
    expect(s.h.sends()[0]?.slice(-2)).toEqual(['--environment', 'laptop']);
    expect(log.mock.calls.filter((c) => String(c[0]).startsWith('[orca] skipped'))).toEqual([['[orca] skipped desktop: offline']]);
  });
});

describe('prefs migration', () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('reads old chosen entries as local', () => {
    const prefs = parseOrcaPrefs({ chosen: { A: { worktreeId: 'w', sessionId: 'w|p' }, B: 'w2' } });
    expect(prefs.chosen).toEqual({ A: { host: 'local', worktreeId: 'w', sessionId: 'w|p' }, B: { host: 'local', worktreeId: 'w2' } });
  });

  it('writes the old file back in the new shape on the next save, mode 600', async () => {
    dir = await mkdtemp(join(tmpdir(), 'nod-hosts-'));
    const path = join(dir, 'orca-prefs.json');
    await writeFile(path, JSON.stringify({ chosen: { A: { worktreeId: 'w', sessionId: 'w|p' }, B: 'w2' } }));
    const store = await OrcaPrefsStore.open(path);
    store.patch({ defaultHost: 'laptop' });
    await store.flush();
    const saved = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(saved.chosen).toEqual({ A: { host: 'local', worktreeId: 'w', sessionId: 'w|p' }, B: { host: 'local', worktreeId: 'w2' } });
    expect(saved.defaultHost).toBe('laptop');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('clears host choices with null', () => {
    const set = applyPrefsPatch(applyPrefsPatch(DEFAULT_ORCA_PREFS, { defaultHost: 'laptop' }), { repo: 'a/b', host: 'laptop' });
    expect(applyPrefsPatch(set, { defaultHost: null }).defaultHost).toBeUndefined();
    expect(applyPrefsPatch(set, { repo: 'a/b', host: null }).hosts).toEqual({});
  });
});

describe('fixture mode', () => {
  it('shows an online and an offline paired host, with sessions from local and laptop', async () => {
    const orca = new Orca({ fixtures: true, log: () => undefined });
    const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, orca, orcaPrefs: OrcaPrefsStore.memory() });
    const get = async <T>(path: string) => (await (await app.request(`${ORIGIN}/api${path}`, { headers: { host } })).json()) as T;
    const hosts = await get<HostStatus[]>('/orca/hosts');
    expect(hosts.map((h) => [h.name, h.online])).toEqual([
      ['local', true],
      ['laptop', true],
      ['desktop', false],
    ]);
    const res = await get<OrcaSessionsResponse>('/orca/sessions');
    const seen = new Set(Object.values(res.byPr).flatMap((p) => [...p.related, ...p.possible].map((v) => v.host)));
    expect([...seen].sort()).toEqual(['laptop', 'local']);
  });
});
