import type { IssueComment } from './issue-types';
import type { Minimized } from './minimized';
import { DEFAULT_SETTINGS, isReleaseTitle, type Settings } from './settings';

export type CiState = 'pass' | 'fail' | 'running' | 'none';
export type SeenState = 'new' | 'updated' | 'seen';
export type SectionKey = 'needs' | 'mine' | 'org' | 'dependabot';

export interface PrSummary {
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  headSha: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  commitCount: number;
  ci: CiState;
  reviewStatus: string;
  seen: SeenState;
  /** Set when seen is "updated", e.g. "2 commits since you looked". */
  updatedNote?: string;
  url: string;
  isDraft?: boolean;
  /** GitHub reports auto-merge enabled on this PR. */
  autoMerge?: boolean;
  /** Logins and team slugs with a pending review request. */
  requested?: string[];
  /** Assignee logins. Absent when there are none, and on rows cached before the field existed. */
  assignees?: string[];
  /** More reviewers were requested than `requested` lists, so the viewer may be among them. */
  requestsTruncated?: boolean;
  /** GitHub says the PR conflicts with its base. Absent or false while GitHub is still computing. */
  conflicting?: boolean;
  /** The PR head branch. Matches Orca sessions by branch. Absent on rows cached before the field existed. */
  headRef?: string;
  /**
   * Issue numbers in the same repo that the PR closes. Feeds the possible matches of an Orca session.
   * GitHub's list query does not return them, so only fixtures set it.
   */
  closes?: number[];
}

export interface Section {
  key: SectionKey;
  title: string;
  count: number;
  prs: PrSummary[];
}

export interface RateInfo {
  /** Points the last GraphQL query cost. */
  cost?: number;
  limit: number;
  remaining: number;
  resetAt: string;
}

export type StaleKind = 'error' | 'ratelimit';

export interface Stale {
  kind: StaleKind;
  /** Local HH:MM of the cached response. */
  cachedAt: string;
  message: string;
  resetAt?: string;
}

export interface SyncProgress {
  done: number;
  total: number;
}

/** What the server knows about a PR after an action, keyed by PR id in `InboxData.follows`. */
export type FollowKind = 'auto-merge' | 'merging' | 'merged' | 'approved';

export interface FollowState {
  state: FollowKind;
  /** ISO time the state was set. */
  at: string;
  /** The PR's last summary, kept on `merged` so the row can stay after the PR leaves the open list. */
  pr?: PrSummary;
}

export interface InboxData {
  viewer: string;
  /** Slugs of the viewer's teams, matched against team review requests. */
  teams?: string[];
  /** Every open PR. The front end derives the sections. */
  prs: PrSummary[];
  syncedAt: number;
  rate?: RateInfo;
  stale?: Stale;
  syncing?: SyncProgress;
  /** Followed PRs by id. */
  follows: Record<string, FollowState>;
  /** The viewer's PRs that recently merged or closed, newest first. */
  shipped?: ShippedPr[];
}

/** A PR the viewer authored or is assigned to that left the open list. */
export interface ShippedPr {
  id: string;
  repo: string;
  number: number;
  title: string;
  merged: boolean;
  /** When it closed, ms. */
  at: number;
}

export interface CheckItem {
  name: string;
  status: 'pass' | 'fail' | 'running' | 'queued' | 'cancelled' | 'skipped';
  /** Final duration of a finished check; empty while it runs. */
  duration: string;
  /** ISO start time, present once the check began. Drives the live timer. */
  startedAt?: string;
  /** Actions run, CodeQL or status target page from the API. */
  url?: string;
}

export interface CommitItem {
  sha: string;
  message: string;
  isNew: boolean;
  lastReviewed: boolean;
  /** Commit page from the API. */
  url?: string;
}

export interface FileItem {
  path: string;
  additions: number;
  deletions: number;
  viewed: boolean;
  changedSinceReview: boolean;
}

export type ReviewVerdict = 'changes' | 'approved' | 'commented';

/** One entry of a PR's conversation, oldest first. Comments reuse the issue comment shape. */
export type PrThreadItem =
  | { kind: 'comment'; at: string; comment: IssueComment }
  | {
      kind: 'review';
      at: string;
      id: string;
      actor: string;
      verdict: ReviewVerdict;
      url?: string;
      /** GitHub-rendered HTML. Sanitize before inserting. Empty when the review has no text. */
      bodyHtml: string;
      minimized?: Minimized;
    }
  | {
      kind: 'thread';
      at: string;
      id: string;
      /** GraphQL node id of the review thread, for reply and resolve. Absent in older cached details. */
      threadId?: string;
      path: string;
      line?: number;
      /** Diff side of the line (GitHub `diffSide`). Absent in older cached details. */
      side?: DiffSide;
      /** First line of a multi-line range, when the thread covers one. */
      startLine?: number;
      startSide?: DiffSide;
      resolved: boolean;
      /** The line the comment sits on has changed since. Absent in older cached details. */
      isOutdated?: boolean;
      /** The root comment belongs to a review the viewer has not submitted: the viewer's draft. */
      pending?: boolean;
      comments: IssueComment[];
    };

