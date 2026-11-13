import type { ClosedIssue, ClosedKind, ClosedPage, ClosedPr, ClosedWindow } from '../shared/closed';
import { closedFixturePrs, pageOf } from './closed-fixtures';
import type {
  IssueAction,
  IssueActionResult,
  IssueDetail,
  IssueInboxData,
  RepoMeta,
} from '../shared/issue-types';
import {
  mergeMethodFor,
  type ActionResult,
  type DiffData,
  type DiffFile,
  type DiffMode,
  type FileItem,
  type InboxData,
  type PrDetail,
  type PrSummary,
  type PrThreadItem,
  type RateInfo,
  type ReviewEvent,
} from '../shared/types';
import type { FetchedImage, ImageTarget } from '../shared/image-url';
import type { UploadResult, UploadType } from '../shared/image-upload';
import type { NumberHit } from '../shared/number-query';
import { adminMergeArgs, githubErrorText, OWN_APPROVAL_422 } from '../shared/pr-actions';
import {
  fixtureSections,
  genericDiff,
  UNITS_API_310_ALL,
  UNITS_API_310_SINCE,
  LONG_LINES_DIFF,
  manyFilesDiff,
  FIXTURE_VIEWER,
} from './fixture-data';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { canAdminMerge } from './github-map';
import { liveCi, liveChecks } from './fixture-live-ci';
import { FIXTURE_INLINE_THREADS } from './fixture-threads';
import { FixtureReview } from './fixture-review';
import { FixtureIssues } from './issue-fixtures';
import type { MentionablePage } from '../shared/mentions';

/** Synthetic people and team for `NOD_FIXTURES=1`, under owner `acme-co`. */
export const FIXTURE_MENTIONABLE: MentionablePage['people'] = [
  { login: 'riley-k' },
  { login: 'sam-lee' },
  { login: 'jordan-q' },
  { login: 'acme-dev' },
];
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

const LAST_REVIEWED = 'a1b2c3d';
const HEAD = 'e4f5g6h';
const BODY =
  'Hides bonus_amount and bonus_rate from data:read tokens. ' +
  'sales:read tokens are unchanged. Adds regression specs and regenerates the swagger file.';

/** What GitHub renders for the descriptions above. */
const BODY_HTML =
  '<p>Hides <code>bonus_amount</code> and <code>bonus_rate</code> from <code>data:read</code> tokens. ' +
  '<strong>sales:read</strong> tokens are unchanged.</p><p>Adds regression specs and regenerates the swagger file.</p>';
const GENERIC_BODY = '## Changes\n\n- **Fixture** description with `code`.';
const GENERIC_HTML =
  '<h2>Changes</h2><ul><li><strong>Fixture</strong> description with <code>code</code>.</li></ul>';

const VIEWER = FIXTURE_VIEWER;

const commitUrl = (repo: string, sha: string) => `https://github.com/${repo}/commit/${sha}`;

const is307 =(ref: PrRef) => ref.repo === 'acme-co/acme-api' && ref.number === 307;
const isDraftFixture = (ref: PrRef) => ref.repo === 'acme-co/acme-web' && ref.number === 1352;
/** Ruleset bypass: GitHub reports no admin merge, but the repo permission is ADMIN. */
const isRulesetFixture = (ref: PrRef) => ref.repo === 'acme-co/acme-web' && ref.number === 1343;
const is310 =(ref: PrRef) => ref.repo === 'acme-co/acme-api' && ref.number === 310;
/** build-bot authored, admin rights, and the viewer pushed the head commit, so Admin merge shows. */
const isViewerPushFixture = (ref: PrRef) => ref.repo === 'acme-co/acme-api' && ref.number === 309;
/** build-bot authored, admin rights, but another person pushed the head commit, so Admin merge stays hidden. */
const isOtherPushFixture = (ref: PrRef) => ref.repo === 'acme-dev/tools' && ref.number === 11;
const isPusherFixture = (ref: PrRef) => isViewerPushFixture(ref) || isOtherPushFixture(ref);

function headCommitLoginsFor(ref: PrRef, author: string): string[] {
  if (isViewerPushFixture(ref)) return [VIEWER];
  if (isOtherPushFixture(ref)) return ['mlopez'];
  return [author];
}

