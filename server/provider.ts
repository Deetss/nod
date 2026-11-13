import type { ClosedIssue, ClosedKind, ClosedPage, ClosedPr, ClosedWindow } from '../shared/closed';
import type { FetchedImage, ImageTarget } from '../shared/image-url';
import type { UploadResult, UploadType } from '../shared/image-upload';
import type { NumberHit } from '../shared/number-query';
import type { MentionablePage } from '../shared/mentions';
import type {
  IssueAction,
  IssueActionResult,
  IssueDetail,
  IssueInboxData,
  RepoMeta,
} from '../shared/issue-types';
import type {
  ActionResult,
  DiffData,
  DiffMode,
  DiffSide,
  InboxData,
  PrDetail,
  RateInfo,
  ReviewEvent,
} from '../shared/types';

export interface PrRef {
  repo: string;
  number: number;
}

export interface SeenMark {
  id: string;
  updatedAt: string;
  headSha: string;
  commitCount: number;
}

/** What the viewer last saw of an issue. */
export interface IssueSeenMark {
  id: string;
  updatedAt: string;
  commentCount: number;
}

/** `none` serves the saved list, `delta` fetches changes only, `full` sweeps every open PR. */
export type SyncMode = 'none' | 'delta' | 'full';

/** When each saved list last synced, ms. Clients refetch the lists when it moves. */
export interface SyncEvent {
  prs: number;
  issues: number;
  /** True from the moment a sync starts until it ends. Absent otherwise. */
  syncing?: true;
}

export interface PollResult {
  changed: boolean;
}

