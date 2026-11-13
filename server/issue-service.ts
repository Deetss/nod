import type {
  IssueAction,
  IssueActionResult,
  IssueDetail,
  IssueInboxData,
  IssueSummary,
  RepoMeta,
  SubIssueAction,
} from '../shared/issue-types';
import type { ProjectStatus } from '../shared/project-status';
import type { Settings } from '../shared/settings';
import type { RateInfo, Stale } from '../shared/types';
import { ProjectConfig, type ResolvedProject } from './project-config';
import { ApiError, type GithubClient } from './github-client';
import { IssueCache } from './issue-cache';
import {
  ADD_ASSIGNEES,
  ADD_COMMENT,
  ADD_LABELS,
  ADD_PROJECT_ITEM,
  ADD_SUB_ISSUE,
  ISSUE_ID_QUERY,
  REMOVE_SUB_ISSUE,
  REPRIORITIZE_SUB_ISSUE,
  SET_PROJECT_STATUS,
  CLOSE_ISSUE,
  CREATE_ISSUE,
  CREATE_LABEL,
  ISSUE_COMMENTS_QUERY,
  ISSUE_DETAIL_QUERY,
  ISSUE_INBOX_QUERY,
  issueFullSearch,
  mentionFullSearch,
  MENTION_QUERY,
  REMOVE_ASSIGNEES,
  REMOVE_LABELS,
  REOPEN_ISSUE,
  REPO_ID_QUERY,
  REPO_META_QUERY,
  UPDATE_MILESTONE,
  UPDATE_TITLE,
} from './issue-queries';
import { toIssueDetail, toIssueSummary, type RawIssue, type RawIssueDetail } from './issue-map';
import {
  applyIssuesDelta,
  applyIssuesFull,
  EMPTY_ISSUE_STATE,
  issueKey,
  type IssueState,
} from './issue-state';
import { CLOSED_TTL_MS } from './inbox-state';
import type { IssueSeenMark, PrRef } from './provider';
import type { SeenStore } from './seen';
import { hasBotLabel } from '../shared/bot';
import { repoName, repoOwner } from '../shared/repo-name';

interface Page<N> {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: (N | Record<string, never>)[];
}

/** A mention hit; `state` tells an open issue from a closed one. */
export interface RawMention {
  id: string;
  state: string;
}

interface SyncResponse {
  viewer?: { login: string; id?: string };
  search: Page<RawIssue>;
}
interface MentionResponse {
  search: Page<RawMention>;
}
interface DetailResponse {
  viewer: { login: string };
  rateLimit: RateInfo;
  repository: { issue: RawIssueDetail | null } | null;
}
interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
interface MetaResponse {
  repository: {
    labels?: { pageInfo?: PageInfo; nodes: { id: string; name: string; color: string }[] };
    milestones?: { pageInfo?: PageInfo; nodes: { id: string; title: string }[] };
    assignableUsers?: { pageInfo?: PageInfo; nodes: { id: string; login: string; avatarUrl?: string }[] };
    issueTemplates: { body: string }[] | null;
  } | null;
}
interface CommentsResponse {
  repository: { issue: { comments: RawIssueDetail['comments'] } | null } | null;
}

