import { DEFAULT_SETTINGS, type Settings } from './settings';
import {
  mergeMethodFor,
  type AnyMergeMethod,
  type CiState,
  type MergeAllowed,
  type MergeMethod,
  type PrDetail,
} from './types';

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
  /** Merge (bypass) shows. Admin merge is then hidden. */
  bypass: boolean;
}

/** GitHub logins compare without case. An empty login matches nothing. */
export function sameLogin(a: string, b: string): boolean {
  return b !== '' && a.toLowerCase() === b.toLowerCase();
}

export function isOwnPr(author: string, viewer: string): boolean {
  return sameLogin(author, viewer);
}

export interface AdminInput {
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

/** What Merge (bypass) reads beyond the Admin merge fields. */
export interface BypassFields {
  state: string;
  mergeable?: string;
  mergeStateStatus?: string;
  reviewDecision?: string;
  unresolvedThreads: number;
  /** Every review thread was fetched (at most 50), so `unresolvedThreads` is the whole count. */
  threadsComplete: boolean;
  rulesetBypass: boolean;
}

export type BypassInput = AdminInput & BypassFields;

/** GitHub's review-thread page size. More threads than this cannot be checked, so they hide the action. */
export const THREAD_LIMIT = 50;

/**
 * Why Merge (bypass) cannot run, as the first failing row, or undefined when it can.
 * The rows are in the order the spec lists them, so the server names the same reason each time.
 */
export function bypassRefusal(d: BypassInput): string | undefined {
  if (!isOwnPr(d.author, d.viewer)) return 'only the PR author can merge without review';
  if (d.state !== 'OPEN') return 'the PR is not open';
  if (d.isDraft === true) return 'the PR is a draft';
  if (d.mergeable !== 'MERGEABLE') return 'GitHub does not report the PR as mergeable';
  if (d.mergeStateStatus !== 'BLOCKED') return `the merge state is ${d.mergeStateStatus ?? 'unknown'}, not blocked by review`;
  if (d.ci !== 'pass') return 'every check must pass first';
  if (d.reviewDecision !== 'REVIEW_REQUIRED') return 'the PR does not wait on a required review';
  if (!d.threadsComplete) return `the PR has more than ${THREAD_LIMIT} review threads`;
  if (d.unresolvedThreads > 0) return 'every review thread must be resolved first';
  if (!d.rulesetBypass) return 'no ruleset lets you skip the review';
  return undefined;
}

export function canBypassMerge(d: BypassInput): boolean {
  return bypassRefusal(d) === undefined;
}

/** The bypass fields a PR detail carries. Older cached details lack them and read as no bypass. */
export function bypassFields(d: PrDetail): BypassFields {
  const total = d.reviewThreadTotal;
  return {
    state: d.isOpen === false ? (d.merged ? 'MERGED' : 'CLOSED') : 'OPEN',
    mergeable: d.mergeable,
    mergeStateStatus: d.mergeStateStatus,
    reviewDecision: d.reviewDecision,
    unresolvedThreads: d.unresolvedThreads ?? 0,
    threadsComplete: total !== undefined && total <= THREAD_LIMIT,
    rulesetBypass: d.rulesetBypass === true,
  };
}

export function reviewAccess(d: AdminInput & Partial<BypassFields>): ReviewAccess {
  const bypass = canBypassMerge({
    ...d,
    state: d.state ?? '',
    unresolvedThreads: d.unresolvedThreads ?? 0,
    threadsComplete: d.threadsComplete === true,
    rulesetBypass: d.rulesetBypass === true,
  });
  return {
    ownPr: isOwnPr(d.author, d.viewer),
    admin: bypass ? 'hidden' : adminMergeState(d),
    draft: d.isDraft === true,
    bypass,
  };
}

export const NO_ACCESS: ReviewAccess = { ownPr: false, admin: 'hidden', draft: false, bypass: false };

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

const ALL_ALLOWED: MergeAllowed = { squash: true, merge: true, rebase: true };

const METHOD_ORDER: Record<MergeMethod, readonly AnyMergeMethod[]> = {
  squash: ['squash', 'merge', 'rebase'],
  merge: ['merge', 'squash', 'rebase'],
};

const METHOD_FLAGS: Record<AnyMergeMethod, readonly string[]> = {
  squash: ['--squash', '--delete-branch'],
  merge: ['--merge'],
  rebase: ['--rebase', '--delete-branch'],
};

export const NO_METHOD = 'no merge method is allowed on this repository';

/**
 * The first method the repository allows, starting from the preferred one.
 * Undefined `allowed` (an older cached detail) allows every method.
 */
export function bypassMethodFor(preferred: MergeMethod, allowed: MergeAllowed | undefined): AnyMergeMethod | undefined {
  const ok = allowed ?? ALL_ALLOWED;
  return METHOD_ORDER[preferred].find((m) => ok[m]);
}

/** `gh pr merge` flags for Merge (bypass), or undefined when the repository allows no method. */
export function bypassMergeFlags(
  r: MergeRefs,
  allowed: MergeAllowed | undefined,
  settings: Settings = DEFAULT_SETTINGS,
): string[] | undefined {
  const method = bypassMethodFor(mergeMethodFor(r.title, r.base, r.head, settings), allowed);
  return method ? methodFlags(method) : undefined;
}

export const methodFlags = (m: AnyMergeMethod): string[] => [...METHOD_FLAGS[m]];

export function bypassMergeArgs(repoFull: string, number: number, flags: readonly string[]): string[] {
  return ['pr', 'merge', '--admin', '--repo', repoFull, String(number), ...flags];
}

/** Squash and rebase delete the head; a merge commit does so only when the repository says to. */
export function deletesBranch(method: AnyMergeMethod, deleteBranchOnMerge: boolean | undefined): boolean {
  return method !== 'merge' || deleteBranchOnMerge === true;
}

export const BYPASS_LABEL = 'Merge (bypass)';

export const BYPASS_NOTE = "Your PR: you can't approve it, but you may skip review";

export const bypassBusyNote = (n: number): string => `Merging #${n} without review…`;

const METHOD_SENTENCE: Record<AnyMergeMethod, string> = {
  squash: 'Squash and merge.',
  merge: 'Merge commit.',
  rebase: 'Rebase and merge.',
};

export const bypassTooltip = (m: AnyMergeMethod): string => `Skips the required review. ${METHOD_SENTENCE[m]}`;

export const bypassDoneMessage = (n: number, deleted: boolean): string =>
  `Merged #${n} without review.${deleted ? ' Branch deleted.' : ''}`;

export interface BypassStrip {
  title: string;
  lines: [string, string, string];
}

/** The confirm strip's title and three lines, read from the PR detail. */
export function bypassStrip(d: PrDetail): BypassStrip {
  const method = bypassMethodFor(d.mergeMethod, d.mergeAllowed) ?? 'squash';
  const head = d.headRef;
  const branch =
    method === 'merge'
      ? d.deleteBranchOnMerge
        ? `Merge commit, then delete ${head}.`
        : `Merge commit, keeps ${head}.`
      : `${method === 'squash' ? 'Squash' : 'Rebase'} and merge, then delete ${head}.`;
  const passed = d.checks.filter((c) => c.status === 'pass' || c.status === 'skipped').length;
  const threads = d.reviewThreadTotal ?? 0;
  const resolved = threads - (d.unresolvedThreads ?? 0);
  return {
    title: `Merge #${d.summary.number} without review?`,
    lines: [
      `Skips the required review (${d.approvals ?? 0} of ${Math.max(d.requiredApprovals ?? 1, 1)} approvals).`,
      branch,
      `${passed} of ${d.checks.length} checks passed · ${resolved} of ${threads} threads resolved`,
    ],
  };
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