function log(what: string): ActionResult {
  console.log(`[fixtures] would ${what}`);
  return { ok: true, message: `Fixture mode: would ${what}. Nothing was sent.` };
}

/** A comment whose body contains `fail` is refused like GitHub's 422, so the failed state can be checked offline. */
const refusedComment = (body: string) => /\bfail\b/.test(body);
const refusedResult = (): ActionResult => ({
  ok: false,
  message: githubErrorText(422, JSON.stringify({ message: 'Unprocessable Entity', errors: [{ message: 'Fixture: comment refused' }] })),
});

/** Serves synthetic data, makes no network calls, and turns actions into logged no-ops. */
/** A 1x1 grey PNG standing in for every allowed image. */
const FIXTURE_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaGgAAAMEAYFL09IQAAAAAElFTkSuQmCC',
    'base64',
  ),
);

/** Closed items the lists never show, for the top-bar lookup. */
const UNLISTED: Omit<NumberHit, 'url'>[] = [
  { kind: 'pr', repo: 'acme-dev/tools', number: 10, title: 'feat: retry vendor callbacks once' },
  { kind: 'issue', repo: 'acme-co/acme-api', number: 10, title: 'Seed script skips the demo community' },
];

export class FixtureProvider implements Provider {
  readonly fixtures = true;
  private readonly viewed = new Map<string, boolean>();
  /** PR timestamps derive from this, so a PR only looks changed when it changed. */
  private readonly born = Date.now();

  private readonly issueData: FixtureIssues;
  /** Inline review state for the fixture PR. Mutated in memory by the comment actions. */
  private readonly inline = new FixtureReview();

  constructor(private readonly settings: Settings = DEFAULT_SETTINGS) {
    this.issueData = new FixtureIssues(settings);
  }

  private rate(remaining: number): RateInfo {
    return { limit: 5000, remaining, resetAt: new Date(Date.now() + 12 * 60_000).toISOString() };
  }

  async poll(): Promise<PollResult> {
    return { changed: false };
  }

  budget(): RateInfo | undefined {
    return undefined;
  }

  async refresh(): Promise<void> {}

  subscribe(): () => void {
    return () => undefined;
  }

  syncState(): SyncEvent {
    return { prs: 0, issues: 0 };
  }

  async inbox(state: StateQuery, sync: SyncMode = 'full'): Promise<InboxData> {
    console.log(`[fixtures] would call InboxSync:${sync}`);
    const now = this.born;
    const base: InboxData = { viewer: VIEWER, teams: ['sam-leads'], prs: [], syncedAt: Date.now() - 14_000, follows: {} };
    if (state === 'loading') return { ...base, syncing: { done: 38, total: 61 } };

    if (state === 'ci-live' && sync === 'none') this.liveOrigin = Date.now();
    const s = fixtureSections(now);
    const empty = state === 'empty';
    const needs = s.needs.map((p) => ({ ...p, requested: [VIEWER] }));
    const prs = await this.annotate([
      ...(empty ? [] : needs),
      ...(empty ? [] : s.mine),
      ...s.org,
      ...(empty ? [] : s.dependabot),
    ]);
    const live = state === 'ci-live' ? liveCi(liveChecks(this.liveOrigin, Date.now())) : undefined;
    const shown = live
      ? prs.map((p) => (this.isLive({ repo: p.repo, number: p.number }, state) ? { ...p, ci: live } : p))
      : prs;
    const out: InboxData = { ...base, prs: shown, rate: this.rate(4812) };
    if (state === 'error') {
      out.stale = {
        kind: 'error',
        cachedAt: '14:52',
        message: 'GitHub API error 502 while loading acme-co/acme-api',
      };
    }
    if (state === 'ratelimit') {
      out.rate = this.rate(0);
      out.stale = {
        kind: 'ratelimit',
        cachedAt: '14:52',
        message: 'GitHub rate limit reached',
        resetAt: out.rate.resetAt,
      };
    }
    return out;
  }

  /** Fixture seen flags apply until a PR is opened; then the store takes over. */
  private async annotate(prs: PrSummary[]): Promise<PrSummary[]> {
    return prs.map((pr) => {
      const out = this.readied.has(pr.id) ? { ...pr, isDraft: false } : pr;
      return this.openedIds.has(pr.id) ? { ...out, seen: 'seen' as const, updatedNote: undefined } : out;
    });
  }

