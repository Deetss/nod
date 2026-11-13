import type { ClosedIssue } from '../shared/closed';
import type {
  CloseReason,
  IssueAction,
  IssueActionResult,
  IssueComment,
  IssueDetail,
  IssueInboxData,
  IssueLabel,
  IssueSummary,
  ParentIssue,
  RepoMeta,
  SubIssue,
  SubIssueAction,
  SubIssueState,
  TimelineEvent,
} from '../shared/issue-types';
import { progressOf } from '../shared/sub-issues';
import { SUB_ISSUE_SAMPLES, SubTree } from './sub-issue-fixtures';
import { BOT_SAMPLES, BOT_THREADS, botFixtureTag } from './bot-fixtures';
import type { ProjectStatus } from '../shared/project-status';
import { DEFAULT_SETTINGS, statusNames, type Settings } from '../shared/settings';
import type { RateInfo } from '../shared/types';
import type { IssueSeenMark, PrRef, StateQuery } from './provider';
import { FIXTURE_VIEWER } from './fixture-data';

/** Synthetic sample issues. Authors are limited to the fixture viewer, build-bot, dependabot[bot] and the fixture bot. */

const HOUR = 3_600_000;
const VIEWER = FIXTURE_VIEWER;

export const LABELS: Record<string, IssueLabel> = {
  bug: { name: 'bug', color: 'd73a4a' },
  enhancement: { name: 'enhancement', color: 'a2eeef' },
  security: { name: 'security', color: 'b60205' },
  'tech-debt': { name: 'tech-debt', color: 'fbca04' },
  'needs-triage': { name: 'needs-triage', color: 'ededed' },
};

export interface Seed {
  repo: string;
  number: number;
  title: string;
  author: string;
  ageH: number;
  openedH: number;
  labels: string[];
  assignees: string[];
  comments: number;
  seen: IssueSummary['seen'];
  note?: string;
  status?: ProjectStatus;
  /** Closed at start, with this reason. Closed issues stay out of the list. */
  closed?: 'completed' | 'not-planned';
  /** Hours since it closed. Closed seeds with this show in the closed section. */
  closedH?: number;
  /** Description HTML; a stand-in otherwise. */
  body?: string;
}

