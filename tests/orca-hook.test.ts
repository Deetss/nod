import { describe, expect, it } from 'vitest';
import { ActivityStore } from '../server/activity-store';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { OrcaPrefsStore } from '../server/orca-prefs';
import type { NoticeResult } from '../shared/orca-sessions';
import { harness, type FakeSession, type Harness } from './orca-helpers';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const headers = {
  'content-type': 'application/json',
  host: `127.0.0.1:${PORT}`,
  origin: ORIGIN,
  'x-nod-token': TOKEN,
};

/** acme-co/acme-api #310 is a fixture PR whose head ref is crew/acmeapi-data-read-bonus. */
const crew: FakeSession = { name: 'crew-310', repo: 'acme-api', branch: 'crew/acmeapi-data-read-bonus' };
const second: FakeSession = { name: 'bot-310', repo: 'acme-api', linkedPr: 310 };

interface Ctx {
  h: Harness;
  prefs: OrcaPrefsStore;
  activity: ActivityStore;
  call: (path: string, body: unknown) => Response | Promise<Response>;
  get: (path: string) => Response | Promise<Response>;
  notice: (id: string) => Promise<NoticeResult>;
}

function setup(sessions: FakeSession[], provider = new FixtureProvider(), timeoutMs?: number): Ctx {
  const h = harness(sessions);
  const prefs = OrcaPrefsStore.memory();
  const activity = ActivityStore.memory();
  const app = createApp({
    provider,
    port: PORT,
    token: TOKEN,
    orca: h.orca,
    orcaPrefs: prefs,
    activity,
    ...(timeoutMs ? { orcaNotifyTimeoutMs: timeoutMs } : {}),
  });
  return {
    h,
    prefs,
    activity,
    call: (path, body) => app.request(`${ORIGIN}/api${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    get: (path) => app.request(`${ORIGIN}/api${path}`, { headers: { host: headers.host } }),
    notice: async (id) => (await (await app.request(`${ORIGIN}/api/orca/notice/${id}`, { headers: { host: headers.host } })).json()) as NoticeResult,
  };
}

const approve = { repo: 'acme-co/acme-api', number: 310, event: 'APPROVE', body: '' };

describe('automatic messages: the action never waits on the notification', () => {
  it('answers first, then sends one message with the fixed template', async () => {
    const { h, call, notice } = setup([crew]);
    const res = await call('/review', approve);
    const body = (await res.json()) as { ok: boolean; noticeId?: string };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.noticeId).toBeTruthy();
    expect(await notice(body.noticeId!)).toEqual({ status: 'notified', name: 'crew-310', word: 'approved', confirmed: true });
    expect(h.sends()).toHaveLength(1);
    const text = h.sends()[0]![h.sends()[0]!.indexOf('--text') + 1];
    expect(text).toBe(
      '[nod] FYI, no action needed: acme-co/acme-api #310 was approved by acme-dev.\nhttps://github.com/acme-co/acme-api/pull/310',
    );
  });

  it('returns the action result while the send hangs, and the notice times out', async () => {
    const { h, call, notice } = setup([crew], new FixtureProvider(), 60);
    h.onSend.fn = () => new Promise<string>(() => undefined);
    const t0 = Date.now();
    const res = await call('/review', approve);
    const body = (await res.json()) as { ok: boolean; noticeId?: string };
    expect(Date.now() - t0).toBeLessThan(40);
    expect(body.ok).toBe(true);
    const result = await notice(body.noticeId!);
    expect(result).toMatchObject({ status: 'failed', code: 'timeout' });
    expect(h.sends()).toHaveLength(1);
  });

  it('does not change the response when the lookup throws', async () => {
    class Broken extends FixtureProvider {
      override async detail(): Promise<never> {
        throw new Error('boom');
      }
    }
    const { call, notice } = setup([crew], new Broken());
    const res = await call('/merge', { repo: 'acme-co/acme-api', number: 310 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; noticeId?: string };
    expect(body.ok).toBe(true);
    // The head ref is unknown, so only a linked PR could relate; none exists.
    expect(await notice(body.noticeId!)).toEqual({ status: 'none' });
  });

  it('does not notify when the action failed', async () => {
    class Refuses extends FixtureProvider {
      override async review() {
        return { ok: false, message: 'GitHub said no' };
      }
    }
    const { h, call } = setup([crew], new Refuses());
    const body = (await (await call('/review', approve)).json()) as { ok: boolean; noticeId?: string };
    expect(body.ok).toBe(false);
    expect(body.noticeId).toBeUndefined();
    expect(h.calls.filter((c) => c[1] === 'worktree')).toHaveLength(0);
  });

  it('sends once per event, not once per poll', async () => {
    const draft: FakeSession = { name: 'crew-1352', repo: 'acme-web', branch: 'feature/1352' };
    const { h, call, notice } = setup([draft]);
    const body = (await (await call('/ready', { repo: 'acme-co/acme-web', number: 1352 })).json()) as { noticeId?: string };
    await notice(body.noticeId!);
    await notice(body.noticeId!);
    expect(h.sends()).toHaveLength(1);
  });

  it('does not notify when Orca is down, and the action still succeeds', async () => {
    const { h, call, notice } = setup([crew]);
    h.down.value = true;
    const body = (await (await call('/review', approve)).json()) as { ok: boolean; noticeId?: string };
    expect(body.ok).toBe(true);
    expect(await notice(body.noticeId!)).toEqual({ status: 'none' });
    expect(h.sends()).toHaveLength(0);
  });
});

describe('automatic messages: which session', () => {
  it('sends nothing when two sessions are related, and says so', async () => {
    const { h, call, notice } = setup([crew, second]);
    const body = (await (await call('/review', { ...approve, event: 'REQUEST_CHANGES' })).json()) as { noticeId?: string };
    expect(await notice(body.noticeId!)).toEqual({ status: 'several', count: 2, word: 'changes requested' });
    expect(h.sends()).toHaveLength(0);
  });

  it('sends to the chosen session when two are related', async () => {
    const { h, prefs, call, notice } = setup([crew, second]);
    const id = 'PR_acme-co/acme-api_310';
    prefs.choose(id, { worktreeId: 'r-acme-api::/w/bot-310', sessionId: 'r-acme-api::/w/bot-310|tab-bot-310:leaf-bot-310' });
    const body = (await (await call('/review', approve)).json()) as { noticeId?: string };
    expect(await notice(body.noticeId!)).toMatchObject({ status: 'notified', name: 'bot-310' });
    expect(h.sends()[0]).toContain('term_bot-310');
  });

  it('says nothing for a PR with no related session, and logs a quiet entry', async () => {
    const { h, call, notice, get } = setup([{ name: 'other', repo: 'acme-api', branch: 'unrelated' }]);
    const body = (await (await call('/review', approve)).json()) as { noticeId?: string };
    expect(await notice(body.noticeId!)).toEqual({ status: 'none' });
    expect(h.sends()).toHaveLength(0);
    // The Activity route reads the saved lists into the log, then serves the feed.
    const feed = (await (await get('/activity')).json()) as ReturnType<ActivityStore['feed']>;
    const group = feed.groups.find((g) => g.item.number === 310);
    expect(group?.notices?.[0]?.text).toBe('Nod: no Orca session related, nobody notified (approved)');
  });

  it('skips a done session for approve and reaches it for request changes', async () => {
    const { h, call, notice } = setup([{ ...crew, state: 'done' }]);
    const a = (await (await call('/review', approve)).json()) as { noticeId?: string };
    expect(await notice(a.noticeId!)).toEqual({ status: 'none' });
    expect(h.sends()).toHaveLength(0);
    const r = (await (await call('/review', { ...approve, event: 'REQUEST_CHANGES' })).json()) as { noticeId?: string };
    expect(await notice(r.noticeId!)).toMatchObject({ status: 'notified' });
    expect(h.sends()).toHaveLength(1);
  });

  it('tells a done session to wrap up after an admin merge, logged as an automatic message', async () => {
    const { h, call, notice, get } = setup([{ ...crew, state: 'done' }]);
    const body = (await (await call('/admin-merge', { repo: 'acme-co/acme-api', number: 310, confirm: 310 })).json()) as {
      noticeId?: string;
    };
    expect(await notice(body.noticeId!)).toEqual({ status: 'notified', name: 'crew-310', word: 'admin merged', confirmed: true });
    expect(h.sends()).toHaveLength(1);
    const text = h.sends()[0]![h.sends()[0]!.indexOf('--text') + 1];
    expect(text).toBe(
      '[nod] acme-co/acme-api #310 was admin merged by acme-dev. Finish any follow-up for it, then run /compress to wrap up.\n' +
        'https://github.com/acme-co/acme-api/pull/310',
    );
    const feed = (await (await get('/activity')).json()) as ReturnType<ActivityStore['feed']>;
    const group = feed.groups.find((g) => g.item.number === 310);
    expect(group?.notices?.[0]?.text).toBe('Nod notified crew-310 (admin merged)');
  });

  it('never notifies a session in an unknown state', async () => {
    const { h, call, notice } = setup([{ ...crew, state: 'blocked' }]);
    const body = (await (await call('/review', { ...approve, event: 'REQUEST_CHANGES' })).json()) as { noticeId?: string };
    expect(await notice(body.noticeId!)).toEqual({ status: 'none' });
    expect(h.sends()).toHaveLength(0);
  });

  it('reports a session that exited', async () => {
    const { call, notice } = setup([{ ...crew, writable: false }]);
    const body = (await (await call('/review', approve)).json()) as { noticeId?: string };
    expect(await notice(body.noticeId!)).toEqual({ status: 'exited', name: 'crew-310', word: 'approved' });
  });

  it('reports a failed send without retrying', async () => {
    const { h, call, notice } = setup([crew]);
    h.onSend.fn = () => {
      throw new Error('{"error":{"code":"agent_prompt_blocked"}}');
    };
    const body = (await (await call('/review', approve)).json()) as { noticeId?: string };
    expect(await notice(body.noticeId!)).toMatchObject({ status: 'failed', code: 'agent_prompt_blocked' });
    expect(h.sends()).toHaveLength(1);
  });

  it('reaches a session linked to an issue on close, with the reason in the text', async () => {
    const { h, call, notice } = setup([{ name: 'crew-issue-412', repo: 'acme-api', linkedIssue: 412 }]);
    const res = await call('/issue-action', { type: 'close', repo: 'acme-co/acme-api', number: 412, reason: 'NOT_PLANNED' });
    const body = (await res.json()) as { noticeId?: string };
    expect(await notice(body.noticeId!)).toMatchObject({ status: 'notified', word: 'closed' });
    const text = h.sends()[0]![h.sends()[0]!.indexOf('--text') + 1];
    expect(text).toContain('issue #412 was closed as not planned by acme-dev.');
    expect(text).toContain('/issues/412');
  });

  it('sends nothing for other issue actions', async () => {
    const { h, call } = setup([{ name: 'crew-issue-412', repo: 'acme-api', linkedIssue: 412 }]);
    const body = (await (await call('/issue-action', { type: 'comment', repo: 'acme-co/acme-api', number: 412, body: 'hi' })).json()) as {
      noticeId?: string;
    };
    expect(body.noticeId).toBeUndefined();
    expect(h.calls.filter((c) => c[1] === 'worktree')).toHaveLength(0);
  });
});

describe('automatic messages: the switch', () => {
  it('does nothing at all when the global switch is off', async () => {
    const { h, prefs, call } = setup([crew]);
    prefs.patch({ enabled: false });
    const body = (await (await call('/review', approve)).json()) as { ok: boolean; noticeId?: string };
    expect(body.ok).toBe(true);
    expect(body.noticeId).toBeUndefined();
    expect(h.calls.filter((c) => c[1] === 'worktree' || c[1] === 'terminal')).toHaveLength(0);
  });

  it('a repo set to off skips the hook while the box is on', async () => {
    const { h, prefs, call } = setup([crew]);
    prefs.patch({ repo: 'acme-co/acme-api', mode: 'off' });
    const body = (await (await call('/review', approve)).json()) as { noticeId?: string };
    expect(body.noticeId).toBeUndefined();
    expect(h.sends()).toHaveLength(0);
  });

  it('a repo set to on sends while the box is off', async () => {
    const { h, prefs, call, notice } = setup([crew]);
    prefs.patch({ enabled: false });
    prefs.patch({ repo: 'acme-co/acme-api', mode: 'on' });
    const body = (await (await call('/review', approve)).json()) as { noticeId?: string };
    await notice(body.noticeId!);
    expect(h.sends()).toHaveLength(1);
  });
});

describe('free-form send route', () => {
  const id = 'r-acme-api::/w/crew-310|tab-crew-310:leaf-crew-310';

  it('sends only after a POST, tags the text and strips control characters', async () => {
    const { h, call } = setup([crew]);
    const res = await call('/orca/send', { sessionId: id, text: 'hello\u001b[2J there' });
    expect(await res.json()).toMatchObject({ status: 'sent' });
    const args = h.sends()[0]!;
    expect(args[args.indexOf('--text') + 1]).toBe('[nod] hello [2J there');
    expect(args).toContain('--enter');
  });

  it('rejects text over 600 characters and sends nothing', async () => {
    const { h, call } = setup([crew]);
    const res = await call('/orca/send', { sessionId: id, text: 'x'.repeat(601) });
    expect(res.status).toBe(400);
    expect(h.sends()).toHaveLength(0);
  });

  it('is behind the mutation guard', async () => {
    const { h } = setup([crew]);
    const app = createApp({ provider: new FixtureProvider(), port: PORT, token: TOKEN, orca: h.orca });
    const res = await app.request(`${ORIGIN}/api/orca/send`, {
      method: 'POST',
      headers: { ...headers, 'x-nod-token': 'wrong' },
      body: JSON.stringify({ sessionId: id, text: 'hi' }),
    });
    expect(res.status).toBe(403);
    expect(h.sends()).toHaveLength(0);
  });
});