const uniqueBy = <T>(items: T[], key: (t: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((t) => {
    const k = key(t);
    return seen.has(k) ? false : (seen.add(k), true);
  });
};

/** Drops repeated labels, milestones and users, which older cached meta can hold. */
const dedupeMeta = (m: RepoMeta): RepoMeta => ({
  ...m,
  labels: uniqueBy(m.labels, (l) => l.id ?? l.name),
  milestones: uniqueBy(m.milestones, (x) => x.id ?? x.title),
  users: uniqueBy(m.users, (u) => u.id),
});

/** The cursor for the next page, or null when the connection is complete. */
const nextCursor = (p?: PageInfo): string | null => (p?.hasNextPage ? p.endCursor : null);

const has = <N extends object>(n: N | Record<string, never>): n is N => 'id' in n;

/** The issue half of the provider: list state, detail cache, repo metadata and writes. */
export class IssueService {
  state: IssueState = EMPTY_ISSUE_STATE;
  /** The viewer's node id, read free from every sync query. Start work assigns it. */
  viewerId: string | undefined;
  private loading: Promise<void> | undefined;
  private readonly repoIds = new Map<string, string>();

  constructor(
    private readonly client: GithubClient,
    private readonly seen: SeenStore,
    private readonly cache: IssueCache,
    private readonly now: () => number,
    readonly project: ProjectConfig = new ProjectConfig(),
  ) {}

  get settings(): Settings {
    return this.project.settings;
  }

  load(): Promise<void> {
    this.loading ??= (async () => {
      this.state = await this.cache.loadState();
      await this.project.load();
      await this.expire();
    })();
    return this.loading;
  }

  private async expire(): Promise<void> {
    const expired = Object.entries(this.state.closed)
      .filter(([, at]) => this.now() - at > CLOSED_TTL_MS)
      .map(([key]) => key);
    if (expired.length === 0) return;
    const closed = { ...this.state.closed };
    for (const key of expired) delete closed[key];
    this.state = { ...this.state, closed };
    await this.cache.prune(expired);
  }

  private async pages<N extends object>(
    query: string,
    search: string,
    label: string,
    pick: (data: SyncResponse & MentionResponse) => Page<N>,
    from: string | null = null,
  ): Promise<{ viewer: string; found: N[] }> {
    const found: N[] = [];
    let viewer = '';
    let after: string | null = from;
    for (;;) {
      const data: SyncResponse & MentionResponse = await this.client.graphql(
        query,
        query === ISSUE_INBOX_QUERY ? { q: search, after, statusField: this.settings.project.statusField } : { q: search, after },
        label,
      );
      viewer = data.viewer?.login ?? viewer;
      this.viewerId = data.viewer?.id ?? this.viewerId;
      const page = pick(data);
      found.push(...page.nodes.filter(has));
      if (!page.pageInfo.hasNextPage) break;
      after = page.pageInfo.endCursor;
    }
    return { viewer, found };
  }

  /** Sweeps every open issue and every open mention. */
  async full(start: number): Promise<void> {
    const issues = await this.pages<RawIssue>(
      ISSUE_INBOX_QUERY,
      issueFullSearch(this.settings.orgs),
      'IssueSync:full',
      (d) => d.search as Page<RawIssue>,
    );
    const mentions = await this.pages<RawMention>(
      MENTION_QUERY,
      mentionFullSearch(this.settings.orgs),
      'IssueMentions:full',
      (d) => d.search as unknown as Page<RawMention>,
    );
    this.state = applyIssuesFull(
      this.state,
      issues.viewer,
      issues.found.map((r) => toIssueSummary(r, this.settings)),
      mentions.found.map((m) => m.id),
      start,
    );
    await this.settle();
  }

  /** Delta hits past the poll's first page, continuing from its cursor. */
  async moreIssues(search: string, after: string | null): Promise<RawIssue[]> {
    const r = await this.pages<RawIssue>(
      ISSUE_INBOX_QUERY,
      search,
      'Poll:issues',
      (d) => d.search as Page<RawIssue>,
      after,
    );
    return r.found;
  }

  async moreMentions(search: string, after: string | null): Promise<RawMention[]> {
    const r = await this.pages<RawMention>(
      MENTION_QUERY,
      search,
      'Poll:mentions',
      (d) => d.search as unknown as Page<RawMention>,
      after,
    );
    return r.found;
  }

  /** Merges the issue part of a poll response. */
  async applyPoll(viewer: string, raw: RawIssue[], mentions: RawMention[], start: number): Promise<void> {
    this.state = applyIssuesDelta(
      this.state,
      viewer,
      raw.map((r) => ({ issue: toIssueSummary(r, this.settings), open: r.state === 'OPEN', closedAt: r.closedAt })),
      mentions.map((m) => ({ id: m.id, open: m.state === 'OPEN' })),
      start,
    );
    await this.settle();
  }

  private async settle(): Promise<void> {
    await this.expire();
    await this.cache.saveState(this.state);
  }

  private rate(): RateInfo | undefined {
    return this.client.graphqlRate ?? this.client.lastRate;
  }

  async snapshot(stale: Stale | undefined): Promise<IssueInboxData> {
    await this.load();
    const issues = await this.seen.annotateIssues(Object.values(this.state.issues));
    return {
      viewer: this.state.viewer,
      issues,
      mentionedIds: this.state.mentioned,
      projectStatus: this.project.enabled,
      syncedAt: this.state.lastSync,
      rate: this.rate(),
      ...(stale ? { stale } : {}),
    };
  }

  private listed(ref: PrRef): IssueSummary | undefined {
    return Object.values(this.state.issues).find((i) => i.repo === ref.repo && i.number === ref.number);
  }

  /** Detail from the cache while the issue's updatedAt has not moved, one query otherwise. */
  async detail(ref: PrRef, hit: (what: string) => void): Promise<IssueDetail> {
    await this.load();
    const key = issueKey(ref);
    const listed = this.listed(ref);
    const entry = await this.cache.getDetail(key);
    let detail: IssueDetail;
    // Entries cached before sub-issues existed lack the field and are refetched.
    const fresh = entry && Array.isArray(entry.detail.subIssues);
    if (entry && fresh && listed && Date.parse(entry.updatedAt) >= Date.parse(listed.updatedAt)) {
      hit(`issue ${key}`);
      detail = entry.detail;
    } else {
      const data = await this.client.graphql<DetailResponse>(ISSUE_DETAIL_QUERY, {
        owner: repoOwner(ref.repo),
        name: repoName(ref.repo),
        number: ref.number,
        statusField: this.settings.project.statusField,
      });
      const raw = data.repository?.issue;
      if (!raw) throw new ApiError('Issue not found', 'http', 404);
      for (let after = nextCursor(raw.comments.pageInfo); after; ) {
        const more: CommentsResponse = await this.client.graphql(ISSUE_COMMENTS_QUERY, {
          owner: repoOwner(ref.repo),
          name: repoName(ref.repo),
          number: ref.number,
          after,
        });
        const page = more.repository?.issue?.comments;
        if (!page) break;
        raw.comments.nodes.push(...page.nodes);
        after = nextCursor(page.pageInfo);
      }
      detail =toIssueDetail(raw, this.settings);
      await this.cache.putDetail(key, { id: raw.id, updatedAt: raw.updatedAt, detail });
      if (listed && raw.state === 'OPEN') {
        this.state = { ...this.state, issues: { ...this.state.issues, [raw.id]: detail.summary } };
        await this.cache.saveState(this.state);
      }
    }
    const [summary] = await this.seen.annotateIssues([detail.summary]);
    const seenCount = await this.seen.seenCommentCount(detail.summary.id);
    return {
      ...detail,
      summary: summary ?? detail.summary,
      unseenFrom: seenCount === undefined ? 0 : Math.min(seenCount, detail.comments.length),
      rate: this.rate(),
    };
  }

  async repoMeta(repo: string): Promise<RepoMeta> {
    const cached = await this.cache.getMeta(repo, this.now());
    if (cached) return dedupeMeta(cached);
    const labels: RepoMeta['labels'] = [];
    const milestones: RepoMeta['milestones'] = [];
    const users: RepoMeta['users'] = [];
    let template: string | undefined;
    let cursors = { labelsAfter: null as string | null, milestonesAfter: null as string | null, usersAfter: null as string | null };
    const want = { labels: true, milestones: true, users: true };
    while (want.labels || want.milestones || want.users) {
      const data = await this.client.graphql<MetaResponse>(REPO_META_QUERY, {
        owner: repoOwner(repo),
        name: repoName(repo),
        ...cursors,
        wantLabels: want.labels,
        wantMilestones: want.milestones,
        wantUsers: want.users,
      });
      const r = data.repository;
      if (!r) throw new ApiError('Repository not found', 'http', 404);
      if (want.labels && r.labels) labels.push(...r.labels.nodes);
      if (want.milestones && r.milestones) milestones.push(...r.milestones.nodes);
      if (want.users && r.assignableUsers) users.push(...r.assignableUsers.nodes);
      template ??= r.issueTemplates?.[0]?.body;
      cursors = {
        labelsAfter: nextCursor(r.labels?.pageInfo),
        milestonesAfter: nextCursor(r.milestones?.pageInfo),
        usersAfter: nextCursor(r.assignableUsers?.pageInfo),
      };
      want.labels = want.labels && cursors.labelsAfter !== null;
      want.milestones = want.milestones && cursors.milestonesAfter !== null;
      want.users = want.users && cursors.usersAfter !== null;
    }
    const meta = dedupeMeta({ repo, labels, milestones, users, template, fetchedAt: this.now() });
    await this.cache.putMeta(meta);
    return meta;
  }

  private async nodeId(ref: PrRef): Promise<string> {
    await this.load();
    const id = this.listed(ref)?.id ?? (await this.cache.getDetail(issueKey(ref)))?.id;
    if (!id) throw new Error(`Issue ${ref.repo} #${ref.number} is not loaded. Refresh and retry.`);
    return id;
  }

  private async ids<T extends { id: string }>(
    what: string,
    wanted: string[],
    pool: T[],
    name: (t: T) => string,
  ): Promise<string[]> {
    return wanted.map((w) => {
      const hit = pool.find((p) => name(p).toLowerCase() === w.toLowerCase());
      if (!hit) throw new Error(`Unknown ${what} "${w}"`);
      return hit.id;
    });
  }

  private async repoId(repo: string): Promise<string> {
    const known = this.repoIds.get(repo);
    if (known) return known;
    const data = await this.client.graphql<{ repository: { id: string } | null }>(REPO_ID_QUERY, {
      owner: repoOwner(repo),
      name: repoName(repo),
    });
    if (!data.repository) throw new ApiError('Repository not found', 'http', 404);
    this.repoIds.set(repo, data.repository.id);
    return data.repository.id;
  }

  /** Runs one write. Callers have already passed the mutation guard. */
  async act(a: IssueAction): Promise<IssueActionResult> {
    if (a.type === 'create') return this.create(a);
    if (a.type === 'create-label') return this.createLabel(a.repo, a.name);
    const ref = { repo: a.repo, number: a.number };
    const id = await this.nodeId(ref);
    if (isSubAction(a)) return this.subAct(a, ref, id);
    const g = this.client;
    /** How the listed copy changes once the write succeeds. */
    let patch: ((i: IssueSummary) => IssueSummary) | undefined;
    switch (a.type) {
      case 'comment':
        await g.graphql(ADD_COMMENT, { id, body: a.body });
        break;
      case 'close':
        if (a.comment?.trim()) await g.graphql(ADD_COMMENT, { id, body: a.comment });
        await g.graphql(CLOSE_ISSUE, { id, reason: a.reason });
        await this.dropListed(id, ref);
        break;
      case 'reopen':
        await g.graphql(REOPEN_ISSUE, { id });
        await this.relist(ref);
        break;
      case 'labels': {
        const meta = await this.repoMeta(a.repo);
        const [add, remove] = await Promise.all([
          this.ids('label', a.add, meta.labels, (l) => l.name),
          this.ids('label', a.remove, meta.labels, (l) => l.name),
        ]);
        if (add.length) await g.graphql(ADD_LABELS, { id, labels: add });
        if (remove.length) await g.graphql(REMOVE_LABELS, { id, labels: remove });
        const gone = new Set(a.remove.map((n) => n.toLowerCase()));
        const added = a.add
          .map((n) => meta.labels.find((l) => l.name.toLowerCase() === n.toLowerCase()))
          .filter((l): l is NonNullable<typeof l> => l !== undefined)
          .map((l) => ({ name: l.name, color: l.color }));
        patch = (i) => ({
          ...i,
          labels: [
            ...i.labels.filter((l) => !gone.has(l.name.toLowerCase())),
            ...added.filter((l) => !i.labels.some((x) => x.name.toLowerCase() === l.name.toLowerCase())),
          ],
        });
        break;
      }
      case 'assignees': {
        const meta = await this.repoMeta(a.repo);
        const [add, remove] = await Promise.all([
          this.ids('user', a.add, meta.users, (u) => u.login),
          this.ids('user', a.remove, meta.users, (u) => u.login),
        ]);
        if (add.length) await g.graphql(ADD_ASSIGNEES, { id, users: add });
        if (remove.length) await g.graphql(REMOVE_ASSIGNEES, { id, users: remove });
        const gone = new Set(a.remove.map((n) => n.toLowerCase()));
        patch = (i) => ({
          ...i,
          assignees: [
            ...i.assignees.filter((u) => !gone.has(u.toLowerCase())),
            ...a.add.filter((u) => !i.assignees.some((x) => x.toLowerCase() === u.toLowerCase())),
          ],
        });
        break;
      }
      case 'milestone': {
        const meta = await this.repoMeta(a.repo);
        const [milestone] =
          a.milestone === null ? [null] : await this.ids('milestone', [a.milestone], meta.milestones, (m) => m.title);
        await g.graphql(UPDATE_MILESTONE, { id, milestone });
        break;
      }
      case 'title':
        await g.graphql(UPDATE_TITLE, { id, title: a.title });
        patch = (i) => ({ ...i, title: a.title });
        break;
      case 'bot': {
        if (!this.settings.bot.enabled) throw new Error('no bot is configured');
        const added = await this.handToBot(a, id);
        patch = (i) => ({ ...i, labels: hasBotLabel(i.labels, this.settings.bot) ? i.labels : [...i.labels, added] });
        break;
      }
      case 'start':
        await this.startWork(ref, id);
        break;
      case 'stop':
        await this.setStatus(ref, id, this.settings.project.options.ready);
        break;
      case 'status':
        await this.setStatus(ref, id, a.status);
        break;
    }
    if (patch) await this.patchListedWith(id, patch);
    await this.cache.invalidate(issueKey(ref));
    const where = `${a.repo} #${a.number}`;
    return {
      ok: true,
      message: a.type === 'bot' ? `${this.settings.bot.name} picked up ${where}` : `${describe(a)} on ${where}`,
    };
  }

  /** Node id of an issue that may be neither listed nor cached, such as one in another repo. */
  private async anyIssueId(ref: PrRef): Promise<string> {
    const known = this.listed(ref)?.id ?? (await this.cache.getDetail(issueKey(ref)))?.id;
    if (known) return known;
    const data = await this.client.graphql<{ repository: { issue: { id: string } | null } | null }>(ISSUE_ID_QUERY, {
      owner: repoOwner(ref.repo),
      name: repoName(ref.repo),
      number: ref.number,
    });
    const id = data.repository?.issue?.id;
    if (!id) throw new ApiError(`Issue ${ref.repo} #${ref.number} not found`, 'http', 404);
    return id;
  }

  /**
   * One sub-issue write on the parent `ref`. Remove only unlinks: the child is never closed.
   * The parent's detail is dropped so the next read carries the new order and progress.
   */
  private async subAct(a: SubIssueAction, ref: PrRef, id: string): Promise<IssueActionResult> {
    const g = this.client;
    const parentKey = issueKey(ref);
    const children = (await this.cache.getDetail(parentKey))?.detail.subIssues ?? [];
    const child = (childId: string) => children.find((c) => c.id === childId);
    let result: IssueActionResult;
    switch (a.type) {
      case 'sub-create': {
        const data = await g.graphql<{ createIssue: { issue: { number: number } } }>(CREATE_ISSUE, {
          repo: await this.repoId(a.childRepo),
          title: a.title,
          body: a.body,
          labels: [],
          users: [],
          parent: id,
        });
        const number = data.createIssue.issue.number;
        result = { ok: true, message: `Created ${a.childRepo} #${number} under #${a.number}`, number };
        break;
      }
      case 'sub-add': {
        const childRef = { repo: a.childRepo, number: a.childNumber };
        const sub = await this.anyIssueId(childRef);
        await g.graphql(ADD_SUB_ISSUE, { id, sub, replace: a.replaceParent });
        await this.patchListedWith(sub, (i) => ({ ...i, parent: { repo: a.repo, number: a.number } }));
        await this.cache.invalidate(issueKey(childRef));
        result = { ok: true, message: `Added ${a.childRepo} #${a.childNumber} to #${a.number}` };
        break;
      }
      case 'sub-move': {
        await g.graphql(REPRIORITIZE_SUB_ISSUE, { id, sub: a.childId, after: a.afterId ?? null, before: a.beforeId ?? null });
        const c = child(a.childId);
        result = { ok: true, message: c ? `Moved #${c.number}` : 'Sub-issue moved' };
        break;
      }
      case 'sub-remove': {
        await g.graphql(REMOVE_SUB_ISSUE, { id, sub: a.childId });
        await this.patchListedWith(a.childId, ({ parent: _gone, ...rest }) => rest);
        const c = child(a.childId);
        if (c) await this.cache.invalidate(issueKey(c));
        result = { ok: true, message: `Removed ${c ? `#${c.number}` : 'sub-issue'} from #${a.number}` };
        break;
      }
    }
    await this.cache.invalidate(parentKey);
    return result;
  }

  /** A closed issue leaves the open list at once, as a delta sync would remove it. */
  private async dropListed(id: string, ref: PrRef): Promise<void> {
    const listed = this.state.issues[id];
    if (!listed) return;
    const { [id]: _gone, ...issues } = this.state.issues;
    this.state = {
      ...this.state,
      issues,
      mentioned: this.state.mentioned.filter((m) => m !== id),
      closed: { ...this.state.closed, [issueKey(ref)]: this.now() },
    };
    await this.cache.saveState(this.state);
  }

  /** A reopened issue returns to the list from its cached summary; otherwise the next sync adds it. */
  private async relist(ref: PrRef): Promise<void> {
    const summary = (await this.cache.getDetail(issueKey(ref)))?.detail.summary;
    if (!summary) return;
    const { [issueKey(ref)]: _was, ...closed } = this.state.closed;
    this.state = {
      ...this.state,
      issues: { ...this.state.issues, [summary.id]: { ...summary, state: 'open' } },
      closed,
    };
    await this.cache.saveState(this.state);
  }

  private async patchListedWith(id: string, fn: (i: IssueSummary) => IssueSummary): Promise<void> {
    const listed = this.state.issues[id];
    if (!listed) return;
    this.state = { ...this.state, issues: { ...this.state.issues, [id]: fn(listed) } };
    await this.cache.saveState(this.state);
  }

  private resolvedProject(): ResolvedProject {
    const p = this.project.resolved;
    if (!p) throw new Error('Project status is not available. Check the project number and Status options.');
    return p;
  }

  /** Keeps the listed copy in step with a write, so the next snapshot shows it. */
  private async patchListed(id: string, patch: Partial<IssueSummary>): Promise<void> {
    const listed = this.state.issues[id];
    if (!listed) return;
    this.state = { ...this.state, issues: { ...this.state.issues, [id]: { ...listed, ...patch } } };
    await this.cache.saveState(this.state);
  }

  /** The issue's item on the project; adds the issue when it is not there yet. */
  private async ensureItem(p: ResolvedProject, id: string, listed: IssueSummary | undefined): Promise<string> {
    if (listed?.projectItemId) return listed.projectItemId;
    const data = await this.client.graphql<{ addProjectV2ItemById: { item: { id: string } } }>(ADD_PROJECT_ITEM, {
      project: p.projectId,
      content: id,
    });
    return data.addProjectV2ItemById.item.id;
  }

  private async setStatus(ref: PrRef, id: string, status: ProjectStatus): Promise<void> {
    const p = this.resolvedProject();
    const listed = this.listed(ref);
    const item = await this.ensureItem(p, id, listed);
    if (listed?.projectItemId !== item || listed?.status !== status) {
      await this.client.graphql(SET_PROJECT_STATUS, {
        project: p.projectId,
        item,
        field: p.fieldId,
        option: p.options[status],
      });
    }
    await this.patchListed(id, { status, projectItemId: item });
  }

  /**
   * Start work: assign the viewer, add the issue to the project, set Status to the in-progress option.
   * Each step is skipped when the listed copy shows it is already done.
   */
  async startWork(ref: PrRef, id: string): Promise<void> {
    const p = this.resolvedProject();
    const listed = this.listed(ref);
    const viewer = this.state.viewer;
    const patch: Partial<IssueSummary> = {};
    if (!listed?.assignees.includes(viewer)) {
      const users = this.viewerId
        ? [this.viewerId]
        : await this.ids('user', [viewer], (await this.repoMeta(ref.repo)).users, (u) => u.login);
      await this.client.graphql(ADD_ASSIGNEES, { id, users });
      patch.assignees = [...(listed?.assignees ?? []), viewer];
      await this.patchListed(id, patch);
    }
    const item = await this.ensureItem(p, id, listed);
    const inProgress = this.settings.project.options.inProgress;
    patch.projectItemId = item;
    if (listed?.status !== inProgress) {
      await this.client.graphql(SET_PROJECT_STATUS, {
        project: p.projectId,
        item,
        field: p.fieldId,
        option: p.options[inProgress],
      });
    }
    patch.status = inProgress;
    await this.patchListed(id, patch);
  }

  /** Creates a label. Refuses a name the repo already has, compared case-blind. */
  async createLabel(repo: string, rawName: string, color = 'ededed', description?: string): Promise<IssueActionResult> {
    const made = await this.makeLabel(repo, rawName, color, description);
    return { ok: true, message: `Label ${made.name} created on ${repo}`, label: { name: made.name, color: made.color } };
  }

  private async makeLabel(repo: string, rawName: string, color: string, description?: string) {
    const name = rawName.trim();
    if (name.length < 1 || name.length > 50) throw new Error('Label name must be 1 to 50 characters');
    const meta = await this.repoMeta(repo);
    if (meta.labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Label "${name}" already exists`);
    }
    const data = await this.client.graphql<{ createLabel: { label: { id: string; name: string; color: string } } }>(
      CREATE_LABEL,
      { repo: await this.repoId(repo), name, color, description },
    );
    await this.cache.invalidateMeta(repo);
    return data.createLabel.label;
  }

  /** Adds the bot's label to the issue, creating it in the repo first when it is missing. */
  private async handToBot(a: { repo: string; number: number }, id: string): Promise<IssueSummary['labels'][number]> {
    const b = this.settings.bot;
    const meta = await this.repoMeta(a.repo);
    let label = meta.labels.find((l) => l.name.toLowerCase() === b.label.toLowerCase());
    if (!label) {
      try {
        label = await this.makeLabel(a.repo, b.label, b.labelColor, `Hand this issue to ${b.name}`);
      } catch (e) {
        throw new Error(`could not create the ${b.label} label (${e instanceof Error ? e.message : 'request failed'})`);
      }
    }
    try {
      await this.client.graphql(ADD_LABELS, { id, labels: [label.id] });
    } catch (e) {
      throw new Error(`could not add the ${b.label} label (${e instanceof Error ? e.message : 'request failed'})`);
    }
    return { name: label.name, color: label.color };
  }

  private async create(a: Extract<IssueAction, { type: 'create' }>): Promise<IssueActionResult> {
    const [repo, meta] = await Promise.all([this.repoId(a.repo), this.repoMeta(a.repo)]);
    const [labels, users] = await Promise.all([
      this.ids('label', a.labels, meta.labels, (l) => l.name),
      this.ids('user', a.assignees, meta.users, (u) => u.login),
    ]);
    const data = await this.client.graphql<{ createIssue: { issue: { number: number } } }>(CREATE_ISSUE, {
      repo,
      title: a.title,
      body: a.body,
      labels,
      users,
    });
    const number = data.createIssue.issue.number;
    return { ok: true, message: `Created ${a.repo} #${number}`, number };
  }

  async markSeen(mark: IssueSeenMark): Promise<void> {
    await this.seen.mark(mark);
  }
}

const isSubAction = (a: IssueAction): a is SubIssueAction => a.type.startsWith('sub-');

function describe(a: Exclude<IssueAction, { type: 'create' | 'create-label' | 'bot' } | SubIssueAction>): string {
  switch (a.type) {
    case 'comment':
      return 'Comment posted';
    case 'close':
      return a.reason === 'COMPLETED' ? 'Closed as completed' : 'Closed as not planned';
    case 'reopen':
      return 'Reopened';
    case 'labels':
      return 'Labels updated';
    case 'assignees':
      return 'Assignees updated';
    case 'milestone':
      return 'Milestone updated';
    case 'title':
      return 'Title updated';
    case 'start':
      return 'Started work';
    case 'stop':
      return 'Stopped work';
    case 'status':
      return `Status set to ${a.status}`;
  }
}
