import { matchWorktrees, type MatchTarget, type MatchedWorktree } from '../shared/orca-match';
import type { ChosenSession } from '../shared/orca-prefs';
import type { DispatchBody, DispatchResult } from './orca-dispatch';
import type { Orca } from './orca';
import type { OrcaPrefsStore } from './orca-prefs';
import type { OrcaSessions, SessionSnapshot } from './orca-sessions';
import type { Provider } from './provider';

/** Where a PR dispatch goes: a new worktree, an idle one that already has the PR's work, or nowhere yet. */
export type ReusePlan =
  | { kind: 'new' }
  | { kind: 'reuse'; target: MatchedWorktree }
  | { kind: 'busy'; message: string };

const NEW_ANYWAY = 'choose New worktree anyway to start a separate one.';

/**
 * Decides whether a PR dispatch reuses an existing worktree, on any host. An idle match is reused.
 * A match with a live agent, or a remembered worktree on an offline host, stops the dispatch, so a
 * second worktree for the same PR only ever comes from an explicit choice.
 */
export function planReuse(
  pr: MatchTarget,
  snap: Pick<SessionSnapshot, 'worktrees' | 'hosts'>,
  chosen?: ChosenSession,
): ReusePlan {
  const [first] = matchWorktrees(pr, snap.worktrees, chosen);
  if (first?.worktree.live) {
    const { name, host } = first.worktree;
    return { kind: 'busy', message: `${name} on ${host} already has a live agent for this PR. Send to that session, or ${NEW_ANYWAY}` };
  }
  if (first) return { kind: 'reuse', target: first };
  if (chosen && snap.hosts.some((h) => h.name === chosen.host && !h.online)) {
    return { kind: 'busy', message: `This PR's worktree is on ${chosen.host}, which is offline. Wait for it, or ${NEW_ANYWAY}` };
  }
  return { kind: 'new' };
}

export interface ReuseDeps {
  orca: Orca;
  sessions: OrcaSessions;
  prefs: OrcaPrefsStore;
  provider: Provider;
}

export type PrDispatchResult =
  | ({ ok: true; host: string; reused?: true } & Omit<Extract<DispatchResult, { ok: true }>, 'ok'>)
  | { ok: false; message: string; status: 409 | 502 };

/**
 * Dispatches `req` on `host`, or into the PR's existing worktree when one is found, and remembers
 * the worktree for the PR so the next Fix finds it after this agent exits. Only a PR-mode request
 * looks for one, and `newWorktree` skips the search.
 */
export async function dispatchWithReuse(deps: ReuseDeps, req: DispatchBody, host: string): Promise<PrDispatchResult> {
  const pr = req.pr ? await findPr(deps.provider, req.repo, req.number) : undefined;
  const chosen = pr ? deps.prefs.get().chosen[pr.id] : undefined;
  const plan: ReusePlan =
    pr && !req.newWorktree
      ? planReuse({ repo: pr.repo, number: pr.number, headRef: req.baseBranch, closes: pr.closes }, await deps.sessions.fresh(), chosen)
      : { kind: 'new' };
  if (plan.kind === 'busy') return { ok: false, message: plan.message, status: 409 };
  const target = plan.kind === 'reuse' ? plan.target.worktree : undefined;
  const at = target?.host ?? host;
  const res = target ? await deps.orca.launch(req, at, target.worktreeId, target.name) : await deps.orca.dispatch(req, at);
  if (!res.ok) return { ...res, status: 502 };
  if (pr && res.worktreeId) deps.prefs.choose(pr.id, { host: at, worktreeId: res.worktreeId });
  return { ...res, host: at, ...(target ? { reused: true as const } : {}) };
}

async function findPr(provider: Provider, repo: string, number: number) {
  const { prs } = await provider.inbox(undefined, 'none');
  const want = repo.toLowerCase();
  return prs.find((p) => p.number === number && p.repo.toLowerCase() === want);
}
