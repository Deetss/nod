import { DEFAULT_SETTINGS, type Settings } from './settings';
import { mergeMethodFor, type CiState, type MergeMethod } from './types';

export const OWN_PR_HINT = 'Your PR: GitHub only allows comments';

export const DRAFT_HINT = 'Draft: mark ready first';

export const AUTO_MERGE_ON = 'Auto-merge is on';

/**
 * `waiting` shows the button disabled as "waiting for checks"; `draft` shows it disabled
 * until the PR is marked ready; `hidden` shows nothing.
 */
export type AdminMergeState = 'hidden' | 'waiting' | 'draft' | 'ready';

export interface ReviewAccess {
  /** The viewer opened the PR. GitHub refuses their approvals and change requests. */
  ownPr: boolean;
  admin: AdminMergeState;
  /** The PR is a draft, so GitHub refuses to merge it. */
  draft: boolean;
}

/** GitHub logins compare without case. An empty login matches nothing. */
export function sameLogin(a: string, b: string): boolean {
  return b !== '' && a.toLowerCase() === b.toLowerCase();
}

export function isOwnPr(author: string, viewer: string): boolean {
  return sameLogin(author, viewer);
}

interface AdminInput {
  author: string;
  viewer: string;
  viewerCanMergeAsAdmin?: boolean;
  /** GitHub's rollup of every check on the head commit. */
  ci: CiState;
  isDraft?: boolean;
  /** GitHub logins on the head commit's author and committer. Empty when unknown. */
  headCommitLogins?: string[];
}

/**
 * Admin merge is for a viewer who can admin merge and either opened the PR or pushed its head
 * commit (GitHub then does not count their approval). It enables once the PR is ready and every check passed.
 */
export function adminMergeState(d: AdminInput): AdminMergeState {
  const pushed = (d.headCommitLogins ?? []).some((l) => sameLogin(l, d.viewer));
  if (!(isOwnPr(d.author, d.viewer) || pushed) || d.viewerCanMergeAsAdmin !== true) return 'hidden';
  if (d.isDraft === true) return 'draft';
  return d.ci === 'pass' ? 'ready' : 'waiting';
}

export function reviewAccess(d: AdminInput): ReviewAccess {
  return { ownPr: isOwnPr(d.author, d.viewer), admin: adminMergeState(d), draft: d.isDraft === true };
}

export const NO_ACCESS: ReviewAccess = { ownPr: false, admin: 'hidden', draft: false };

/** The refs and title that pick the merge method. */
export interface MergeRefs {
  title: string;
  base: string;
  head: string;
}

/** Flags that follow `gh pr merge`; the method comes from the title and branches. */
export function mergeFlags(r: MergeRefs, settings: Settings = DEFAULT_SETTINGS): string[] {
  const method: MergeMethod = mergeMethodFor(r.title, r.base, r.head, settings);
  return method === 'merge' ? ['--merge'] : ['--squash', '--delete-branch'];
}

export function adminMergeArgs(
  repoFull: string,
  number: number,
  r: MergeRefs,
  settings: Settings = DEFAULT_SETTINGS,
): string[] {
  return ['pr', 'merge', '--admin', '--repo', repoFull, String(number), ...mergeFlags(r, settings)];
}

const MAX_ERROR = 200;

/**
 * Reads GitHub's own text out of an error body: `errors[].message` (or plain string
 * entries) when present, else `message`. Never touches headers or the token.
 */
export function githubErrorText(status: number, raw: string): string {
  let detail = '';
  try {
    const body: unknown = JSON.parse(raw);
    if (body && typeof body === 'object') {
      const { message, errors } = body as { message?: unknown; errors?: unknown };
      const inner = Array.isArray(errors)
        ? errors
            .map((e) =>
              typeof e === 'string' ? e : e && typeof e === 'object' ? (e as { message?: unknown }).message : undefined,
            )
            .filter((m): m is string => typeof m === 'string' && m !== '')
        : [];
      detail = inner.length > 0 ? inner.join('; ') : typeof message === 'string' ? message : '';
    }
  } catch {
    // not JSON; fall back to the status
  }
  const text = detail === '' ? `GitHub API error ${status}` : `${status}: ${detail}`;
  return text.length > MAX_ERROR ? `${text.slice(0, MAX_ERROR - 3)}...` : text;
}

/** The 422 body GitHub sends when an author approves their own PR. */
export const OWN_APPROVAL_422 = JSON.stringify({
  message: 'Unprocessable Entity',
  errors: [{ message: 'Can not approve your own pull request' }],
});
