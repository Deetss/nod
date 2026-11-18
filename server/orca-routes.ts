import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { hostName, type HostStatus } from '../shared/orca-hosts';
import { matchSessions, relatedToIssue, type Matched } from '../shared/orca-match';
import { prepareSend } from '../shared/orca-message';
import { patchHost, prefsPatchBody, type OrcaPrefs } from '../shared/orca-prefs';
import type { OrcaPrefsView, OrcaSessionsResponse, PrSessions, SessionCandidate, SessionView } from '../shared/orca-sessions';
import type { Orca } from './orca';
import type { OrcaNotifier } from './notify-orca';
import { pickHost, type HostPick } from './orca-hosts';
import type { OrcaPrefsStore } from './orca-prefs';
import { PendingChecks } from './orca-confirm';
import { checkAgain, openInOrca, sendToSession } from './orca-send';
import type { OrcaSessions } from './orca-sessions';
import type { Provider } from './provider';

export interface OrcaRouteDeps {
  orca: Orca;
  sessions: OrcaSessions;
  prefs: OrcaPrefsStore;
  notifier: OrcaNotifier;
  provider: Provider;
}

const sessionId = z.string().min(1).max(600);
const requestId = z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/);

const sendBody = z.object({ sessionId, host: hostName.optional(), text: z.string().max(4000), requestId: requestId.optional() });
const chooseBody = z.object({ prId: z.string().min(1).max(200), sessionId: sessionId.nullable(), host: hostName.optional() });
const openBody = z.object({ sessionId, host: hostName.optional() });
const confirmBody = z.object({ sessionId, host: hostName.optional(), requestId });

const NOTICE_WAIT_MS = 6_000;
/** How long a send waits for the terminal to show an unconfirmed message, and how long Check again looks. */
const CONFIRM_MS = 4_000;
const RECHECK_MS = 1_500;

const view = (m: Matched): SessionView => ({
  id: m.session.id,
  host: m.session.host,
  name: m.session.name,
  state: m.session.state,
  branch: m.session.branch,
  via: m.via,
  reason: m.reason,
  ...(m.session.lastOutputAt ? { lastOutputAt: m.session.lastOutputAt } : {}),
});

/** The prefs the web reads: automatic messages and the host choices, never the chosen sessions. */
const prefsView = (p: OrcaPrefs): OrcaPrefsView => ({
  enabled: p.enabled,
  repos: p.repos,
  hosts: p.hosts,
  ...(p.defaultHost ? { defaultHost: p.defaultHost } : {}),
});

/** Related and possible sessions on every online host for every open PR that has any. One shared snapshot serves all rows. */
export async function sessionsResponse(deps: OrcaRouteDeps, state: string | undefined): Promise<OrcaSessionsResponse> {
  const snap = await deps.sessions.snapshot();
  const prefs = deps.prefs.get();
  const out: OrcaSessionsResponse = {
    available: snap.available,
    at: snap.at,
    prefs: prefsView(prefs),
    byPr: {},
    byIssue: {},
  };
  if (!snap.available) return out;
  const inbox = await deps.provider.inbox(state, 'none');
  const byPr: Record<string, PrSessions> = {};
  for (const pr of inbox.prs) {
    const chosen = prefs.chosen[pr.id];
    const m = matchSessions({ repo: pr.repo, number: pr.number, headRef: pr.headRef, closes: pr.closes }, snap.sessions, chosen);
    if (m.related.length === 0 && m.possible.length === 0) continue;
    const picked = m.related.find((r) => r.via === 'chosen');
    byPr[pr.id] = {
      related: m.related.map(view),
      possible: m.possible.map(view),
      ...(picked ? { chosen: picked.session.id } : {}),
    };
  }
  return { ...out, byPr, byIssue: await issueSessions(deps, state, snap.sessions) };
}

/** Sessions Orca links to each open issue. An issue lookup that fails leaves the PR sessions intact. */
async function issueSessions(
  deps: OrcaRouteDeps,
  state: string | undefined,
  sessions: readonly SessionCandidate[],
): Promise<Record<string, SessionView[]>> {
  try {
    const { issues } = await deps.provider.issues(state);
    const byIssue: Record<string, SessionView[]> = {};
    for (const issue of issues) {
      const related = relatedToIssue(issue.repo, issue.number, sessions);
      if (related.length > 0) byIssue[issue.id] = related.map(view);
    }
    return byIssue;
  } catch {
    return {};
  }
}

