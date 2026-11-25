import { repoName } from './repo-name';
import type { MatchVia, SessionCandidate, WorktreeCandidate } from './orca-sessions';

export interface MatchTarget {
  repo: string;
  number: number;
  /** The PR head ref. Absent on rows cached before the field existed. */
  headRef?: string;
  /** Issue numbers in the same repo that the PR closes. */
  closes?: readonly number[];
}

export interface Matched {
  session: SessionCandidate;
  via: MatchVia;
  reason: string;
}

export interface MatchResult {
  related: Matched[];
  possible: Matched[];
}

const lower = (s: string): string => s.toLowerCase();

/** Orca knows repos by bare name, so a full `owner/name` is compared on its name. */
const nameOf = (repo: string): string => lower(repoName(repo));

const inName = (branch: string, n: number): boolean => new RegExp(`(?<![0-9])${n}(?![0-9])`).test(branch);

/** The link fields sessions and worktrees share. */
type Linked = Pick<SessionCandidate, 'repo' | 'branch' | 'linkedPrs' | 'linkedIssues'>;

const sameRepo = (item: { repo?: string }, session: Linked, repo: string): boolean => {
  const r = item.repo ?? session.repo;
  return r !== undefined && lower(r) === nameOf(repo);
};

/** A direct link: the worktree names this PR, or its branch is the PR head, in the same repo. */
function directLink(pr: MatchTarget, s: Linked): Pick<Matched, 'via' | 'reason'> | undefined {
  if (s.linkedPrs.some((l) => l.number === pr.number && sameRepo(l, s, pr.repo))) {
    return { via: 'pr', reason: `linked PR #${pr.number}` };
  }
  if (s.branch !== '' && pr.headRef && s.branch === pr.headRef && s.repo !== undefined && lower(s.repo) === nameOf(pr.repo)) {
    return { via: 'branch', reason: `branch ${s.branch}` };
  }
  return undefined;
}

function relatedVia(pr: MatchTarget, s: SessionCandidate): Matched | undefined {
  const link = directLink(pr, s);
  return link ? { session: s, ...link } : undefined;
}

/** A weaker hint: a linked issue the PR closes, or the PR number inside the branch name. Never notified. */
function possibleVia(pr: MatchTarget, s: SessionCandidate): Matched | undefined {
  const closes = pr.closes ?? [];
  const issue = s.linkedIssues.find((l) => closes.includes(l.number) && sameRepo(l, s, pr.repo));
  if (issue) return { session: s, via: 'issue', reason: `linked issue #${issue.number}` };
  if (s.branch !== '' && s.repo !== undefined && lower(s.repo) === nameOf(pr.repo) && inName(s.branch, pr.number)) {
    return { session: s, via: 'number', reason: `#${pr.number} in branch ${s.branch}` };
  }
  return undefined;
}

const byRecent = (a: Matched, b: Matched): number => (b.session.lastOutputAt ?? 0) - (a.session.lastOutputAt ?? 0);

/**
 * Sorts live sessions into related and possible for one PR. A remembered choice wins when that
 * session (or another live agent in its worktree) is still live: it is returned alone as related.
 */
export function matchSessions(
  pr: MatchTarget,
  sessions: readonly SessionCandidate[],
  chosen?: { host?: string; sessionId?: string; worktreeId: string },
): MatchResult {
  const live = sessions.filter((s) => s.live);
  if (chosen) {
    const onHost = live.filter((s) => chosen.host === undefined || s.host === chosen.host);
    const pick = onHost.find((s) => s.id === chosen.sessionId) ?? onHost.find((s) => s.worktreeId === chosen.worktreeId);
    if (pick) return { related: [{ session: pick, via: 'chosen', reason: 'chosen by you' }], possible: [] };
  }
  const related: Matched[] = [];
  const possible: Matched[] = [];
  for (const s of live) {
    const r = relatedVia(pr, s);
    if (r) {
      related.push(r);
      continue;
    }
    const p = possibleVia(pr, s);
    if (p) possible.push(p);
  }
  return { related: related.sort(byRecent), possible: possible.sort(byRecent) };
}

/** Sessions linked directly to an issue in one repo. Used for issue close and reopen events. */
export function relatedToIssue(repo: string, number: number, sessions: readonly SessionCandidate[]): Matched[] {
  return sessions
    .filter((s) => s.live && s.linkedIssues.some((l) => l.number === number && sameRepo(l, s, repo)))
    .map((s) => ({ session: s, via: 'issue' as const, reason: `linked issue #${number}` }))
    .sort(byRecent);
}

export interface MatchedWorktree {
  worktree: WorktreeCandidate;
  via: MatchVia;
  reason: string;
}

/** The remembered worktree for a PR, on its own host. */
export interface ChosenRef {
  host?: string;
  worktreeId: string;
}

const isChosen = (w: WorktreeCandidate, chosen: ChosenRef | undefined): boolean =>
  chosen !== undefined && w.worktreeId === chosen.worktreeId && (chosen.host === undefined || w.host === chosen.host);

/**
 * Worktrees already doing a PR's work on any host, with or without a live agent. The remembered
 * worktree comes first, then direct links, most recent first. Possible matches never count, so a
 * new worktree is only skipped for a sure link.
 */
export function matchWorktrees(
  pr: MatchTarget,
  worktrees: readonly WorktreeCandidate[],
  chosen?: ChosenRef,
): MatchedWorktree[] {
  const out: MatchedWorktree[] = [];
  for (const w of worktrees) {
    if (isChosen(w, chosen)) {
      out.push({ worktree: w, via: 'chosen', reason: 'chosen before' });
      continue;
    }
    const link = directLink(pr, w);
    if (link) out.push({ worktree: w, ...link });
  }
  const rank = (m: MatchedWorktree): number => (m.via === 'chosen' ? 1 : 0);
  return out.sort((a, b) => rank(b) - rank(a) || (b.worktree.lastOutputAt ?? 0) - (a.worktree.lastOutputAt ?? 0));
}
