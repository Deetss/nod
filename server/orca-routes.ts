import type { Hono } from 'hono';
import { z } from 'zod';
import { matchSessions, relatedToIssue, type Matched } from '../shared/orca-match';
import { prepareSend } from '../shared/orca-message';
import { prefsPatchBody } from '../shared/orca-prefs';
import type { OrcaSessionsResponse, PrSessions, SessionCandidate, SessionView } from '../shared/orca-sessions';
import type { Orca } from './orca';
import type { OrcaNotifier } from './notify-orca';
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

const sendBody = z.object({
  sessionId: z.string().min(1).max(600),
  text: z.string().max(4000),
  requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/).optional(),
});
const chooseBody = z.object({ prId: z.string().min(1).max(200), sessionId: z.string().min(1).max(600).nullable() });
const openBody = z.object({ sessionId: z.string().min(1).max(600) });
const confirmBody = z.object({
  sessionId: z.string().min(1).max(600),
  requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,100}$/),
});

const NOTICE_WAIT_MS = 6_000;
/** How long a send waits for the terminal to show an unconfirmed message, and how long Check again looks. */
const CONFIRM_MS = 4_000;
const RECHECK_MS = 1_500;

const view = (m: Matched): SessionView => ({
  id: m.session.id,
  name: m.session.name,
  state: m.session.state,
  branch: m.session.branch,
  via: m.via,
  reason: m.reason,
  ...(m.session.lastOutputAt ? { lastOutputAt: m.session.lastOutputAt } : {}),
});

/** Related and possible sessions for every open PR that has any. One shared snapshot serves all rows. */
export async function sessionsResponse(deps: OrcaRouteDeps, state: string | undefined): Promise<OrcaSessionsResponse> {
  const snap = await deps.sessions.snapshot();
  const prefs = deps.prefs.get();
  const out: OrcaSessionsResponse = {
    available: snap.available,
    at: snap.at,
    prefs: { enabled: prefs.enabled, repos: prefs.repos },
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

/** Registers the read routes on `app` and the write routes on `mutating`, which carries the mutation guard. */
export function registerOrcaRoutes(app: Hono, mutating: Hono, deps: OrcaRouteDeps): void {
  const state = (q: string | undefined) => q;
  const pending = new PendingChecks();

  app.get('/api/orca/sessions', async (c) => c.json(await sessionsResponse(deps, state(c.req.query('state')))));

  app.get('/api/orca/notice/:id', async (c) => {
    const res = await deps.notifier.result(c.req.param('id'), NOTICE_WAIT_MS);
    return c.json(res ?? { status: 'none' });
  });

  // Fixture mode only: what the in-memory Orca received, for checking without a real session.
  app.get('/api/orca/fixture-sends', (c) =>
    deps.orca.fake ? c.json(deps.orca.fake.sends.map((s) => ({ handle: s.handle, text: s.text }))) : c.json({ error: 'Not found' }, 404),
  );

  mutating.post('/orca/send', async (c) => {
    const parsed = sendBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const text = prepareSend(parsed.data.text);
    if (text === undefined) return c.json({ error: 'The message is empty or over 600 characters' }, 400);
    const res = await sendToSession(deps.orca, deps.sessions, parsed.data.sessionId, text, {
      ...(parsed.data.requestId ? { retryRequestId: parsed.data.requestId } : {}),
      confirmMs: CONFIRM_MS,
      pending,
    });
    return c.json(res);
  });

  mutating.post('/orca/confirm', async (c) => {
    const parsed = confirmBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const { sessionId, requestId } = parsed.data;
    const res = await checkAgain(deps.orca, deps.sessions, pending, sessionId, requestId, RECHECK_MS);
    return res ? c.json(res) : c.json({ error: 'That send is too old to check. Open the session in Orca.' }, 404);
  });

  mutating.post('/orca/choose', async (c) => {
    const parsed = chooseBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const { prId, sessionId } = parsed.data;
    if (sessionId === null) {
      deps.prefs.choose(prId, null);
      return c.json({ ok: true });
    }
    const live = (await deps.sessions.snapshot()).sessions.find((s) => s.id === sessionId && s.live);
    if (!live) return c.json({ error: 'That session is not running' }, 404);
    deps.prefs.choose(prId, { worktreeId: live.worktreeId, sessionId: live.id });
    return c.json({ ok: true });
  });

  mutating.post('/orca/prefs', async (c) => {
    const parsed = prefsPatchBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const next = deps.prefs.patch(parsed.data);
    return c.json({ enabled: next.enabled, repos: next.repos });
  });

  mutating.post('/orca/open', async (c) => {
    const parsed = openBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Bad request' }, 400);
    const ok = await openInOrca(deps.orca, deps.sessions, parsed.data.sessionId);
    return ok ? c.json({ ok }) : c.json({ error: 'Could not open that session in Orca' }, 502);
  });
}