/** The live host list, for `GET /api/orca/hosts` and for checking a write's host. */
export async function hostList(sessions: OrcaSessions): Promise<HostStatus[]> {
  return (await sessions.snapshot()).hosts;
}

/** Picks and checks the host a write acts on. See `pickHost` for the order. */
export async function resolveHost(
  sessions: OrcaSessions,
  prefs: OrcaPrefsStore,
  requested: string | undefined,
  repo?: string,
): Promise<HostPick> {
  return pickHost(requested, await hostList(sessions), prefs.get(), repo);
}

const refuse = (c: Context, pick: Extract<HostPick, { ok: false }>) => c.json({ error: pick.error }, pick.status);

/** Registers the read routes on `app` and the write routes on `mutating`, which carries the mutation guard. */
export function registerOrcaRoutes(app: Hono, mutating: Hono, deps: OrcaRouteDeps): void {
  const state = (q: string | undefined) => q;
  const pending = new PendingChecks();
  const host = (requested: string | undefined) => resolveHost(deps.sessions, deps.prefs, requested);

  app.get('/api/orca/sessions', async (c) => c.json(await sessionsResponse(deps, state(c.req.query('state')))));

  app.get('/api/orca/hosts', async (c) => c.json(await hostList(deps.sessions)));

  app.get('/api/orca/notice/:id', async (c) => {
    const res = await deps.notifier.result(c.req.param('id'), NOTICE_WAIT_MS);
    return c.json(res ?? { status: 'none' });
  });

  // Fixture mode only: what the in-memory Orca received, for checking without a real session.
  app.get('/api/orca/fixture-sends', (c) =>
    deps.orca.fake
      ? c.json(deps.orca.fake.sends.map((s) => ({ host: s.host, handle: s.handle, text: s.text })))
      : c.json({ error: 'Not found' }, 404),
  );

  mutating.post('/orca/send', async (c) => {
    const parsed = sendBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const text = prepareSend(parsed.data.text);
    if (text === undefined) return c.json({ error: 'The message is empty or over 600 characters' }, 400);
    const pick = await host(parsed.data.host);
    if (!pick.ok) return refuse(c, pick);
    const res = await sendToSession(deps.orca, deps.sessions, pick.host, parsed.data.sessionId, text, {
      ...(parsed.data.requestId ? { retryRequestId: parsed.data.requestId } : {}),
      confirmMs: CONFIRM_MS,
      pending,
    });
    return c.json(res);
  });

  mutating.post('/orca/confirm', async (c) => {
    const parsed = confirmBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const pick = await host(parsed.data.host);
    if (!pick.ok) return refuse(c, pick);
    const res = await checkAgain(deps.orca, deps.sessions, pending, pick.host, parsed.data.sessionId, parsed.data.requestId, RECHECK_MS);
    return res ? c.json(res) : c.json({ error: 'That send is too old to check. Open the session in Orca.' }, 404);
  });

  mutating.post('/orca/choose', async (c) => {
    const parsed = chooseBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const { prId, sessionId: id } = parsed.data;
    if (id === null) {
      deps.prefs.choose(prId, null);
      return c.json({ ok: true });
    }
    const pick = await host(parsed.data.host);
    if (!pick.ok) return refuse(c, pick);
    const live = (await deps.sessions.snapshot()).sessions.find((s) => s.host === pick.host && s.id === id && s.live);
    if (!live) return c.json({ error: 'That session is not running' }, 404);
    deps.prefs.choose(prId, { host: live.host, worktreeId: live.worktreeId, sessionId: live.id });
    return c.json({ ok: true });
  });

  mutating.post('/orca/prefs', async (c) => {
    const parsed = prefsPatchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const named = patchHost(parsed.data);
    if (named && !(await hostList(deps.sessions)).some((h) => h.name === named)) {
      return c.json({ error: `Unknown Orca host: ${named}` }, 400);
    }
    const next = deps.prefs.patch(parsed.data);
    return c.json(prefsView(next));
  });

  mutating.post('/orca/open', async (c) => {
    const parsed = openBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const pick = await host(parsed.data.host);
    if (!pick.ok) return refuse(c, pick);
    const ok = await openInOrca(deps.orca, deps.sessions, pick.host, parsed.data.sessionId);
    return ok ? c.json({ ok }) : c.json({ error: 'Could not open that session in Orca' }, 502);
  });
}