const SAMPLES: Seed[] = [
  { repo: 'acme-co/acme-api', number: 412, title: 'Unit status filter ignores closed communities', author: FIXTURE_VIEWER, ageH: 2, openedH: 48, labels: ['bug'], assignees: [FIXTURE_VIEWER], comments: 4, seen: 'updated', note: '1 new comment', status: 'In progress' },
  { repo: 'acme-co/acme-web', number: 288, title: 'CSV export drops elevation column', author: 'build-bot', ageH: 24, openedH: 72, labels: ['bug'], assignees: [FIXTURE_VIEWER], comments: 1, seen: 'new', status: 'Ready' },
  { repo: 'acme-dev/tools', number: 9, title: 'Rotate agent token on service restart', author: FIXTURE_VIEWER, ageH: 48, openedH: 120, labels: ['security'], assignees: [FIXTURE_VIEWER], comments: 0, seen: 'seen', status: 'In progress' },
  { repo: 'acme-co/acme-api', number: 398, title: 'Add audit log for ACPR approvals', author: FIXTURE_VIEWER, ageH: 144, openedH: 200, labels: ['enhancement'], assignees: [], comments: 2, seen: 'seen', status: 'Ready' },
  { repo: 'acme-co/acme-api', number: 405, title: 'Flaky rspec in data_read_token_spec', author: 'build-bot', ageH: 5, openedH: 30, labels: ['tech-debt'], assignees: [], comments: 3, seen: 'new', status: 'In review' },
  { repo: 'acme-dev/tools', number: 63, title: 'Worker report omits branch when blocked', author: 'build-bot', ageH: 1, openedH: 1, labels: [], assignees: [], comments: 0, seen: 'new' },
  { repo: 'acme-dev/notes', number: 17, title: 'Banner export times out on large communities', author: 'build-bot', ageH: 4, openedH: 4, labels: [], assignees: [FIXTURE_VIEWER], comments: 0, seen: 'new', status: 'In progress' },
  { repo: 'acme-dev/notes', number: 10, title: 'Banner preview ignores the elevation photo', author: 'build-bot', ageH: 400, openedH: 900, labels: ['bug'], assignees: [], comments: 1, seen: 'seen', closed: 'not-planned', closedH: 400 },
  { repo: 'acme-co/acme-api', number: 402, title: 'Retry webhook deliveries after 5xx', author: FIXTURE_VIEWER, ageH: 48, openedH: 120, labels: ['bug'], assignees: [FIXTURE_VIEWER], comments: 1, seen: 'seen', closed: 'completed', closedH: 48, body: '<p>Deliveries that fail with a 5xx are retried with backoff, up to five times.</p>' },
  { repo: 'acme-co/acme-web', number: 1366, title: 'Dark mode for the settings page', author: 'build-bot', ageH: 96, openedH: 300, labels: ['enhancement'], assignees: [], comments: 0, seen: 'seen', closed: 'not-planned', closedH: 96 },
  { repo: 'acme-co/acme-web', number: 1379, title: 'Fix null zone in calendar export', author: FIXTURE_VIEWER, ageH: 144, openedH: 200, labels: ['bug'], assignees: [FIXTURE_VIEWER], comments: 0, seen: 'seen', closed: 'completed', closedH: 144 },
  { repo: 'acme-co/acme-api', number: 355, title: 'Support XML export', author: FIXTURE_VIEWER, ageH: 288, openedH: 700, labels: ['enhancement'], assignees: [], comments: 0, seen: 'seen', closed: 'not-planned', closedH: 288 },
  { repo: 'acme-dev/tools', number: 31, title: 'Print the worker branch in the report footer', author: 'build-bot', ageH: 336, openedH: 500, labels: [], assignees: [], comments: 0, seen: 'seen', closed: 'completed', closedH: 336 },
  { repo: 'acme-co/acme-api', number: 338, title: 'Paginate the community list', author: FIXTURE_VIEWER, ageH: 600, openedH: 900, labels: ['enhancement'], assignees: [], comments: 2, seen: 'seen', closed: 'completed', closedH: 600 },
  { repo: 'acme-dev/notes', number: 14, title: 'Rename the banner export folder', author: 'build-bot', ageH: 1200, openedH: 1300, labels: [], assignees: [], comments: 0, seen: 'seen', closed: 'completed', closedH: 1200 },
  { repo: 'acme-co/acme-web', number: 1301, title: 'Drop IE11 polyfills', author: FIXTURE_VIEWER, ageH: 1800, openedH: 2000, labels: ['tech-debt'], assignees: [], comments: 0, seen: 'seen', closed: 'not-planned', closedH: 1800 },
  ...SUB_ISSUE_SAMPLES,
  ...BOT_SAMPLES,
];

const MENTIONED = ['acme-co/acme-api#405'];
const REPOS = ['acme-co/acme-api', 'acme-co/acme-web', 'acme-dev/notes', 'acme-dev/tools', 'acme-dev/tools', 'acme-dev/tools', 'acme-dev/notes'];
const TOPICS = [
  'Tidy swagger tags', 'Slow query on unit_sales', 'Color sheet export wording', 'Retry vendor callback',
  'Plot plan icon spacing', 'Upgrade solid_queue', 'Log inbound vendor calls', 'Filter keeps scroll position',
  'Document the approval chain', 'Index community_id', 'Remove unused feature flag', 'Cache unit lookups',
];
const FILLER_COUNT = 135;

function filler(n: number): Seed {
  const label = ['bug', 'enhancement', 'tech-debt', 'needs-triage'][n % 4] ?? 'bug';
  return {
    repo: REPOS[n % REPOS.length] ?? 'acme-co/acme-api',
    number: 100 + n,
    title: `${TOPICS[n % TOPICS.length]} (${n + 1})`,
    author: 'build-bot',
    ageH: 72 + n * 5,
    openedH: 200 + n * 5,
    labels: [label],
    assignees: ['build-bot'],
    comments: n % 3,
    seen: 'seen',
    status: n % 6 === 0 ? 'Ready' : n % 9 === 0 ? 'In review' : undefined,
  };
}

const PEOPLE = [FIXTURE_VIEWER, 'build-bot'];

const itemId = (i: { repo: string; number: number }): string => `PVTI_${i.repo}_${i.number}`;