export type DiffSide = 'LEFT' | 'RIGHT';

/** The viewer's pending (draft) review on a PR. Absent when there is none. */
export interface PendingReview {
  /** GraphQL node id of the pending review. */
  id: string;
  /** Draft comments in it. */
  drafts: number;
}

export interface PrDetail {
  summary: PrSummary;
  body: string;
  /** GitHub's rendered description. Sanitize before it reaches the page. Absent in older cached details. */
  bodyHtml?: string;
  baseRef: string;
  headRef: string;
  /** The PR head lives on a fork, where an Orca worktree cannot push. Absent in older cached details. */
  headIsFork?: boolean;
  /** False for a closed or merged PR. Absent in older cached details, which count as open. */
  isOpen?: boolean;
  checks: CheckItem[];
  reviewLine: string;
  lastReviewedSha?: string;
  commits: CommitItem[];
  commitTotal: number;
  newCommits: number;
  files: FileItem[];
  /** True when the last reviewed commit no longer exists (force push). */
  reviewBaseGone: boolean;
  /** Method text for auto-merge, derived from the title. */
  mergeMethod: MergeMethod;
  /** GitHub says the viewer may merge past required reviews. Absent in older cached details. */
  viewerCanMergeAsAdmin?: boolean;
  /** Logins on the head commit's author and committer. Lets the latest pusher admin merge. Absent in older cached details. */
  headCommitLogins?: string[];
  mergeStateStatus?: string;
  /** GitHub `mergeable`: MERGEABLE, CONFLICTING or UNKNOWN. Absent in older cached details. */
  mergeable?: string;
  /** Requested reviewers who have not reviewed yet. Absent in older cached details. */
  pendingReviews?: number;
  /** Reviewers whose latest review is APPROVED. Absent in older cached details. */
  approvals?: number;
  /** The PR merged, as opposed to closed unmerged. Absent in older cached details. */
  merged?: boolean;
  /** When a merged or closed PR closed. Absent while open and in older cached details. */
  closedAt?: string;
  /** Login that merged the PR. Absent unless merged, and in older cached details. */
  mergedBy?: string;
  /** Reviewers whose latest review is CHANGES_REQUESTED. Absent in older cached details. */
  changeRequests?: number;
  /** More than the 50 checks shown exist. Readiness uses GitHub's rollup, not this list. */
  checksTruncated?: boolean;
  /** More than the 100 files shown exist. */
  filesTruncated?: boolean;
  reviewDecision?: string;
  /** Conversation, reviews and review threads, oldest first. Absent in older cached details. */
  thread?: PrThreadItem[];
  /** The viewer's pending review and its draft count. Absent when there is none and in older cached details. */
  pendingReview?: PendingReview;
  rate?: RateInfo;
  stale?: Stale;
}

export type MergeMethod = 'merge' | 'squash';

export type LineKind = 'add' | 'del' | 'ctx';

export interface DiffLine {
  kind: LineKind;
  oldNo?: number;
  newNo?: number;
  text: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: Hunk[];
  /** Patch missing (binary or too large). */
  noPatch?: boolean;
}

export type DiffMode = 'all' | 'since';

export interface DiffData {
  mode: DiffMode;
  /** Range label, "a1b2c3d..e4f5g6h". Empty when no review exists. */
  range: string;
  baseGone: boolean;
  files: DiffFile[];
  commitsInRange: number;
}

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Set by the server when an Orca notification is running. `GET /api/orca/notice/:id` reads its result. */
  noticeId?: string;
}

/**
 * The release PR gets a merge commit. The title alone is not enough, since its author
 * controls it; the branches must match the settings' release rule too.
 */
export function mergeMethodFor(
  title: string,
  base: string,
  head: string,
  settings: Settings = DEFAULT_SETTINGS,
): MergeMethod {
  return isReleaseTitle(settings, title, base, head) ? 'merge' : 'squash';
}

export function mergeMethodLabel(m: MergeMethod): string {
  return m === 'merge' ? 'merge commit' : 'squash + delete branch';
}
