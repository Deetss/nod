import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  IssueAction,
  IssueActionResult,
  IssueDetail,
  IssueInboxData,
  RepoMeta,
} from '../shared/issue-types';
import type { ClosedIssue, ClosedKind, ClosedPage, ClosedPr, ClosedWindow } from '../shared/closed';
import { fetchClosedPage } from './closed';
import { parsePatch } from '../shared/patch';
import { repoName, repoOwner } from '../shared/repo-name';
import { adminMergeArgs, adminMergeState, DRAFT_HINT, isOwnPr, mergeFlags, sameLogin } from '../shared/pr-actions';
import {
  mergeMethodFor,
  type ActionResult,
  type CommitItem,
  type DiffData,
  type DiffFile,
  type DiffMode,
  type FollowKind,
  type FollowState,
  type InboxData,
  type PrDetail,
  type PrSummary,
  type RateInfo,
  type ReviewEvent,
  type Stale,
} from '../shared/types';
import { assetId, type FetchedImage, type ImageTarget } from '../shared/image-url';
import { AttachmentImages } from './attachment-images';
import type { UploadResult, UploadType } from '../shared/image-upload';
import { ApiError, type GithubClient } from './github-client';
import type { NumberHit } from '../shared/number-query';
import { lookupNumber } from './number-lookup';
import {
  canAdminMerge,
  ciFromRollup,
  reviewSummary,
  reviewCounts,
  toCheck,
  toSummary,
  type RawContext,
  type RawPr,
} from './github-map';
import {
  applyDelta,
  applyFull,
  applyOne,
  EMPTY_STATE,
  expireClosed,
  prKey as keyOf,
  type InboxState,
} from './inbox-state';
import { IssueCache } from './issue-cache';
import { issueDeltaSearch, mentionDeltaSearch, pollQuery } from './issue-queries';
import { IssueService, type RawMention } from './issue-service';
import { ProjectConfig } from './project-config';
import type { Settings } from '../shared/settings';
import type { RawIssue } from './issue-map';
import { PrCache, type ReviewBase } from './pr-cache';
import { toPrThread, type RawPrThread } from './pr-thread';
import type {
  InlineCommentArgs,
  IssueSeenMark,
  PollResult,
  PrRef,
  Provider,
  RerunMode,
  SeenMark,
  StateQuery,
  SyncEvent,
  SyncMode,
} from './provider';
import {
  deltaSearch,
  ALL_COMMITS_QUERY,
  CHECKS_QUERY,
  DETAIL_QUERY,
  FOLLOW_QUERY,
  fullSearch,
  INBOX_QUERY,
  MERGE_STATE_QUERY,
  ownOpenSearch,
  PR_FIELDS,
  ADD_PENDING_REVIEW,
  ADD_REVIEW_THREAD,
  ADD_THREAD_REPLY,
  DELETE_PENDING_REVIEW,
  DELETE_REVIEW_COMMENT,
  MARK_READY,
  PENDING_REVIEW_QUERY,
  RESOLVE_THREAD,
  SET_VIEWED,
  SUBMIT_REVIEW,
  UNRESOLVE_THREAD,
  UPDATE_REVIEW_COMMENT,
  TEAMS_QUERY,
  UNSET_VIEWED,
} from './queries';
import { consoleSink, formatCall, type LogSink } from './request-log';
import type { MentionablePage } from '../shared/mentions';
import { mentionablePage, MENTIONABLE_QUERY, type MentionableResponse } from './mentionable';
import type { SeenStore } from './seen';

/** A delta search reaches back this far before the last sync, to catch clock skew. */
const DELTA_OVERLAP_MS = 60_000;

/** The full sweep guards against search-index lag; deltas catch everything else. */
export const FULL_SWEEP_MS = 60 * 60_000;

/** Teams and project ids almost never change. */
const META_MS = 60 * 60_000;

/** Wait this long after a rate limit that names no reset time. */
const DEFAULT_BACKOFF_MS = 60_000;

/** Follow-up checks after an action, in ms from the action. */
export const FOLLOW_STEPS_MS = [3_000, 10_000, 30_000, 60_000, 120_000];

/** After the steps, an open PR with auto-merge set is checked at this interval. */
export const FOLLOW_AUTO_MERGE_MS = 60_000;

/** No follow-up check runs later than this after the action. */
export const FOLLOW_WINDOW_MS = 30 * 60_000;

/** An `approved` follow state is dropped this long after the review. */
export const FOLLOW_APPROVED_MS = 6_000;

/** A `merged` follow state, with the PR's last summary, is kept this long. */
export const FOLLOW_MERGED_MS = 10_000;

/** Offset from the action of follow-up check `step`. */
function followAt(step: number): number {
  const last = FOLLOW_STEPS_MS.length - 1;
  if (step <= last) return FOLLOW_STEPS_MS[step] ?? 0;
  return (FOLLOW_STEPS_MS[last] ?? 0) + (step - last) * FOLLOW_AUTO_MERGE_MS;
}

const execFileAsync = promisify(execFile);

export type RunGh = (args: string[]) => Promise<string>;

export const runGh: RunGh = async (args) => {
  const { stdout } = await execFileAsync('gh', args, { timeout: 60_000 });
  return stdout;
};

interface InboxResponse {
  viewer: { login: string };
  rateLimit: RateInfo;
  search: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: (RawPr | Record<string, never>)[];
  };
}

interface PollPage<N> {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: (N | Record<string, never>)[];
}

interface PollResponse {
  viewer: { login: string; id?: string };
  prs: PollPage<RawPr>;
  /** Present only when the poll asked for it, see `watchOwn`. */
  own?: Pick<PollPage<RawPr>, 'nodes'>;
  issues: PollPage<RawIssue>;
  mentions: PollPage<RawMention>;
}

interface PendingReviewResponse {
  repository: {
    pullRequest: {
      id: string;
      headRefOid: string;
      reviews: { nodes: { id: string; comments: { totalCount: number } }[] };
    } | null;
  } | null;
}

/** The viewer's pending review for the detail payload, or nothing when there is none. */
function pendingReviewOf(raw: RawDetailPr['pendingReview'] | undefined): { pendingReview?: { id: string; drafts: number } } {
  const review = raw?.nodes[0];
  return review ? { pendingReview: { id: review.id, drafts: review.comments.totalCount } } : {};
}

/** The REST body for one inline comment. A file comment carries `subject_type` and no line. */
function restCommentBody(args: InlineCommentArgs, commitId: string): Record<string, unknown> {
  if (args.subjectType === 'file') {
    return { body: args.body, commit_id: commitId, path: args.path, subject_type: 'file' };
  }
  return {
    body: args.body,
    commit_id: commitId,
    path: args.path,
    line: args.line,
    side: args.side,
    ...(args.startLine !== undefined ? { start_line: args.startLine } : {}),
    ...(args.startSide !== undefined ? { start_side: args.startSide } : {}),
  };
}