/** Seeds name the default options; the configured name for the same board position is shown. */
function configuredStatus(name: string, settings: Settings): string {
  const at = statusNames(DEFAULT_SETTINGS).indexOf(name);
  return at < 0 ? name : (statusNames(settings)[at] ?? name);
}

function summary(s: Seed, now: number, settings: Settings): IssueSummary {
  return {
    id: `I_${s.repo}_${s.number}`,
    repo: s.repo,
    number: s.number,
    title: s.title,
    author: s.author,
    createdAt: new Date(now - s.openedH * HOUR).toISOString(),
    updatedAt: new Date(now - s.ageH * HOUR).toISOString(),
    url: `https://github.com/${s.repo}/issues/${s.number}`,
    state: 'open',
    labels: s.labels.map((l) => LABELS[l] ?? { name: l, color: '6e7167' }),
    assignees: s.assignees,
    commentCount: s.comments,
    seen: s.seen,
    updatedNote: s.note,
    ...(s.status ? { status: configuredStatus(s.status, settings), projectItemId: itemId(s) } : {}),
  };
}

const BODY_412 =
  '<h2>Summary</h2><p>The unit status filter returns units from communities that are marked closed.</p>' +
  '<h3>Steps to reproduce</h3><ol><li>Open Units and set Status to Available.</li>' +
  '<li>Units from a closed community still appear in the list.</li></ol>' +
  '<pre><code>GET /api/units?status=available</code></pre>' +
  '<p>Expected: closed communities are excluded from every status filter.</p>';

/** Author, age in hours, text, and the reason GitHub hid the comment, if it did. */
const COMMENTS_412: [string, number, string, string?][] = [
  ['build-bot', 24, 'Reproduced on staging. The filter joins communities but skips the closed flag.'],
  [FIXTURE_VIEWER, 6, 'Taking this one. Opening a PR against staging.'],
  ['build-bot', 3, 'Linked PR acme-co/acme-api #314 (draft).', 'outdated'],
  [FIXTURE_VIEWER, 2, 'Pushed a fix to crew/units-status-filter-closed. Ready for a look.'],
];

const COMMENTS_12: [string, number, string][] = [
  [FIXTURE_VIEWER, 120, 'Split into sub-issues so each piece can ship on its own. The worker queue goes first.'],
  ['build-bot', 60, 'Worker queue is merged. Logo caching is next.'],
  [FIXTURE_VIEWER, 20, 'Moved the preview bug out of scope; it is closed as not planned.'],
];