  /** Draft fixtures marked ready this session. */
  private readonly readied = new Set<string>();

  /** `?state=ci-live`: acme-co/acme-web #1343's checks run to completion over about 30 s. */
  private liveOrigin = Date.now();

  private isLive(ref: PrRef, state: StateQuery): boolean {
    return state === 'ci-live' && ref.repo === 'acme-co/acme-web' && ref.number === 1343;
  }

  private readonly openedIds = new Set<string>();

  private find(ref: PrRef): PrSummary {
    const s = fixtureSections(this.born);
    const all = [...s.needs, ...s.mine, ...s.org, ...s.dependabot, ...closedFixturePrs(this.born)];
    const found = all.find((p) => p.repo === ref.repo && p.number === ref.number);
    if (!found) throw new Error(`No fixture for ${ref.repo}#${ref.number}`);
    const hit = this.readied.has(found.id) ? { ...found, isDraft: false } : found;
    return is310(ref) ? { ...hit, headSha: HEAD } : hit;
  }

  private diffFiles(ref: PrRef, pr: PrSummary): DiffFile[] {
    if (is310(ref)) return UNITS_API_310_ALL;
    if (ref.repo === 'acme-co/acme-web' && ref.number === 1343) return manyFilesDiff();
    return genericDiff(pr);
  }

  /** `?state=longlines` swaps the default PR's diff for the long-lines fixture. */
  private filesFor(ref: PrRef, pr: PrSummary, state: StateQuery): DiffFile[] {
    if (state === 'longlines' && is310(ref)) return LONG_LINES_DIFF;
    return this.diffFiles(ref, pr);
  }

  async detail(ref: PrRef, state: StateQuery): Promise<PrDetail> {
    const open = await this.openDetail(ref, state);
    const closed = closedFixturePrs(this.born).find((p) => p.repo === ref.repo && p.number === ref.number);
    if (!closed) return open;
    return {
      ...open,
      isOpen: false,
      merged: closed.merged,
      closedAt: closed.closedAt,
      ...(closed.mergedBy ? { mergedBy: closed.mergedBy } : {}),
    };
  }