interface TeamsResponse {
  organization: { teams: { nodes: { slug: string }[] } } | null;
}

interface RawDetailPr extends RawPr, RawPrThread {
  body: string;
  bodyHTML?: string;
  viewerCanMergeAsAdmin?: boolean;
  mergeStateStatus?: string;
  mergeable?: string;
  latestReviews?: { nodes: { state: string }[] };
  baseRefName: string;
  headRefName: string;
  isCrossRepository?: boolean;
  mergedBy?: { login: string } | null;
  commits: { nodes: { commit: RawHeadCommit }[] };
  allCommits: { nodes: { commit: { oid: string; messageHeadline: string; url: string } }[] };
  myReviews: {
    nodes: { author: { login: string } | null; state: string; commit: { oid: string } | null }[];
  };
  /** The viewer's pending review, if one exists. */
  pendingReview: { nodes: { id: string; comments: { totalCount: number } }[] };
  files: {
    pageInfo?: { hasNextPage: boolean };
    nodes: { path: string; additions: number; deletions: number; viewerViewedState: string }[];
  };
  checkCommit: {
    nodes: { commit: { statusCheckRollup: RawRollup | null } }[];
  };
}

interface RawRollup {
  state: string;
  contexts: { pageInfo?: { hasNextPage: boolean }; nodes: RawContext[] };
}

interface RawMergeState {
  id: string;
  title: string;
  state: string;
  isDraft?: boolean;
  baseRefName: string;
  headRefName: string;
  author: { login: string } | null;
  viewerCanMergeAsAdmin?: boolean;
  mergeStateStatus?: string;
  mergeable?: string;
  reviewDecision?: string | null;
  commits: { nodes: { commit: RawHeadCommit & { statusCheckRollup: RawRollup | null } }[] };
}

/** The head commit's author and committer, as GitHub logins (null when the email has no account). */
interface RawHeadCommit {
  author?: { user: { login: string } | null } | null;
  committer?: { user: { login: string } | null } | null;
}

/** Logins on the head commit's author and committer, for the latest-pusher admin merge rule. */
function headCommitLogins(commits: { nodes: { commit: RawHeadCommit }[] } | undefined): string[] {
  const c = commits?.nodes[0]?.commit;
  return [c?.author?.user?.login, c?.committer?.user?.login].filter((l): l is string => typeof l === 'string' && l !== '');
}

type RawChecks = Pick<
  RawMergeState,
  'viewerCanMergeAsAdmin' | 'mergeStateStatus' | 'mergeable' | 'reviewDecision' | 'commits'
> & {
  viewerPermission?: string;
};

interface ChecksResponse {
  repository: { viewerPermission?: string; pullRequest: RawChecks | null } | null;
}

interface MergeStateResponse {
  viewer: { login: string };
  repository: { viewerPermission?: string; pullRequest: RawMergeState | null } | null;
}
interface FollowResponse {
  repository: { pullRequest: (RawPr & { autoMergeRequest: { enabledAt: string } | null }) | null } | null;
}

interface DetailResponse {
  viewer: { login: string };
  rateLimit: RateInfo;
  repository: { viewerPermission?: string; pullRequest: RawDetailPr | null } | null;
}

interface RestFile {
  filename: string;
  additions: number;
  deletions: number;
  patch?: string;
}

const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function toDiffFiles(files: RestFile[]): DiffFile[] {
  return files.map((f) => ({
    path: f.filename,
    additions: f.additions,
    deletions: f.deletions,
    hunks: f.patch ? parsePatch(f.patch) : [],
    noPatch: !f.patch,
  }));
}

export class GithubProvider implements Provider {
  readonly fixtures = false;
  private readonly cache = new Map<string, { at: Date; value: unknown }>();
  private readonly bases = new Map<string, ReviewBase>();
  /** Numeric repo ids by name, for image uploads. A repo's id never changes. */
  private readonly repoIds = new Map<string, number>();
  private state: InboxState = EMPTY_STATE;
  private loading: Promise<void> | undefined;
  /** Syncs in flight, by effective mode. */
  private readonly syncing: Partial<Record<'delta' | 'full', Promise<boolean>>> = {};
  /** Start of the last full sweep; a saved list counts as swept when it was last synced. */
  private fullAt = 0;
  /** Teams and project ids were refreshed at this time; 0 until the first sync. */
  private metaAt = 0;
  /** No GitHub reads until this time (ms), after a rate limit. */
  private backoffUntil = 0;
  private readonly listeners = new Set<(e: SyncEvent) => void>();
  /** The pending follow-up timer per PR key; `id` tells a restarted schedule from a stale one. */
  private readonly follows = new Map<string, { timer: NodeJS.Timeout; id: number }>();
  private followId = 0;
  /** What each followed PR is doing, by PR id, with the time (ms) the entry expires. */
  private readonly followStates = new Map<string, { value: FollowState; until: number }>();
  private teamsWarned = false;
  private readonly issueSvc: IssueService;
  /** The newest sync failure, shown on both the PR and issue lists. */
  private stale: Stale | undefined;
  private readonly attachments: AttachmentImages;

  constructor(
    private readonly client: GithubClient,
    private readonly seen: SeenStore,
    private readonly gh: RunGh = runGh,
    private readonly store: PrCache = new PrCache(),
    private readonly log: LogSink = consoleSink,
    private readonly now: () => number = Date.now,
    issueStore: IssueCache = new IssueCache(),
    project: ProjectConfig = new ProjectConfig(undefined, undefined, log),
  ) {
    this.issueSvc = new IssueService(client, seen, issueStore, now, project);
    this.attachments = AttachmentImages.over(client, log, now);
  }

  private get settings(): Settings {
    return this.issueSvc.settings;
  }

  private rate(): RateInfo | undefined {
    return this.client.graphqlRate ?? this.client.lastRate;
  }

  budget(): RateInfo | undefined {
    return this.rate();
  }

  private hit(target: string): void {
    this.log(formatCall({ method: 'GET', target, cost: 0, cache: 'hit' }));
  }

  /** Reads the saved inbox once, so the first render needs no request. */
  private load(): Promise<void> {
    this.loading ??= (async () => {
      this.state = await this.store.loadState();
      this.fullAt = this.state.lastSync;
      await this.expire();
    })();
    return this.loading;
  }

  private async expire(): Promise<void> {
    const { state, expired } = expireClosed(this.state, this.now());
    if (expired.length === 0) return;
    this.state = state;
    await this.store.prune(expired);
  }