/** Everything the HTTP layer needs. Real and fixture modes both implement it. */
export interface Provider {
  readonly fixtures: boolean;
  /** The saved list. Only the very first call, with nothing saved, waits on GitHub. */
  inbox(query: StateQuery, sync?: SyncMode): Promise<InboxData>;
  /**
   * One server-side sync. `delta` becomes a full sweep when the last one is an hour old.
   * `changed` is true when the saved PR, issue or mention lists differ after the sync.
   */
  poll(mode: Exclude<SyncMode, 'none'>): Promise<PollResult>;
  /** The latest GitHub API budget reading, or undefined before the first one. */
  budget(): RateInfo | undefined;
  /** Full sweep now, for the Refresh button. */
  refresh(): Promise<void>;
  /** Calls `fn` after each sync attempt. Returns the unsubscribe function. */
  subscribe(fn: (e: SyncEvent) => void): () => void;
  syncState(): SyncEvent;
  detail(ref: PrRef, query: StateQuery): Promise<PrDetail>;
  diff(ref: PrRef, mode: DiffMode, query: StateQuery): Promise<DiffData>;
  setViewed(prId: string, path: string, viewed: boolean): Promise<ActionResult>;
  review(ref: PrRef, event: ReviewEvent, body: string, query?: StateQuery): Promise<ActionResult>;
  /** Creates one line or file comment now. REST `POST /pulls/{n}/comments`. */
  addReviewComment(args: InlineCommentArgs): Promise<ActionResult>;
  /** Adds a line or file comment to the viewer's pending review, creating that review if none exists. */
  addDraftComment(args: InlineCommentArgs): Promise<ActionResult>;
  /** Replies to a review thread now. GraphQL `addPullRequestReviewThreadReply`. */
  replyToThread(args: { repo: string; number: number; threadId: string; body: string }): Promise<ActionResult>;
  resolveThread(args: { repo: string; number: number; threadId: string }): Promise<ActionResult>;
  unresolveThread(args: { repo: string; number: number; threadId: string }): Promise<ActionResult>;
  /** Changes the body of one of the viewer's draft comments. GraphQL `updatePullRequestReviewComment`. */
  editDraftComment(args: { repo: string; number: number; commentId: string; body: string }): Promise<ActionResult>;
  /** Removes one draft comment. GraphQL `deletePullRequestReviewComment`. */
  deleteDraftComment(args: { repo: string; number: number; commentId: string }): Promise<ActionResult>;
  /** Deletes the viewer's whole pending review and every draft in it. GraphQL `deletePullRequestReview`. */
  discardPendingReview(ref: PrRef): Promise<ActionResult>;
  /** Posts a conversation comment on the PR, the kind an `issue_comment` workflow sees. */
  comment(ref: PrRef, body: string): Promise<ActionResult>;
  merge(ref: PrRef): Promise<ActionResult>;
  /** `gh pr merge --admin`. The HTTP layer has already checked the typed PR number. */
  adminMerge(ref: PrRef): Promise<ActionResult>;
  /** GraphQL `markPullRequestReadyForReview`: takes a draft PR out of draft. */
  markReady(ref: PrRef): Promise<ActionResult>;
  /** Re-runs a workflow run's failed jobs (`failed`) or all of its jobs (`all`). `repo` is a bare name in the org. */
  rerun(args: { repo: string; number: number; runId: number; mode: RerunMode }): Promise<ActionResult>;
  /** GitHub's sanitised GFM preview of `text`, rendered in the context of `repo`. REST `POST /markdown`. */
  renderMarkdown(args: { repo: string; text: string }): Promise<{ html: string }>;
  markSeen(mark: SeenMark): Promise<void>;
  /** Saved issue list, from the sync the last `inbox` call ran. Never makes a request. */
  issues(query: StateQuery): Promise<IssueInboxData>;
  issueDetail(ref: PrRef, query: StateQuery): Promise<IssueDetail>;
  repoMeta(repo: string, query: StateQuery): Promise<RepoMeta>;
  /** One page of users who can be mentioned in `repo`. `cursor` continues from the last page. */
  mentionable(repo: string, cursor: string | undefined, query: StateQuery): Promise<MentionablePage>;
  /** Issue or PR `number` in each of `repos`, one GitHub call per repo. Repos the lists lack are skipped. */
  lookup(number: number, repos: readonly string[], query: StateQuery): Promise<NumberHit[]>;
  /** Bytes of an image the allowlist already approved. Fixture mode never touches the network. */
  image(target: ImageTarget): Promise<FetchedImage>;
  /** Uploads a comment image to GitHub against an org repo and returns its asset URL. */
  uploadImage(repo: string, name: string, contentType: UploadType, bytes: Uint8Array): Promise<UploadResult>;
  issueAction(action: IssueAction): Promise<IssueActionResult>;
  /**
   * One page of PRs or issues closed within `window` days, newest first. A separate search that
   * never runs on the poll loop and is kept nowhere. `after` is the previous page's cursor.
   */
  closed(
    kind: ClosedKind,
    window: ClosedWindow,
    after: string | undefined,
    query: StateQuery,
  ): Promise<ClosedPage<ClosedPr> | ClosedPage<ClosedIssue>>;
  markIssueSeen(mark: IssueSeenMark): Promise<void>;
}

/** Fixture-only `?state=` value; ignored by the real provider. */
export type StateQuery = string | undefined;

export type RerunMode = 'failed' | 'all';

/** One inline comment. Lines are numbers on the `side` of the diff; `startLine` makes a range. */
export interface InlineCommentArgs {
  repo: string;
  number: number;
  body: string;
  path: string;
  line: number;
  side: DiffSide;
  startLine?: number;
  startSide?: DiffSide;
  subjectType: 'line' | 'file';
}

/**
 * A full owner/name. Rejects a dot or dot-dot part in either position, which would reshape the
 * API path the repo is interpolated into.
 */
export const REPO_RE = /^(?!\.{1,2}\/)[A-Za-z0-9._-]{1,100}\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

export function parseRef(repo: string, number: string): PrRef | undefined {
  const n = Number(number);
  if (!REPO_RE.test(repo) || !Number.isInteger(n) || n < 1) return undefined;
  return { repo, number: n };
}