  private async openDetail(ref: PrRef, state: StateQuery): Promise<PrDetail> {
    console.log(`[fixtures] would call Detail ${ref.repo}#${ref.number}`);
    const summary = this.find(ref);
    const files: FileItem[] = this.filesFor(ref, summary, state).map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      viewed: this.isViewed(summary.id, f.path, state),
      changedSinceReview:
        is310(ref) && UNITS_API_310_SINCE.some((c) => c.path === f.path),
    }));
    const stale =
      state === 'ratelimit'
        ? {
            kind: 'ratelimit' as const,
            cachedAt: '14:52',
            message: 'GitHub rate limit reached',
            resetAt: this.rate(0).resetAt,
          }
        : undefined;
    const refs = this.refsOf(ref, summary.title);
    const common = {
      summary,
      baseRef: refs.base,
      headRef: refs.head,
      files,
      reviewBaseGone: false,
      mergeMethod: mergeMethodFor(summary.title, refs.base, refs.head, this.settings),
      viewerCanMergeAsAdmin:
        is307(ref) || isDraftFixture(ref) || isPusherFixture(ref) || canAdminMerge(false, isRulesetFixture(ref) ? 'ADMIN' : 'WRITE'),
      headCommitLogins: headCommitLoginsFor(ref, summary.author),
      stale,
      rate: this.rate(state === 'ratelimit' ? 0 : 4812),
    };
    if (this.isLive(ref, state)) {
      const checks = liveChecks(this.liveOrigin, Date.now());
      return {
        ...common,
        summary: { ...summary, ci: liveCi(checks) },
        body: GENERIC_BODY,
        bodyHtml: GENERIC_HTML,
        checks,
        reviewLine: `${VIEWER}: no review yet`,
        commits: [
          {
            sha: summary.headSha.slice(0, 7),
            message: 'update',
            isNew: false,
            lastReviewed: false,
            url: commitUrl(ref.repo, summary.headSha),
          },
        ],
        commitTotal: 1,
        newCommits: 0,
      };
    }
    if (!is310(ref)) {
      return {
        ...common,
        body: GENERIC_BODY,
        bodyHtml: GENERIC_HTML,
        checks: [{ name: 'build', status: summary.ci === 'running' ? 'running' : 'pass', duration: '1m 12s' }],
        ...(summary.conflicting ? { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' } : {}),
        reviewLine: `${VIEWER}: no review yet`,
        commits: [
          {
            sha: summary.headSha.slice(0, 7),
            message: 'update',
            isNew: false,
            lastReviewed: false,
            url: commitUrl(ref.repo, summary.headSha),
          },
        ],
        commitTotal: 1,
        newCommits: 0,
      };
    }
    return {
      ...common,
      body: BODY,
      bodyHtml: BODY_HTML,
      checks: [
        { name: 'build', status: 'pass', duration: '1m 12s', url: `https://github.com/acme-co/acme-api/actions/runs/1` },
        { name: 'rspec', status: 'fail', duration: '3m 40s', url: `https://github.com/acme-co/acme-api/actions/runs/2` },
        { name: 'rubocop', status: 'pass', duration: '0m 31s', url: `https://github.com/acme-co/acme-api/actions/runs/3` },
        { name: 'e2e (chromium)', status: 'cancelled', duration: '1m 04s', url: `https://github.com/acme-co/acme-api/actions/runs/4` },
        { name: 'visual-diff', status: 'skipped', duration: '', url: `https://github.com/acme-co/acme-api/actions/runs/5` },
      ],
      reviewDecision: 'CHANGES_REQUESTED',
      changeRequests: 1,
      pendingReviews: 1,
      ...(summary.conflicting
        ? { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }
        : { mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED' }),
      thread: [
        {
          kind: 'review',
          at: '2026-11-08T17:00:00Z',
          id: 'R_fx1',
          actor: VIEWER,
          verdict: 'changes',
          bodyHtml: '<p>Bonus fields must stay out of the read scope.<br>Please add a spec for the sales token.</p>',
        },
        {
          kind: 'comment',
          at: '2026-11-08T18:00:00Z',
          comment: {
            id: 'C_fx1',
            author: 'build-bot',
            createdAt: '2026-11-08T18:00:00Z',
            bodyHtml: '<p>Added the spec in the second commit.</p>',
          },
        },
        {
          kind: 'comment',
          at: '2026-11-08T18:30:00Z',
          comment: {
            id: 'C_fx2',
            author: 'build-bot',
            createdAt: '2026-11-08T18:30:00Z',
            bodyHtml: '<p>Same note as above.</p>',
            minimized: { reason: 'duplicate' },
          },
        },
        {
          kind: 'comment',
          at: '2026-11-08T19:00:00Z',
          comment: {
            id: 'C_fx3',
            author: 'build-bot',
            createdAt: '2026-11-08T19:00:00Z',
            bodyHtml: '<p>Rebased on staging.</p>',
            minimized: { reason: 'outdated' },
          },
        },
        ...this.inlineThreads(),
      ],
      ...(this.inline.pending() ? { pendingReview: this.inline.pending() } : {}),
      reviewLine: `${VIEWER}: needs review (last at ${LAST_REVIEWED})`,
      lastReviewedSha: LAST_REVIEWED,
      commits: [
        { sha: HEAD, message: 'add bonus scope spec', isNew: true, lastReviewed: false, url: commitUrl('acme-co/acme-api', HEAD) },
        { sha: '9c8d7e6', message: 'regenerate swagger', isNew: true, lastReviewed: false, url: commitUrl('acme-co/acme-api', '9c8d7e6') },
        { sha: LAST_REVIEWED, message: 'last reviewed head', isNew: false, lastReviewed: true, url: commitUrl('acme-co/acme-api', LAST_REVIEWED) },
      ],
      commitTotal: 5,
      newCommits: 2,
    };
  }

  private isViewed(prId: string, path: string, state: StateQuery): boolean {
    if (state === 'allviewed') return true;
    const key = `${prId}:${path}`;
    const set = this.viewed.get(key);
    if (set !== undefined) return set;
    return prId === 'PR_acme-co/acme-api_310' && /base_controller|unit_sale\.rb/.test(path);
  }

  async diff(ref: PrRef, mode: DiffMode, state: StateQuery): Promise<DiffData> {
    console.log(`[fixtures] would call Diff ${ref.repo}#${ref.number} mode=${mode}`);
    const pr = this.find(ref);
    const since = mode === 'since' && is310(ref);
    return {
      mode,
      range: is310(ref) ? `${LAST_REVIEWED}..${HEAD}` : '',
      baseGone: false,
      files: since ? UNITS_API_310_SINCE : this.filesFor(ref, pr, state),
      commitsInRange: is310(ref) ? 2 : 0,
    };
  }

  async setViewed(prId: string, path: string, viewed: boolean): Promise<ActionResult> {
    this.viewed.set(`${prId}:${path}`, viewed);
    return log(`mark ${path} ${viewed ? 'viewed' : 'unviewed'}`);
  }

  async review(ref: PrRef, event: ReviewEvent, body: string, state?: StateQuery): Promise<ActionResult> {
    if (state === 'error422' && event === 'APPROVE') {
      return { ok: false, message: githubErrorText(422, OWN_APPROVAL_422) };
    }
    // Submitting the pending review publishes its drafts and clears them.
    this.inline.close();
    return log(`submit ${event} on ${ref.repo}#${ref.number} (${body.length} chars)`);
  }

  /** The fixture inline threads, with any resolve change, reply and the draft threads applied. */
  private inlineThreads(): PrThreadItem[] {
    const threads = FIXTURE_INLINE_THREADS.map((t): PrThreadItem => {
      if (t.kind !== 'thread' || !t.threadId) return t;
      const over = this.inline.resolvedOverride(t.threadId);
      const replies = this.inline.repliesFor(t.threadId);
      const extra = replies.map((r) => ({
        id: r.id,
        author: FIXTURE_VIEWER,
        createdAt: '2026-11-09T11:00:00Z',
        body: r.body,
        bodyHtml: `<p>${r.body}</p>`,
      }));
      const next = extra.length ? { ...t, comments: [...t.comments, ...extra] } : t;
      return over === undefined ? next : { ...next, resolved: over };
    });
    return [...threads, ...this.inline.draftThreads()];
  }

  async addReviewComment(args: InlineCommentArgs): Promise<ActionResult> {
    if (refusedComment(args.body)) return refusedResult();
    return log(`post ${args.subjectType} comment on ${args.repo}#${args.number} (${args.body.length} chars)`);
  }

  async addDraftComment(args: InlineCommentArgs): Promise<ActionResult> {
    if (refusedComment(args.body)) return refusedResult();
    this.inline.addDraft({
      path: args.path,
      ...(args.subjectType === 'line' ? { line: args.line, side: args.side } : {}),
      body: args.body,
    });
    return { ok: true, message: `Draft comment added (${this.inline.pending()?.drafts ?? 0} pending)` };
  }

  async replyToThread(args: { repo: string; number: number; threadId: string; body: string }): Promise<ActionResult> {
    if (refusedComment(args.body)) return refusedResult();
    this.inline.addReply(args.threadId, args.body);
    return { ok: true, message: 'Reply posted' };
  }

  async resolveThread(args: { repo: string; number: number; threadId: string }): Promise<ActionResult> {
    this.inline.setResolved(args.threadId, true);
    return { ok: true, message: 'Thread resolved' };
  }

  async unresolveThread(args: { repo: string; number: number; threadId: string }): Promise<ActionResult> {
    this.inline.setResolved(args.threadId, false);
    return { ok: true, message: 'Thread reopened' };
  }

  async editDraftComment(args: { repo: string; number: number; commentId: string; body: string }): Promise<ActionResult> {
    return this.inline.editDraft(args.commentId, args.body)
      ? { ok: true, message: 'Draft updated' }
      : { ok: false, message: 'No such draft' };
  }

  async deleteDraftComment(args: { repo: string; number: number; commentId: string }): Promise<ActionResult> {
    return this.inline.deleteDraft(args.commentId)
      ? { ok: true, message: 'Draft deleted' }
      : { ok: false, message: 'No such draft' };
  }

  async discardPendingReview(_ref: PrRef): Promise<ActionResult> {
    this.inline.close();
    return { ok: true, message: 'Pending review discarded' };
  }

  async comment(ref: PrRef, body: string): Promise<ActionResult> {
    return log(`post comment on ${ref.repo}#${ref.number} (${body.length} chars)`);
  }

  /** Release PRs go head into base per the settings; every other fixture PR goes into the release head. */
  private refsOf(ref: PrRef, title: string): { title: string; base: string; head: string } {
    const { base, head: releaseHead, titleContains } = this.settings.releaseMerge;
    if (title.toLowerCase().includes(titleContains.toLowerCase())) return { title, base, head: releaseHead };
    const head = is310(ref) ? 'crew/acmeapi-data-read-bonus' : `feature/${ref.number}`;
    return { title, base: releaseHead, head };
  }

  async merge(ref: PrRef): Promise<ActionResult> {
    const { title, base, head } = this.refsOf(ref, this.find(ref).title);
    return log(`enable auto-merge (${mergeMethodFor(title, base, head, this.settings)}) on ${ref.repo}#${ref.number}`);
  }

  async markReady(ref: PrRef): Promise<ActionResult> {
    const pr = this.find(ref);
    if (!pr.isDraft) return { ok: true, message: 'Already ready for review' };
    this.readied.add(pr.id);
    return log(`mark ${ref.repo}#${ref.number} ready for review`);
  }

  async rerun(args: { repo: string; number: number; runId: number; mode: RerunMode }): Promise<ActionResult> {
    const path = args.mode === 'failed' ? 'rerun-failed-jobs' : 'rerun';
    return log(`POST /repos/${args.repo}/actions/runs/${args.runId}/${path}`);
  }

  /** Fixture preview: the text HTML-escaped inside one paragraph. No network call. */
  async renderMarkdown(args: { repo: string; text: string }): Promise<{ html: string }> {
    const escaped = args.text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return { html: `<p>${escaped}</p>` };
  }

  async adminMerge(ref: PrRef): Promise<ActionResult> {
    const refs = this.refsOf(ref, this.find(ref).title);
    const args = adminMergeArgs(ref.repo, ref.number, refs, this.settings);
    return log(`run gh ${args.join(' ')}`);
  }

  async markSeen(mark: SeenMark): Promise<void> {
    this.openedIds.add(mark.id);
  }

  issues(state: StateQuery): Promise<IssueInboxData> {
    return this.issueData.list(state);
  }

  async closed(
    kind: ClosedKind,
    window: ClosedWindow,
    after: string | undefined,
    state: StateQuery,
  ): Promise<ClosedPage<ClosedPr> | ClosedPage<ClosedIssue>> {
    console.log(`[fixtures] would call Closed ${kind} window=${window}d after=${after ?? '-'}`);
    const rate = this.rate(4790);
    if (state === 'closed-empty') return { items: [], hasMore: false, rate };
    const now = this.born;
    return kind === 'prs'
      ? pageOf(closedFixturePrs(now), window, after, now, rate)
      : pageOf(this.issueData.closedList(), window, after, now, rate);
  }

  issueDetail(ref: PrRef, state: StateQuery): Promise<IssueDetail> {
    return this.issueData.detail(ref, state);
  }

  repoMeta(repo: string, _state: StateQuery): Promise<RepoMeta> {
    return this.issueData.meta(repo);
  }

  async mentionable(repo: string, _cursor: string | undefined, _state: StateQuery): Promise<MentionablePage> {
    return { repo, people: FIXTURE_MENTIONABLE, hasNextPage: false };
  }

  async lookup(number: number, repos: readonly string[], _state: StateQuery): Promise<NumberHit[]> {
    const asked = new Set(repos);
    return UNLISTED.filter((h) => h.number === number && asked.has(h.repo)).map((h) => ({
      ...h,
      url: `https://github.com/${h.repo}/${h.kind === 'pr' ? 'pull' : 'issues'}/${h.number}`,
    }));
  }

  issueAction(action: IssueAction): Promise<IssueActionResult> {
    return this.issueData.act(action);
  }

  async image(_target: ImageTarget): Promise<FetchedImage> {
    return { bytes: FIXTURE_PNG, contentType: 'image/png' };
  }

  /** Never touches the network; every upload gets the same stand-in asset URL. */
  async uploadImage(_repo: string, _name: string, _type: UploadType, _bytes: Uint8Array): Promise<UploadResult> {
    return { url: 'https://github.com/user-attachments/assets/00000000-0000-0000-0000-000000000000' };
  }

  async markIssueSeen(mark: IssueSeenMark): Promise<void> {
    this.issueData.markSeen(mark);
  }
}