  private async fetchPrs(search: string, label: string, from: string | null = null) {
    const found: RawPr[] = [];
    let viewer = '';
    let after: string | null = from;
    for (;;) {
      const data: InboxResponse = await this.client.graphql<InboxResponse>(
        INBOX_QUERY,
        { q: search, after },
        label,
      );
      viewer = data.viewer.login;
      found.push(...data.search.nodes.filter((n): n is RawPr => 'id' in n));
      if (!data.search.pageInfo.hasNextPage) break;
      after = data.search.pageInfo.endCursor;
    }
    return { viewer, found };
  }

  /** The viewer's team slugs. Without permission it logs once and matches users only. */
  private async fetchTeams(viewer: string): Promise<string[]> {
    try {
      const slugs: string[] = [];
      for (const org of this.settings.orgs) {
        const data = await this.client.graphql<TeamsResponse>(TEAMS_QUERY, { org, login: viewer });
        slugs.push(...(data.organization?.teams.nodes.map((n) => n.slug) ?? []));
      }
      return slugs;
    } catch (e) {
      if (!(e instanceof ApiError) || e.kind === 'ratelimit') throw e;
      if (!this.teamsWarned) {
        this.teamsWarned = true;
        this.log(`[gh] teams unavailable (${e.message}); matching user requests only`);
      }
      return [];
    }
  }

  /** Teams and project ids, on the first sync and then hourly. */
  private async refreshMeta(viewer: string, start: number): Promise<void> {
    const teams = await this.fetchTeams(viewer);
    await this.issueSvc.project.refresh(this.client);
    this.state = { ...this.state, teams };
    this.metaAt = start;
  }

  private async fullSweep(start: number): Promise<void> {
    const { viewer, found } = await this.fetchPrs(fullSearch(this.settings.orgs), 'InboxSync:full');
    if (start - this.metaAt >= META_MS) await this.refreshMeta(viewer, start);
    this.state = applyFull(this.state, viewer, found.map(toSummary), start);
    await this.issueSvc.full(start);
    this.fullAt = start;
  }

  /**
   * One small request for changed PRs, issues and mentions. A search with more hits than
   * the first page continues from its cursor, so a bulk change pages instead of sweeping.
   */
  private async pollCombined(start: number): Promise<void> {
    const { orgs, project } = this.settings;
    const { viewer } = this.state;
    const vars = {
      prs: deltaSearch(orgs, this.state.lastSync, DELTA_OVERLAP_MS),
      own: ownOpenSearch(orgs, viewer),
      watchOwn: Object.values(this.state.prs).some((p) => p.ci === 'running' && isOwnPr(p.author, viewer)),
      issues: issueDeltaSearch(orgs, this.issueSvc.state.lastSync, DELTA_OVERLAP_MS),
      mentions: mentionDeltaSearch(orgs, this.issueSvc.state.lastSync, DELTA_OVERLAP_MS),
      statusField: project.statusField,
    };
    const data = await this.client.graphql<PollResponse>(pollQuery(PR_FIELDS), vars, 'Poll:delta');
    this.issueSvc.viewerId = data.viewer.id ?? this.issueSvc.viewerId;
    const prs = data.prs.nodes.filter((n): n is RawPr => 'id' in n);
    if (data.prs.pageInfo.hasNextPage) {
      prs.push(...(await this.fetchPrs(vars.prs, 'Poll:prs', data.prs.pageInfo.endCursor)).found);
    }
    const found = new Set(prs.map((p) => p.id));
    const own = (data.own?.nodes ?? []).filter((n): n is RawPr => 'id' in n);
    prs.push(...own.filter((p) => !found.has(p.id)));
    const issues = data.issues.nodes.filter((n): n is RawIssue => 'id' in n);
    if (data.issues.pageInfo.hasNextPage) {
      issues.push(...(await this.issueSvc.moreIssues(vars.issues, data.issues.pageInfo.endCursor)));
    }
    const mentions = data.mentions.nodes.filter((n): n is RawMention => 'id' in n);
    if (data.mentions.pageInfo.hasNextPage) {
      mentions.push(...(await this.issueSvc.moreMentions(vars.mentions, data.mentions.pageInfo.endCursor)));
    }
    const changed = prs.map((raw) => ({ pr: toSummary(raw), open: raw.state === 'OPEN', closedAt: raw.closedAt, merged: raw.state === 'MERGED' }));
    this.state = applyDelta(this.state, data.viewer.login, changed, start);
    await this.issueSvc.applyPoll(data.viewer.login, issues, mentions, start);
  }

  /** The saved lists without their sync times, so equal text means nothing changed. */
  private listsKey(): string {
    const { prs, closed } = this.state;
    const { issues, mentioned, closed: issuesClosed } = this.issueSvc.state;
    return JSON.stringify([prs, closed, issues, mentioned, issuesClosed]);
  }

  /** Runs one sync and says whether the saved PR, issue or mention lists changed. */
  private async runSync(mode: Exclude<SyncMode, 'none'>): Promise<boolean> {
    const start = this.now();
    await this.issueSvc.load();
    const before = this.listsKey();
    if (mode === 'full') {
      await this.fullSweep(start);
    } else {
      if (this.metaAt === 0) await this.refreshMeta(this.state.viewer, start);
      if (this.issueSvc.state.lastSync === 0) {
        // PR list is saved but issues never synced (first run after this feature): sweep issues only.
        await this.issueSvc.full(start);
      } else {
        await this.pollCombined(start);
      }
    }
    await this.expire();
    await this.store.saveState(this.state);
    return this.listsKey() !== before;
  }

  /** A delta is a full sweep when nothing is saved or the last sweep is an hour old. */
  private effectiveMode(mode: Exclude<SyncMode, 'none'>): 'delta' | 'full' {
    const due = this.state.lastSync === 0 || this.now() - this.fullAt >= FULL_SWEEP_MS;
    return mode === 'full' || due ? 'full' : 'delta';
  }

  /**
   * Overlapping syncs of one mode share a request. A delta joins a running full sweep,
   * and a full sweep requested during a delta runs after it.
   */
  private sync(requested: Exclude<SyncMode, 'none'>): Promise<boolean> {
    const mode = this.effectiveMode(requested);
    const running = this.syncing[mode] ?? (mode === 'delta' ? this.syncing.full : undefined);
    if (running) return running;
    const after = mode === 'full' ? this.syncing.delta : undefined;
    const run = (after ? after.catch(() => undefined).then(() => this.runSync(mode)) : this.runSync(mode)).finally(
      () => {
        delete this.syncing[mode];
        this.emit();
      },
    );
    this.syncing[mode] = run;
    this.emit();
    return run;
  }

  /**
   * Re-reads one PR directly after an action, because the delta search can lag the change
   * by minutes. A new action on the same PR restarts the schedule.
   */
  private follow(ref: PrRef): void {
    const key = keyOf(ref);
    const prev = this.follows.get(key);
    if (prev) clearTimeout(prev.timer);
    this.followId += 1;
    this.scheduleFollow(ref, key, this.followId, 0);
  }

