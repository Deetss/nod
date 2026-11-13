import { describe, expect, it } from 'vitest';
import { OrcaSessions, parseSessions, SESSIONS_TTL_MS } from '../server/orca-sessions';
import { harness, listJson, psJson, PROMPT_SECRET, type FakeSession } from './orca-helpers';

const a: FakeSession = { name: 'crew-1355', repo: 'acme-web', branch: 'build-bot/posthog-opt-in', linkedPr: 1355 };
const b: FakeSession = { name: 'bot-1343', repo: 'acme-api', state: 'done' };

const psCalls = (calls: string[][]) => calls.filter((c) => c[1] === 'worktree' && c[2] === 'ps').length;
const listCalls = (calls: string[][]) => calls.filter((c) => c[1] === 'terminal' && c[2] === 'list').length;

describe('parseSessions', () => {
  const names = (id: string) => id.replace(/^r-/, '');

  it('joins agent rows to terminals through paneKey and keeps only safe fields', () => {
    const snap = parseSessions(psJson([a]), listJson([a]), names, 5);
    expect(snap.sessions).toHaveLength(1);
    const [s] = snap.sessions;
    expect(s).toMatchObject({
      name: 'crew-1355',
      state: 'working',
      repo: 'acme-web',
      branch: 'build-bot/posthog-opt-in',
      linkedPrs: [{ number: 1355 }],
      live: true,
    });
    expect(snap.terminals.get(s!.id)).toEqual({ handle: 'term_crew-1355', writable: true });
  });

  it('never carries prompt, assistant text, tool input or previews', () => {
    const snap = parseSessions(psJson([a]), listJson([a]), names, 5);
    expect(JSON.stringify([...snap.sessions, ...snap.terminals])).not.toContain(PROMPT_SECRET);
  });

  it('maps an unknown agent state to unknown', () => {
    const snap = parseSessions(psJson([{ ...a, state: 'blocked' }]), listJson([a]), names, 5);
    expect(snap.sessions[0]?.state).toBe('unknown');
  });

  it('marks a session with no live pty as not live', () => {
    const snap = parseSessions(psJson([{ ...a, hasLivePty: false }]), listJson([a]), names, 5);
    expect(snap.sessions[0]?.live).toBe(false);
  });

  it('has no terminal entry when terminal list lacks the pane', () => {
    const snap = parseSessions(psJson([a]), listJson([{ ...a, noTerminal: true }]), names, 5);
    expect(snap.terminals.size).toBe(0);
  });

  it('reads a linked PR object with a url and a number-only linked item', () => {
    const raw = JSON.parse(psJson([a])) as { result: { worktrees: Record<string, unknown>[] } };
    raw.result.worktrees[0]!.linkedPR = { number: 9, url: 'https://github.com/acme-co/acme-api/pull/9' };
    raw.result.worktrees[0]!.linkedItems = [{ provider: 'github', type: 'issue', number: 412 }];
    const snap = parseSessions(JSON.stringify(raw), listJson([a]), names, 5);
    expect(snap.sessions[0]?.linkedPrs).toEqual([{ number: 9, repo: 'acme-api' }]);
    expect(snap.sessions[0]?.linkedIssues).toEqual([{ number: 412 }]);
  });
});

describe('OrcaSessions cache', () => {
  it('shares one read between concurrent callers', async () => {
    const h = harness([a, b]);
    h.delay.ms = 20;
    const sessions = new OrcaSessions(h.orca, () => h.clock.now);
    const snaps = await Promise.all([sessions.snapshot(), sessions.snapshot(), sessions.snapshot()]);
    expect(snaps.every((s) => s === snaps[0])).toBe(true);
    expect(psCalls(h.calls)).toBe(1);
    expect(listCalls(h.calls)).toBe(1);
  });

  it('serves the cache inside the TTL and reads again after it', async () => {
    const h = harness([a]);
    const sessions = new OrcaSessions(h.orca, () => h.clock.now);
    await sessions.snapshot();
    h.clock.now += SESSIONS_TTL_MS - 1;
    await sessions.snapshot();
    expect(psCalls(h.calls)).toBe(1);
    h.clock.now += 2;
    await sessions.snapshot();
    await sessions.fresh();
    expect(psCalls(h.calls)).toBeGreaterThanOrEqual(2);
  });

  it('serves the stale snapshot while one refresh runs', async () => {
    const h = harness([a]);
    const sessions = new OrcaSessions(h.orca, () => h.clock.now);
    const first = await sessions.snapshot();
    h.setSessions([a, b]);
    h.delay.ms = 30;
    h.clock.now += SESSIONS_TTL_MS + 1;
    const stale = await sessions.snapshot();
    expect(stale).toBe(first);
    expect(stale.sessions).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 80));
    const next = await sessions.snapshot();
    expect(next.sessions).toHaveLength(2);
    expect(psCalls(h.calls)).toBe(2);
  });

  it('reports unavailable when Orca is down and retries sooner than the TTL', async () => {
    const h = harness([a]);
    h.down.value = true;
    const sessions = new OrcaSessions(h.orca, () => h.clock.now);
    const down = await sessions.snapshot();
    expect(down.available).toBe(false);
    h.down.value = false;
    h.clock.now += 6_000;
    await sessions.snapshot();
    await new Promise((r) => setTimeout(r, 20));
    expect((await sessions.snapshot()).available).toBe(true);
  });

  it('costs two CLI calls per read no matter how many rows ask', async () => {
    const h = harness([a, b]);
    const sessions = new OrcaSessions(h.orca, () => h.clock.now);
    for (let i = 0; i < 50; i += 1) await sessions.snapshot();
    expect(psCalls(h.calls) + listCalls(h.calls)).toBe(2);
  });
});