const escapeHtml =(t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function commentFor(author: string, ageH: number, text: string, i: number, now: number, hidden?: string): IssueComment {
  return {
    id: `C_${i}_${author}`,
    author,
    createdAt: new Date(now - ageH * HOUR).toISOString(),
    bodyHtml: `<p>${escapeHtml(text)}</p>`,
    ...(hidden ? { minimized: { reason: hidden } } : {}),
  };
}

const META_LABELS = Object.values(LABELS).map((l, i) => ({ ...l, id: `L_${i}` }));

const rate = (remaining: number): RateInfo => ({
  limit: 5000,
  remaining,
  resetAt: new Date(Date.now() + 12 * 60_000).toISOString(),
});

function log(what: string): void {
  console.log(`[fixtures] would ${what}`);
}

/** Synthetic issues in memory. Writes log what they would do and change this copy only. */
export class FixtureIssues {
  private readonly born = Date.now();
  private readonly issues = new Map<string, IssueSummary>();
  private readonly extraComments = new Map<string, IssueComment[]>();
  private readonly milestones = new Map<string, string | undefined>();
  private readonly closed = new Set<string>();
  private readonly opened = new Set<string>();
  private readonly reasons = new Map<string, 'completed' | 'not-planned'>();
  private readonly bodies = new Map<string, string>();
  /** Hours since each seeded closed issue closed. Issues closed through an action are not listed. */
  private readonly closedAgo = new Map<string, number>();
  private readonly tree = new SubTree();
  private nextNumber = 500;

  constructor(private readonly settings: Settings = DEFAULT_SETTINGS) {
    for (const s of [...SAMPLES, ...Array.from({ length: FILLER_COUNT }, (_, n) => filler(n))]) {
      const sum = summary(s, this.born, this.settings);
      this.issues.set(sum.id, sum);
      if (s.closed) {
        this.closed.add(sum.id);
        this.reasons.set(sum.id, s.closed);
        if (s.closedH !== undefined) this.closedAgo.set(sum.id, s.closedH);
      }
      if (s.body) this.bodies.set(sum.id, s.body);
    }
    this.milestones.set('I_acme-co/acme-api_412', '2026.11 release');
  }

  private find(ref: PrRef): IssueSummary {
    const hit = [...this.issues.values()].find((i) => i.repo === ref.repo && i.number === ref.number);
    if (!hit) throw new Error(`No fixture for ${ref.repo}#${ref.number}`);
    return hit;
  }

  private annotate(i: IssueSummary): IssueSummary {
    const { subIssues: _count, parent: _parent, ...rest } = i;
    const kids = this.subIssues(i.id);
    const parent = this.issues.get(this.tree.parentOf(i.id) ?? '');
    return {
      ...rest,
      ...(this.opened.has(i.id) ? { seen: 'seen', updatedNote: undefined } : {}),
      ...(kids.length > 0 ? { subIssues: progressOf(kids) } : {}),
      ...(parent ? { parent: { repo: parent.repo, number: parent.number } } : {}),
    };
  }

  private stateOf(id: string): SubIssueState {
    return this.closed.has(id) ? (this.reasons.get(id) ?? 'completed') : 'open';
  }

  private subIssues(parentId: string): SubIssue[] {
    return this.tree.children(parentId).flatMap((id) => {
      const c = this.issues.get(id);
      if (!c) return [];
      const assignee = c.assignees[0];
      return [{ id, repo: c.repo, number: c.number, title: c.title, state: this.stateOf(id), url: c.url, ...(assignee ? { assignee } : {}) }];
    });
  }

  private parentOf(childId: string): ParentIssue | undefined {
    const p = this.issues.get(this.tree.parentOf(childId) ?? '');
    if (!p) return undefined;
    return { id: p.id, repo: p.repo, number: p.number, title: p.title, state: this.stateOf(p.id), progress: progressOf(this.subIssues(p.id)) };
  }

  /** Sub-issue writes change the in-memory tree only. A refused add reads as GitHub's error. */
  private subAct(parent: IssueSummary, a: SubIssueAction): IssueActionResult {
    try {
      switch (a.type) {
        case 'sub-create': {
          const number = this.nextNumber++;
          const sum = summary(
            { repo: a.childRepo, number, title: a.title, author: VIEWER, ageH: 0, openedH: 0, labels: [], assignees: [], comments: 0, seen: 'seen' },
            Date.now(),
            this.settings,
          );
          this.issues.set(sum.id, sum);
          this.tree.add(parent.id, sum.id, false);
          log(`createIssue ${a.childRepo} #${number} under #${a.number}`);
          return { ok: true, message: `Fixture mode: would create ${a.childRepo} #${number} under #${a.number}. Nothing was sent.`, number };
        }
        case 'sub-add':
          this.tree.add(parent.id, this.find({ repo: a.childRepo, number: a.childNumber }).id, a.replaceParent);
          break;
        case 'sub-move':
          this.tree.move(parent.id, a);
          break;
        case 'sub-remove':
          this.tree.remove(parent.id, a.childId);
          break;
      }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Request failed' };
    }
    log(`${a.type} on ${a.repo} #${a.number}`);
    return { ok: true, message: `Fixture mode: would ${a.type} on ${a.repo} #${a.number}. Nothing was sent.` };
  }

  async list(state: StateQuery): Promise<IssueInboxData> {
    console.log('[fixtures] would call IssueSync');
    const base: IssueInboxData = {
      viewer: VIEWER,
      issues: [],
      mentionedIds: [],
      projectStatus: true,
      syncedAt: Date.now() - 14_000,
    };
    if (state === 'issues-loading') return { ...base, syncing: { done: 38, total: 61 } };
    if (state === 'issues-empty') return { ...base, rate: rate(4812) };
    const issues = [...this.issues.values()].filter((i) => !this.closed.has(i.id)).map((i) => this.annotate(i));
    const out: IssueInboxData = {
      ...base,
      issues,
      mentionedIds: issues.filter((i) => MENTIONED.includes(`${i.repo}#${i.number}`)).map((i) => i.id),
      rate: rate(state === 'issues-error' ? 0 : 4812),
    };
    if (state === 'issues-error') {
      out.stale = {
        kind: 'error',
        cachedAt: '14:02',
        message: 'GitHub API error 403: rate limit exceeded',
      };
    }
    return out;
  }

  /** The thread line a seeded closed issue ends with. */
  private closedEvent(id: string): TimelineEvent[] {
    const ago = this.closedAgo.get(id);
    if (ago === undefined || !this.closed.has(id)) return [];
    const why = this.reasons.get(id) === 'not-planned' ? 'not planned' : 'completed';
    return [
      {
        id: `T_closed_${id}`,
        actor: FIXTURE_VIEWER,
        createdAt: new Date(this.born - ago * HOUR).toISOString(),
        text: `${FIXTURE_VIEWER} closed this as ${why}`,
      },
    ];
  }

  /** Seeded closed issues still closed, newest first. */
  closedList(): ClosedIssue[] {
    return [...this.closedAgo.entries()]
      .filter(([id]) => this.closed.has(id))
      .flatMap(([id, ago]) => {
        const i = this.issues.get(id);
        if (!i) return [];
        const closedAt = new Date(this.born - ago * HOUR).toISOString();
        const closeReason: CloseReason = this.reasons.get(id) === 'not-planned' ? 'NOT_PLANNED' : 'COMPLETED';
        return [{ ...i, state: 'closed' as const, closeReason, closedAt, updatedAt: closedAt }];
      })
      .sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));
  }

  async detail(ref: PrRef, state: StateQuery): Promise<IssueDetail> {
    console.log(`[fixtures] would call IssueDetail ${ref.repo}#${ref.number}`);
    const base = this.find(ref);
    const is412 = base.id === 'I_acme-co/acme-api_412';
    const parent = this.parentOf(base.id);
    const summary: IssueSummary = {
      ...this.annotate(base),
      state: this.closed.has(base.id) ? 'closed' : 'open',
      ...(this.closed.has(base.id)
        ? { closeReason: this.reasons.get(base.id) === 'not-planned' ? ('NOT_PLANNED' as const) : ('COMPLETED' as const) }
        : {}),
    };
    const extra = this.extraComments.get(base.id) ?? [];
    const botThread = BOT_THREADS[base.id];
    const seeded: IssueComment[] = is412
      ? COMMENTS_412.map(([a, h, t, hidden], i) => commentFor(a, h, t, i, this.born, hidden))
      : base.id === 'I_acme-dev/notes_12'
        ? COMMENTS_12.map(([a, h, t], i) => commentFor(a, h, t, i, this.born))
        : botThread
          ? botThread.map((c, i) => {
              const comment = commentFor(c[0], c[1], c[2], i, this.born);
              const createdAt = c[4] ?? comment.createdAt;
              return { ...comment, createdAt, ...botFixtureTag(c, createdAt) };
            })
          : Array.from({ length: Math.min(base.commentCount, 3) }, (_, i) =>
              commentFor(PEOPLE[i % 2] ?? 'build-bot', 20 - i, `Fixture comment ${i + 1}.`, i, this.born),
            );
    const comments = [...seeded, ...extra];
    const timeline: TimelineEvent[] = is412
      ? [
          {
            id: 'T_1',
            actor: FIXTURE_VIEWER,
            createdAt: new Date(this.born - 8 * HOUR).toISOString(),
            text: `${FIXTURE_VIEWER} added label bug and self-assigned`,
          },
        ]
      : this.closedEvent(base.id);
    return {
      summary,
      bodyHtml: is412 ? BODY_412 : (this.bodies.get(base.id) ?? '<p>Fixture description.</p>'),
      assignees: base.assignees.map((login) => ({ login })),
      milestone: this.milestones.get(base.id),
      comments,
      timeline,
      linkedPrs: is412
        ? [
            {
              repo: 'acme-co/acme-api',
              number: 314,
              title: 'fix: closed communities in status filter',
              isDraft: true,
              headRef: 'crew/units-status-filter-closed',
              url: `https://github.com/acme-co/acme-api/pull/314`,
            },
          ]
        : [],
      participants: [...new Set([base.author, ...comments.map((c) => c.author)])].map((login) => ({ login })),
      subIssues: this.subIssues(base.id),
      ...(parent ? { parent } : {}),
      unseenFrom: this.opened.has(base.id) ? comments.length : is412 ? 3 : 0,
      rate: rate(state === 'issues-error' ? 0 : 4812),
    };
  }

  async meta(repo: string): Promise<RepoMeta> {
    console.log(`[fixtures] would call RepoMeta ${repo}`);
    return {
      repo,
      labels: META_LABELS,
      milestones: [
        { id: 'M_1', title: '2026.11 release' },
        { id: 'M_2', title: '2026.12 release' },
      ],
      users: PEOPLE.map((login, i) => ({ login, id: `U_${i}` })),
      template: '## Summary\n\n## Steps to reproduce\n\n## Expected\n',
      fetchedAt: Date.now(),
    };
  }

  async act(a: IssueAction): Promise<IssueActionResult> {
    if (a.type === 'create') {
      const number = this.nextNumber++;
      const sum = summary(
        { repo: a.repo, number, title: a.title, author: VIEWER, ageH: 0, openedH: 0, labels: a.labels, assignees: a.assignees, comments: 0, seen: 'seen' },
        Date.now(),
        this.settings,
      );
      this.issues.set(sum.id, sum);
      log(`create ${a.repo} #${number} "${a.title}"`);
      return { ok: true, message: `Fixture mode: would create ${a.repo} #${number}. Nothing was sent.`, number };
    }
    if (a.type === 'create-label') {
      const name = a.name.trim();
      if (META_LABELS.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
        return { ok: false, message: `Label "${name}" already exists` };
      }
      return { ok: true, message: `Fixture mode: would create label ${name}. Nothing was sent.`, label: { name, color: 'ededed' } };
    }
    const issue = this.find(a);
    if (a.type.startsWith('sub-')) return this.subAct(issue, a as SubIssueAction);
    const touch =(patch: Partial<IssueSummary>) =>
      this.issues.set(issue.id, { ...issue, ...patch, updatedAt: new Date().toISOString() });
    switch (a.type) {
      case 'comment': {
        const list = this.extraComments.get(issue.id) ?? [];
        this.extraComments.set(issue.id, [...list, commentFor(VIEWER, 0, a.body, list.length + 100, Date.now())]);
        touch({ commentCount: issue.commentCount + 1 });
        break;
      }
      case 'close':
        this.closed.add(issue.id);
        this.reasons.set(issue.id, a.reason === 'NOT_PLANNED' ? 'not-planned' : 'completed');
        break;
      case 'reopen':
        this.closed.delete(issue.id);
        this.reasons.delete(issue.id);
        break;
      case 'labels': {
        const kept = issue.labels.filter((l) => !a.remove.includes(l.name));
        const added = a.add
          .filter((n) => !kept.some((l) => l.name === n))
          .map((n) => LABELS[n] ?? { name: n, color: '6e7167' });
        touch({ labels: [...kept, ...added] });
        break;
      }
      case 'assignees':
        touch({ assignees: [...issue.assignees.filter((x) => !a.remove.includes(x)), ...a.add.filter((x) => !issue.assignees.includes(x))] });
        break;
      case 'milestone':
        this.milestones.set(issue.id, a.milestone ?? undefined);
        break;
      case 'title':
        touch({ title: a.title });
        break;
      case 'bot':
        if (!issue.labels.some((l) => l.name === 'bot')) touch({ labels: [...issue.labels, { name: 'bot', color: '1f6feb' }] });
        break;
      case 'start':
        touch({
          assignees: issue.assignees.includes(VIEWER) ? issue.assignees : [...issue.assignees, VIEWER],
          status: this.settings.project.options.inProgress,
          projectItemId: issue.projectItemId ?? itemId(issue),
        });
        break;
      case 'stop':
        touch({ status: this.settings.project.options.ready, projectItemId: issue.projectItemId ?? itemId(issue) });
        break;
      case 'status':
        touch({ status: a.status, projectItemId: issue.projectItemId ?? itemId(issue) });
        break;
    }
    log(`${a.type} on ${a.repo} #${a.number}`);
    return { ok: true, message: `Fixture mode: would ${a.type} ${a.repo} #${a.number}. Nothing was sent.` };
  }

  markSeen(mark: IssueSeenMark): void {
    this.opened.add(mark.id);
  }
}