  private scheduleFollow(ref: PrRef, key: string, id: number, step: number): void {
    const at = followAt(step);
    if (at > FOLLOW_WINDOW_MS) {
      this.follows.delete(key);
      this.dropPending(ref);
      return;
    }
    const prevAt = step === 0 ? 0 : followAt(step - 1);
    const timer = setTimeout(() => void this.runFollow(ref, key, id, step), at - prevAt);
    timer.unref();
    this.follows.set(key, { timer, id });
  }

  private async runFollow(ref: PrRef, key: string, id: number, step: number): Promise<void> {
    let again = true;
    try {
      const seen = await this.followCheck(ref);
      again = seen !== null && seen.open && (step < FOLLOW_STEPS_MS.length - 1 || seen.autoMerge);
    } catch (e) {
      this.log(`[follow] ${key}: ${e instanceof Error ? e.message : 'check failed'}`);
    }
    if (this.follows.get(key)?.id !== id) return;
    if (again) this.scheduleFollow(ref, key, id, step + 1);
    else {
      this.follows.delete(key);
      this.dropPending(ref);
    }
  }

  private prIdOf(ref: PrRef): string | undefined {
    return Object.values(this.state.prs).find((p) => p.repo === ref.repo && p.number === ref.number)?.id;
  }

  /** Sets or clears one PR's follow state. Returns whether anything changed. */
  private putFollow(id: string, kind: FollowKind | undefined, pr?: PrSummary): boolean {
    const prev = this.followStates.get(id);
    if (!kind) return prev !== undefined && this.followStates.delete(id);
    if (prev?.value.state === kind) return false;
    const now = this.now();
    const ttl = kind === 'approved' ? FOLLOW_APPROVED_MS : kind === 'merged' ? FOLLOW_MERGED_MS : Infinity;
    const value: FollowState = { state: kind, at: new Date(now).toISOString(), ...(pr ? { pr } : {}) };
    this.followStates.set(id, { value, until: now + ttl });
    return true;
  }

  private setFollow(ref: PrRef, kind: FollowKind): void {
    const id = this.prIdOf(ref);
    if (id) this.putFollow(id, kind);
  }

  /** The schedule ended with the PR still open: auto-merge and merging no longer hold. */
  private dropPending(ref: PrRef): void {
    const id = this.prIdOf(ref);
    const kind = id ? this.followStates.get(id)?.value.state : undefined;
    if (id && (kind === 'auto-merge' || kind === 'merging') && this.putFollow(id, undefined)) this.emit();
  }

  private followSnapshot(): Record<string, FollowState> {
    const now = this.now();
    const out: Record<string, FollowState> = {};
    for (const [id, e] of this.followStates) {
      if (e.until <= now) this.followStates.delete(id);
      else out[id] = e.value;
    }
    return out;
  }

  /** Folds one PR into the saved list. Returns null when the PR is gone. */
  private async followCheck(ref: PrRef): Promise<{ open: boolean; autoMerge: boolean } | null> {
    await this.load();
    const data = await this.client.graphql<FollowResponse>(
      FOLLOW_QUERY,
      { owner: repoOwner(ref.repo), name: repoName(ref.repo), number: ref.number },
      'Follow',
    );
    const raw = data.repository?.pullRequest;
    if (!raw) return null;
    const pr = toSummary(raw);
    const open = raw.state === 'OPEN';
    const before = this.state.prs[pr.id];
    this.state = applyOne(this.state, { pr, open, closedAt: raw.closedAt, merged: raw.state === 'MERGED' }, this.now());
    await this.store.saveState(this.state);
    await this.store.invalidate(keyOf(ref));
    // The auto-merge flag is tracked by the follow entry, so it does not count as a row change.
    const sansFlag = (p: PrSummary | undefined) => JSON.stringify(p && { ...p, autoMerge: undefined });
    const rowChanged = open !== (before !== undefined) || (open && sansFlag(before) !== sansFlag(pr));
    const autoMerge = raw.autoMergeRequest !== null;
    const prev = this.followStates.get(pr.id)?.value.state;
    let kind: FollowKind | undefined;
    if (!open) kind = raw.state === 'MERGED' ? 'merged' : undefined;
    else if (prev === 'approved' && !rowChanged) kind = 'approved';
    else kind = autoMerge ? 'auto-merge' : prev === 'merging' ? 'merging' : undefined;
    const followChanged = this.putFollow(pr.id, kind, kind === 'merged' ? (before ?? pr) : undefined);
    if (rowChanged || followChanged) this.emit();
    return { open, autoMerge: raw.autoMergeRequest !== null };
  }

  private emit(): void {
    const e = this.syncState();
    for (const fn of this.listeners) fn(e);
  }

  subscribe(fn: (e: SyncEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  syncState(): SyncEvent {
    const e: SyncEvent = { prs: this.state.lastSync, issues: this.issueSvc.state.lastSync };
    return Object.keys(this.syncing).length > 0 ? { ...e, syncing: true } : e;
  }

  /** When to try GitHub again after a rate limit. */
  private backoffEnd(e: ApiError): number {
    const at = Date.parse(e.resetAt ?? this.client.lastRate?.resetAt ?? '');
    return Number.isNaN(at) || at <= this.now() ? this.now() + DEFAULT_BACKOFF_MS : at;
  }

  /**
   * One sync, then a change notice. After a rate limit it reads nothing from GitHub until
   * `resetAt` and keeps serving the saved lists. With nothing saved a failure throws.
   */
  async poll(mode: Exclude<SyncMode, 'none'>): Promise<PollResult> {
    await this.load();
    if (this.now() < this.backoffUntil) return { changed: false };
    let changed = false;
    try {
      changed = await this.sync(mode);
      this.stale = undefined;
      this.backoffUntil = 0;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.kind === 'ratelimit') this.backoffUntil = this.backoffEnd(e);
      if (this.state.lastSync === 0) throw e;
      this.stale = {
        kind: e.kind === 'ratelimit' ? 'ratelimit' : 'error',
        cachedAt: hhmm(new Date(this.state.lastSync)),
        message: e.message,
        resetAt: e.resetAt ?? this.client.lastRate?.resetAt,
      };
    }
    this.emit();
    return { changed };
  }

  async refresh(): Promise<void> {
    await this.poll('full');
  }

  private listed(ref: PrRef): PrSummary | undefined {
    return Object.values(this.state.prs).find((p) => p.repo === ref.repo && p.number === ref.number);
  }

  /** Run a read; on failure return the last good response marked stale. */
  private async cached<T extends object>(key: string, fn: () => Promise<T>): Promise<T> {
    try {
      const value = await fn();
      this.cache.set(key, { at: new Date(), value });
      return value;
    } catch (e) {
      const hit = this.cache.get(key);
      if (!hit || !(e instanceof ApiError)) throw e;
      const stale: Stale = {
        kind: e.kind === 'ratelimit' ? 'ratelimit' : 'error',
        cachedAt: hhmm(hit.at),
        message: e.message,
        resetAt: e.resetAt ?? this.client.lastRate?.resetAt,
      };
      return { ...(hit.value as T), stale };
    }
  }

  /**
   * `none` serves the saved list with no request, `delta` fetches only PRs changed
   * since the last sync, `full` sweeps every open PR.
   */
  async inbox(_state?: StateQuery, mode: SyncMode = 'full'): Promise<InboxData> {
    await this.load();
    if (mode !== 'none') await this.poll(mode);
    else if (this.state.lastSync === 0) {
      // Nothing saved yet: wait for the first sweep, which the server loop shares.
      if (this.now() < this.backoffUntil) {
        throw new ApiError('GitHub rate limit reached', 'ratelimit', 403, new Date(this.backoffUntil).toISOString());
      }
      await this.poll('full');
    }
    const { stale } = this;
    const prs = await this.seen.annotate(Object.values(this.state.prs));
    return {
      viewer: this.state.viewer,
      teams: this.state.teams,
      prs,
      follows: this.followSnapshot(),
      shipped: this.state.shipped,
      syncedAt: this.state.lastSync,
      rate: this.rate(),
      ...(stale ? { stale } : {}),
    };
  }

  /** A patch body by immutable key: served from the cache, fetched once otherwise. */
  private async patch<T, R = T>(
    ref: PrRef,
    key: string,
    path: string,
    pick?: (raw: R) => T,
  ): Promise<T> {
    const prKey = keyOf(ref);
    const cached = await this.store.getPatch<T>(prKey, key);
    if (cached) {
      this.hit(path);
      return cached.body;
    }
    const got = await this.client.restConditional<T, R>(path, undefined, pick);
    await this.store.putPatch(prKey, key, got);
    return got.body;
  }

  private async compareFiles(ref: PrRef, base: string, head: string): Promise<RestFile[] | 'gone'> {
    try {
      return await this.patch<RestFile[], { files?: RestFile[] }>(
        ref,
        `compare:${base}...${head}`,
        `/repos/${ref.repo}/compare/${base}...${head}?per_page=100`,
        (raw) => raw.files ?? [],
      );
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 422)) return 'gone';
      throw e;
    }
  }

  async detail(ref: PrRef): Promise<PrDetail> {
    return this.attachments.prDetail(await this.loadDetail(ref));
  }

  private loadDetail(ref: PrRef): Promise<PrDetail> {
    return this.cached(`detail:${ref.repo}#${ref.number}`, async () => {
      await this.load();
      const prKey = keyOf(ref);
      const listed = this.listed(ref);
      if (listed) {
        const entry = await this.store.getDetail(prKey, listed.headSha);
        if (entry && Date.parse(entry.updatedAt) >= Date.parse(listed.updatedAt)) {
          this.hit(`detail ${prKey}@${listed.headSha.slice(0, 7)}`);
          this.bases.set(prKey, entry.base);
          const summary = (await this.seen.annotate([listed]))[0] ?? listed;
          // Checks and merge state move without the PR's updatedAt, so they are never cached.
          const fresh = await this.liveChecks(ref);
          const rollup = fresh.commits.nodes[0]?.commit.statusCheckRollup;
          return {
            ...entry.detail,
            summary: { ...summary, ci: ciFromRollup(rollup?.state) },
            checks: (rollup?.contexts.nodes ?? []).map(toCheck),
            checksTruncated: rollup?.contexts.pageInfo?.hasNextPage === true,
            viewerCanMergeAsAdmin: canAdminMerge(fresh.viewerCanMergeAsAdmin, fresh.viewerPermission),
            mergeStateStatus: fresh.mergeStateStatus,
            mergeable: fresh.mergeable,
            reviewDecision: fresh.reviewDecision ?? undefined,
            rate: this.rate(),
          };
        }
      }
      const data = await this.client.graphql<DetailResponse>(DETAIL_QUERY, {
        owner: repoOwner(ref.repo),
        name: repoName(ref.repo),
        number: ref.number,
        viewer: this.state.viewer,
      });
      const pr = data.repository?.pullRequest;
      if (!pr) throw new ApiError('Pull request not found', 'http', 404);
      const detail = await this.buildDetail(
        ref,
        data.viewer.login,
        pr,
        data.rateLimit,
        data.repository?.viewerPermission,
      );
      const base = this.bases.get(prKey);
      if (base) {
        await this.store.putDetail({
          prKey,
          head: pr.headRefOid,
          updatedAt: pr.updatedAt,
          detail,
          base,
        });
      }
      return detail;
    });
  }

  private async buildDetail(
    ref: PrRef,
    viewer: string,
    pr: RawDetailPr,
    rate: RateInfo,
    viewerPermission?: string,
  ): Promise<PrDetail> {
    const mine = pr.myReviews.nodes.filter((r) => r.author?.login === viewer && r.commit);
    const last = mine[mine.length - 1];
    const lastSha = last?.commit?.oid;
    const head = pr.headRefOid;

    let changed = new Set<string>();
    let gone = false;
    if (lastSha && lastSha !== head) {
      const cmp = await this.compareFiles(ref, lastSha, head);
      if (cmp === 'gone') gone = true;
      else changed = new Set(cmp.map((f) => f.filename));
    }
    this.bases.set(`${ref.repo}#${ref.number}`, { sha: lastSha, head, gone });

    let nodes = pr.allCommits.nodes;
    const reached = !lastSha || lastSha === head || nodes.some((n) => n.commit.oid === lastSha);
    if (!reached && pr.commitCount.totalCount > nodes.length) nodes = await this.fetchCommits(ref);
    const all = nodes.map((n) => n.commit);
    const idx = lastSha ? all.findIndex((c) => c.oid === lastSha) : -1;
    const fresh = idx >= 0 ? all.slice(idx + 1) : [];
    const shown: CommitItem[] =
      idx >= 0
        ? [
            ...fresh.reverse().map((c) => ({
              sha: c.oid.slice(0, 7),
              message: c.messageHeadline,
              isNew: true,
              lastReviewed: false,
              url: c.url,
            })),
            ...(all[idx]
              ? [
                  {
                    sha: all[idx].oid.slice(0, 7),
                    message: all[idx].messageHeadline,
                    isNew: false,
                    lastReviewed: true,
                    url: all[idx].url,
                  },
                ]
              : []),
          ]
        : all
            .slice(-3)
            .reverse()
            .map((c) => ({
              sha: c.oid.slice(0, 7),
              message: c.messageHeadline,
              isNew: false,
              lastReviewed: false,
              url: c.url,
            }));

    const rollup = pr.checkCommit.nodes[0]?.commit.statusCheckRollup;
    const contexts = rollup?.contexts.nodes ?? [];
    const summary = (await this.seen.annotate([toSummary(pr)]))[0] ?? toSummary(pr);
    return {
      summary,
      body: pr.body,
      bodyHtml: pr.bodyHTML,
      baseRef: pr.baseRefName,
      headRef: pr.headRefName,
      headIsFork: pr.isCrossRepository === true,
      isOpen: pr.state === undefined || pr.state === 'OPEN',
      checks: contexts.map(toCheck),
      checksTruncated: rollup?.contexts.pageInfo?.hasNextPage === true,
      filesTruncated: pr.files.pageInfo?.hasNextPage === true,
      reviewLine: last
        ? `${viewer}: ${reviewSummary(last.state)} (last at ${(lastSha ?? '').slice(0, 7)})`
        : `${viewer}: no review yet`,
      lastReviewedSha: lastSha?.slice(0, 7),
      commits: shown,
      commitTotal: pr.commitCount.totalCount,
      newCommits: idx >= 0 ? all.length - idx - 1 : 0,
      files: pr.files.nodes.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        viewed: f.viewerViewedState === 'VIEWED',
        changedSinceReview: changed.has(f.path),
      })),
      reviewBaseGone: gone,
      mergeMethod: mergeMethodFor(pr.title, pr.baseRefName, pr.headRefName, this.settings),
      viewerCanMergeAsAdmin: canAdminMerge(pr.viewerCanMergeAsAdmin, viewerPermission),
      headCommitLogins: headCommitLogins(pr.commits),
      mergeStateStatus: pr.mergeStateStatus,
      mergeable: pr.mergeable,
      ...reviewCounts(pr),
      merged: pr.state === 'MERGED',
      ...(pr.closedAt ? { closedAt: pr.closedAt } : {}),
      ...(pr.mergedBy ? { mergedBy: pr.mergedBy.login } : {}),
      reviewDecision: pr.reviewDecision ?? undefined,
      thread: toPrThread(pr),
      ...pendingReviewOf(pr.pendingReview),
      rate,
    };
  }

  async diff(ref: PrRef, mode: DiffMode): Promise<DiffData> {
    return this.cached(`diff:${ref.repo}#${ref.number}:${mode}`, async () => {
      const key = `${ref.repo}#${ref.number}`;
      const known = this.bases.get(key) ?? (await this.loadDetail(ref).then(() => this.bases.get(key)));
      const range = known?.sha ? `${known.sha.slice(0, 7)}..${known.head.slice(0, 7)}` : '';
      if (mode === 'since' && known?.sha && !known.gone) {
        const cmp = await this.compareFiles(ref, known.sha, known.head);
        if (cmp !== 'gone') {
          return { mode, range, baseGone: false, files: toDiffFiles(cmp), commitsInRange: 0 };
        }
      }
      const files = await this.patch<RestFile[]>(
        ref,
        `files:${known?.head ?? 'unknown'}`,
        `/repos/${ref.repo}/pulls/${ref.number}/files?per_page=100`,
      );
      const baseGone = mode === 'since' && (known?.gone ?? false);
      return { mode: 'all' as const, range, baseGone, files: toDiffFiles(files), commitsInRange: 0 };
    });
  }

  private fail(e: unknown): ActionResult {
    const stderr = (e as { stderr?: unknown } | null)?.stderr;
    if (typeof stderr === 'string' && stderr.trim() !== '') {
      return { ok: false, message: stderr.trim().slice(0, 200) };
    }
    return { ok: false, message: e instanceof Error ? e.message : 'Request failed' };
  }

  async setViewed(prId: string, path: string, viewed: boolean): Promise<ActionResult> {
    try {
      await this.client.graphql(viewed ? SET_VIEWED : UNSET_VIEWED, { id: prId, path });
      await this.store.setViewed(prId, path, viewed);
      return { ok: true, message: viewed ? 'Marked viewed' : 'Marked unviewed' };
    } catch (e) {
      return this.fail(e);
    }
  }

  async review(ref: PrRef, event: ReviewEvent, body: string): Promise<ActionResult> {
    try {
      const { review } = await this.prState(ref);
      if (review) {
        // Finishing the viewer's pending review submits it. No new review is created.
        await this.client.graphql(SUBMIT_REVIEW, { id: review.id, event, body: body || null }, 'SubmitReview');
      } else {
        await this.client.rest(`/repos/${ref.repo}/pulls/${ref.number}/reviews`, {
          method: 'POST',
          body: JSON.stringify({ event, body }),
        });
      }
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      if (event === 'APPROVE') this.setFollow(ref, 'approved');
      return { ok: true, message: `Review submitted (${event.toLowerCase().replace('_', ' ')})` };
    } catch (e) {
      return this.fail(e);
    }
  }

  /** The PR's node id, head sha and the viewer's pending review (absent when there is none). One read. */
  private async prState(ref: PrRef): Promise<{ prId: string; head: string; review?: { id: string; drafts: number } }> {
    const data = await this.client.graphql<PendingReviewResponse>(
      PENDING_REVIEW_QUERY,
      { owner: repoOwner(ref.repo), name: repoName(ref.repo), number: ref.number },
      'PendingReview',
    );
    const pr = data.repository?.pullRequest;
    if (!pr) throw new ApiError('Pull request not found', 'http', 404);
    const review = pr.reviews.nodes[0];
    return {
      prId: pr.id,
      head: pr.headRefOid,
      ...(review ? { review: { id: review.id, drafts: review.comments.totalCount } } : {}),
    };
  }

  /**
   * One line or file comment, posted now against the head commit. GitHub rejects a standalone
   * comment while the viewer has a pending review, so it joins that review as a draft instead.
   */
  async addReviewComment(args: InlineCommentArgs): Promise<ActionResult> {
    const ref = { repo: args.repo, number: args.number };
    try {
      const { head, review } = await this.prState(ref);
      if (review) {
        await this.addThread(review.id, args);
        await this.store.invalidate(keyOf(ref));
        this.follow(ref);
        return {
          ok: true,
          message: `Added to your pending review (${review.drafts + 1} pending). Submit the review to post it.`,
        };
      }
      await this.client.rest(`/repos/${args.repo}/pulls/${args.number}/comments`, {
        method: 'POST',
        body: JSON.stringify(restCommentBody(args, head)),
      });
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      return { ok: true, message: `Comment posted on ${args.path}` };
    } catch (e) {
      return this.fail(e);
    }
  }

  /** One line or file comment, added to the viewer's pending review. The review is created first if needed. */
  async addDraftComment(args: InlineCommentArgs): Promise<ActionResult> {
    const ref = { repo: args.repo, number: args.number };
    try {
      const st = await this.prState(ref);
      const reviewId = st.review?.id ?? (await this.createPendingReview(ref, st));
      await this.addThread(reviewId, args);
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      return { ok: true, message: `Draft comment added (${(st.review?.drafts ?? 0) + 1} pending)` };
    } catch (e) {
      return this.fail(e);
    }
  }

  /**
   * Starts the viewer's pending review. When a parallel draft already started one, GitHub refuses
   * a second, so the review that won is used instead.
   */
  private async createPendingReview(ref: PrRef, st: { prId: string; head: string }): Promise<string> {
    try {
      const created = await this.client.graphql<{ addPullRequestReview: { pullRequestReview: { id: string } } }>(
        ADD_PENDING_REVIEW,
        { pullRequestId: st.prId, commitOID: st.head },
        'AddPendingReview',
      );
      return created.addPullRequestReview.pullRequestReview.id;
    } catch (e) {
      const existing = (await this.prState(ref)).review;
      if (existing) return existing.id;
      throw e;
    }
  }

  private async addThread(reviewId: string, args: InlineCommentArgs): Promise<void> {
    await this.client.graphql(
      ADD_REVIEW_THREAD,
      {
        pullRequestReviewId: reviewId,
        path: args.path,
        body: args.body,
        line: args.subjectType === 'line' ? args.line : null,
        side: args.subjectType === 'line' ? args.side : null,
        startLine: args.startLine ?? null,
        startSide: args.startSide ?? null,
        subjectType: args.subjectType === 'file' ? 'FILE' : 'LINE',
      },
      'AddReviewThread',
    );
  }

  async replyToThread(args: { repo: string; number: number; threadId: string; body: string }): Promise<ActionResult> {
    const ref = { repo: args.repo, number: args.number };
    try {
      await this.client.graphql(ADD_THREAD_REPLY, { threadId: args.threadId, body: args.body }, 'AddThreadReply');
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      return { ok: true, message: 'Reply posted' };
    } catch (e) {
      return this.fail(e);
    }
  }

  async resolveThread(args: { repo: string; number: number; threadId: string }): Promise<ActionResult> {
    return this.setThreadResolved(args, true);
  }

  async unresolveThread(args: { repo: string; number: number; threadId: string }): Promise<ActionResult> {
    return this.setThreadResolved(args, false);
  }

  private async setThreadResolved(
    args: { repo: string; number: number; threadId: string },
    resolved: boolean,
  ): Promise<ActionResult> {
    const ref = { repo: args.repo, number: args.number };
    try {
      await this.client.graphql(
        resolved ? RESOLVE_THREAD : UNRESOLVE_THREAD,
        { threadId: args.threadId },
        resolved ? 'ResolveThread' : 'UnresolveThread',
      );
      await this.store.invalidate(keyOf(ref));
      return { ok: true, message: resolved ? 'Thread resolved' : 'Thread reopened' };
    } catch (e) {
      return this.fail(e);
    }
  }

  async editDraftComment(args: { repo: string; number: number; commentId: string; body: string }): Promise<ActionResult> {
    const ref = { repo: args.repo, number: args.number };
    try {
      await this.client.graphql(UPDATE_REVIEW_COMMENT, { id: args.commentId, body: args.body }, 'UpdateReviewComment');
      await this.store.invalidate(keyOf(ref));
      return { ok: true, message: 'Draft updated' };
    } catch (e) {
      return this.fail(e);
    }
  }

  async deleteDraftComment(args: { repo: string; number: number; commentId: string }): Promise<ActionResult> {
    const ref = { repo: args.repo, number: args.number };
    try {
      await this.client.graphql(DELETE_REVIEW_COMMENT, { id: args.commentId }, 'DeleteReviewComment');
      await this.store.invalidate(keyOf(ref));
      return { ok: true, message: 'Draft deleted' };
    } catch (e) {
      return this.fail(e);
    }
  }

  async discardPendingReview(ref: PrRef): Promise<ActionResult> {
    try {
      const { review } = await this.prState(ref);
      if (!review) return { ok: true, message: 'No pending review' };
      await this.client.graphql(DELETE_PENDING_REVIEW, { id: review.id }, 'DeletePendingReview');
      await this.store.invalidate(keyOf(ref));
      return { ok: true, message: 'Pending review discarded' };
    } catch (e) {
      return this.fail(e);
    }
  }

  async comment(ref: PrRef, body: string): Promise<ActionResult> {
    try {
      await this.client.rest(`/repos/${ref.repo}/issues/${ref.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      return { ok: true, message: `Comment posted on ${ref.repo} #${ref.number}` };
    } catch (e) {
      return this.fail(e);
    }
  }

  async merge(ref: PrRef): Promise<ActionResult> {
    try {
      // The guard query already carries the title and branches, so no separate title read.
      const { pr } = await this.mergeState(ref);
      if (pr.isDraft === true) return { ok: false, message: `Auto-merge refused. ${DRAFT_HINT}` };
      await this.gh([
        'pr', 'merge', '--auto', '--repo', ref.repo, String(ref.number),
        ...mergeFlags({ title: pr.title, base: pr.baseRefName, head: pr.headRefName }, this.settings),
      ]);
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      this.setFollow(ref, 'auto-merge');
      return { ok: true, message: 'Auto-merge enabled' };
    } catch (e) {
      return this.fail(e);
    }
  }

  /** Live checks and merge state for a cached detail: the smallest query that has them. */
  private async liveChecks(ref: PrRef): Promise<RawChecks> {
    const data = await this.client.graphql<ChecksResponse>(
      CHECKS_QUERY,
      { owner: repoOwner(ref.repo), name: repoName(ref.repo), number: ref.number },
      'Checks',
    );
    const pr = data.repository?.pullRequest;
    if (!pr) throw new ApiError('Pull request not found', 'http', 404);
    return { ...pr, viewerPermission: data.repository?.viewerPermission };
  }

  /** The last 100 commits, when the detail query's 30 do not reach the last review. */
  private async fetchCommits(ref: PrRef): Promise<RawDetailPr['allCommits']['nodes']> {
    const data = await this.client.graphql<{
      repository: { pullRequest: { commits: RawDetailPr['allCommits'] } | null } | null;
    }>(ALL_COMMITS_QUERY, { owner: repoOwner(ref.repo), name: repoName(ref.repo), number: ref.number }, 'AllCommits');
    return data.repository?.pullRequest?.commits.nodes ?? [];
  }

  /** Fresh author, permission, checks, refs and title. Never read from a cache. */
  private async mergeState(
    ref: PrRef,
  ): Promise<{ viewer: string; pr: RawMergeState; viewerPermission?: string }> {
    const data = await this.client.graphql<MergeStateResponse>(
      MERGE_STATE_QUERY,
      { owner: repoOwner(ref.repo), name: repoName(ref.repo), number: ref.number },
      'MergeState',
    );
    const pr = data.repository?.pullRequest;
    if (!pr) throw new ApiError('Pull request not found', 'http', 404);
    return { viewer: data.viewer.login, pr, viewerPermission: data.repository?.viewerPermission };
  }

  /** Takes a draft PR out of draft through the GraphQL mutation. */
  async markReady(ref: PrRef): Promise<ActionResult> {
    try {
      const { pr } = await this.mergeState(ref);
      if (pr.state !== 'OPEN') return { ok: false, message: 'Not marked ready: the PR is not open' };
      if (pr.isDraft !== true) return { ok: true, message: 'Already ready for review' };
      await this.client.graphql(MARK_READY, { id: pr.id }, 'MarkReady');
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      return { ok: true, message: 'Marked ready for review' };
    } catch (e) {
      return this.fail(e);
    }
  }

  /** Re-runs a workflow run through the REST rerun endpoints, in the configured org. */
  async rerun(args: { repo: string; number: number; runId: number; mode: RerunMode }): Promise<ActionResult> {
    const ref = { repo: args.repo, number: args.number };
    try {
      await this.client.rerunRun(repoOwner(args.repo), repoName(args.repo), args.runId, args.mode);
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      return { ok: true, message: args.mode === 'failed' ? 'Failed jobs re-run' : 'All jobs re-run' };
    } catch (e) {
      return this.fail(e);
    }
  }

  /** GitHub's sanitised HTML for `text`, rendered in the context of `repo`. */
  async renderMarkdown(args: { repo: string; text: string }): Promise<{ html: string }> {
    return { html: await this.client.markdown(args.text, args.repo) };
  }

  /** The server enforces the same rule as the UI; the typed confirmation is not a guard. */
  async adminMerge(ref: PrRef): Promise<ActionResult> {
    try {
      const { viewer, pr, viewerPermission } = await this.mergeState(ref);
      const author = pr.author?.login ?? '';
      const headLogins = headCommitLogins(pr.commits);
      if (pr.state !== 'OPEN') return { ok: false, message: 'Admin merge refused: the PR is not open' };
      if (!isOwnPr(author, viewer) && !headLogins.some((l) => sameLogin(l, viewer))) {
        return { ok: false, message: 'Admin merge refused: only the PR author or the latest pusher can admin merge' };
      }
      if (!canAdminMerge(pr.viewerCanMergeAsAdmin, viewerPermission)) {
        return { ok: false, message: 'Admin merge refused: you do not have admin merge permission' };
      }
      if (pr.isDraft === true) return { ok: false, message: `Admin merge refused. ${DRAFT_HINT}` };
      const ci = ciFromRollup(pr.commits.nodes[0]?.commit.statusCheckRollup?.state);
      const state = adminMergeState({
        author,
        viewer,
        viewerCanMergeAsAdmin: true,
        ci,
        isDraft: false,
        headCommitLogins: headLogins,
      });
      if (state !== 'ready') {
        return { ok: false, message: 'Admin merge refused: every check must pass first' };
      }
      const refs = { title: pr.title, base: pr.baseRefName, head: pr.headRefName };
      await this.gh(adminMergeArgs(ref.repo, ref.number, refs, this.settings));
      await this.store.invalidate(keyOf(ref));
      this.follow(ref);
      this.setFollow(ref, 'merging');
      return { ok: true, message: 'Merged with admin rights' };
    } catch (e) {
      return this.fail(e);
    }
  }

  async markSeen(mark: SeenMark): Promise<void> {
    await this.seen.mark(mark);
  }

  async issues(_state?: StateQuery): Promise<IssueInboxData> {
    return this.issueSvc.snapshot(this.stale);
  }

  async issueDetail(ref: PrRef, _state?: StateQuery): Promise<IssueDetail> {
    const detail = await this.cached(`issue:${ref.repo}#${ref.number}`, () =>
      this.issueSvc.detail(ref, (what) => this.hit(what)),
    );
    return this.attachments.issueDetail(detail);
  }

  closed(
    kind: ClosedKind,
    window: ClosedWindow,
    after: string | undefined,
    _state?: StateQuery,
  ): Promise<ClosedPage<ClosedPr> | ClosedPage<ClosedIssue>> {
    return fetchClosedPage(this.client, this.log, {
      kind,
      orgs: this.settings.orgs,
      window,
      after,
      now: this.now(),
    });
  }

  repoMeta(repo: string, _state?: StateQuery): Promise<RepoMeta> {
    return this.issueSvc.repoMeta(repo);
  }

  /** One page of `repository.mentionableUsers`. The first page logs its rate-limit cost. */
  async mentionable(repo: string, cursor: string | undefined, _state?: StateQuery): Promise<MentionablePage> {
    const data = await this.client.graphql<MentionableResponse>(
      MENTIONABLE_QUERY,
      { owner: repoOwner(repo), name: repoName(repo), cursor: cursor ?? null },
      'Mentionable',
    );
    if (!cursor) this.log(`[gh] mentionableUsers ${repo} rateLimit.cost=${data.rateLimit?.cost ?? 'unknown'}`);
    return mentionablePage(repo, data);
  }

  async lookup(number: number, repos: readonly string[], _state?: StateQuery): Promise<NumberHit[]> {
    await this.load();
    const issues = await this.issueSvc.snapshot(this.stale);
    const listed = new Set([...Object.values(this.state.prs), ...issues.issues].map((x) => x.repo));
    return lookupNumber(this.client, number, repos.filter((r) => listed.has(r)));
  }

  image(target: ImageTarget): Promise<FetchedImage> {
    const id = assetId(target);
    if (!id) return this.client.image(target);
    const node = target.kind === 'attachment' ? target.node : undefined;
    return this.attachments.image(id, () => this.client.image(target), node);
  }

  async uploadImage(repo: string, name: string, contentType: UploadType, bytes: Uint8Array): Promise<UploadResult> {
    let id = this.repoIds.get(repo);
    if (id === undefined) {
      ({ id } = await this.client.rest<{ id: number }>(`/repos/${repo}`));
      this.repoIds.set(repo, id);
    }
    return { url: await this.client.uploadAsset(id, name, contentType, bytes) };
  }

  async issueAction(action: IssueAction): Promise<IssueActionResult> {
    try {
      return await this.issueSvc.act(action);
    } catch (e) {
      return this.fail(e);
    }
  }

  markIssueSeen(mark: IssueSeenMark): Promise<void> {
    return this.issueSvc.markSeen(mark);
  }
}
