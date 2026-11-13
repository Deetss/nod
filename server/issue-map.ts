import type {
  IssueComment,
  IssueDetail,
  IssueSummary,
  LinkedPr,
  Person,
  SubIssue,
  SubIssueCount,
  SubIssueState,
  TimelineEvent,
} from '../shared/issue-types';
import { botTag } from '../shared/bot';
import { reasonOf } from '../shared/closed';
import { toMinimized } from '../shared/minimized';
import { isProjectStatus } from '../shared/project-status';
import { DEFAULT_SETTINGS, statusNames, type BotSettings, type Settings } from '../shared/settings';
import { fullRepo } from '../shared/repo-name';

export interface RawIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  stateReason?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  repository: { name: string };
  author: { login: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  assignees: { nodes: { login: string; avatarUrl?: string }[] };
  commentCount: { totalCount: number };
  subIssuesSummary?: { total: number; completed: number };
  parent?: { number: number; url: string; repository: { name: string } } | null;
  projectItems?: {
    nodes: {
      id: string;
      project: { number: number };
      fieldValueByName: { name?: string; optionId?: string } | null;
    }[];
  };
}

interface RawComment {
  id: string;
  /** Markdown source. The bot's retry marker is an HTML comment, which bodyHTML drops. */
  body?: string;
  bodyHTML: string;
  createdAt: string;
  updatedAt?: string;
  author: { __typename?: string; login: string; avatarUrl?: string } | null;
  isMinimized?: boolean;
  minimizedReason?: string | null;
}

export interface RawTimelineItem {
  __typename: string;
  id: string;
  createdAt: string;
  actor: { login: string } | null;
  label?: { name: string };
  assignee?: { login?: string } | null;
  stateReason?: string | null;
}

export interface RawIssueDetail extends RawIssue {
  bodyHTML: string;
  milestone: { title: string } | null;
  comments: { pageInfo?: { hasNextPage: boolean; endCursor: string | null }; nodes: RawComment[] };
  timelineItems: { nodes: RawTimelineItem[] };
  closedByPullRequestsReferences: {
    nodes: {
      number: number;
      title: string;
      isDraft: boolean;
      headRefName: string;
      url: string;
      repository: { name: string };
    }[];
  };
  participants: { nodes: { login: string; avatarUrl?: string }[] };
  parent?: (NonNullable<RawIssue['parent']> & RawRelative & { subIssuesSummary: SubIssueCount }) | null;
  subIssues?: { nodes: RawSubIssue[] };
}

interface RawRelative {
  id: string;
  title: string;
  state: string;
  stateReason?: string | null;
}

interface RawSubIssue extends RawRelative {
  number: number;
  url: string;
  repository: { name: string };
  assignees: { nodes: { login: string }[] };
}

export function subIssueState(state: string, reason?: string | null): SubIssueState {
  if (state === 'OPEN') return 'open';
  return reason === 'NOT_PLANNED' ? 'not-planned' : 'completed';
}

function toSubIssue(n: RawSubIssue): SubIssue {
  const assignee = n.assignees.nodes[0]?.login;
  return {
    id: n.id,
    repo: fullRepo(n.url, n.repository.name),
    number: n.number,
    title: n.title,
    state: subIssueState(n.state, n.stateReason),
    url: n.url,
    ...(assignee ? { assignee } : {}),
  };
}

/** Status and item id on the given project number, when the issue is on it. */
export function projectFields(
  raw: RawIssue,
  settings: Settings,
): Pick<IssueSummary, 'status' | 'projectItemId'> {
  const item = raw.projectItems?.nodes.find((n) => n.project.number === settings.project.number);
  if (!item) return {};
  const name = item.fieldValueByName?.name;
  return { projectItemId: item.id, ...(isProjectStatus(name, statusNames(settings)) ? { status: name } : {}) };
}

export function toIssueSummary(raw: RawIssue, settings: Settings = DEFAULT_SETTINGS): IssueSummary {
  return {
    ...projectFields(raw, settings),
    id: raw.id,
    repo: fullRepo(raw.url, raw.repository.name),
    number: raw.number,
    title: raw.title,
    author: raw.author?.login ?? 'ghost',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    url: raw.url,
    state: raw.state === 'OPEN' ? 'open' : 'closed',
    ...(raw.state === 'OPEN' ? {} : { closeReason: reasonOf(raw.stateReason) }),
    labels: raw.labels.nodes.map((l) => ({ name: l.name, color: l.color })),
    assignees: raw.assignees.nodes.map((a) => a.login),
    commentCount: raw.commentCount.totalCount,
    seen: 'seen',
    ...(raw.subIssuesSummary && raw.subIssuesSummary.total > 0
      ? { subIssues: { total: raw.subIssuesSummary.total, completed: raw.subIssuesSummary.completed } }
      : {}),
    ...(raw.parent
      ? { parent: { repo: fullRepo(raw.parent.url, raw.parent.repository.name), number: raw.parent.number } }
      : {}),
  };
}

/** Events by one person within this window read as one line. */
const GROUP_MS = 60_000;

const list = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Folds label and assign events into thread lines such as "acme-dev added label bug and self-assigned". */
export function toTimeline(items: RawTimelineItem[]): TimelineEvent[] {
  const sorted = [...items].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const groups: RawTimelineItem[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    const head = last?.[0];
    const near = head && Date.parse(item.createdAt) - Date.parse(head.createdAt) <= GROUP_MS;
    if (last && head && near && head.actor?.login === item.actor?.login) last.push(item);
    else groups.push([item]);
  }
  return groups.map((g) => {
    const first = g[0];
    const actor = first?.actor?.login ?? 'ghost';
    const pick = (type: string) => g.filter((e) => e.__typename === type);
    const added = pick('LabeledEvent').flatMap((e) => (e.label ? [e.label.name] : []));
    const removed = pick('UnlabeledEvent').flatMap((e) => (e.label ? [e.label.name] : []));
    const assigned = pick('AssignedEvent').flatMap((e) => (e.assignee?.login ? [e.assignee.login] : []));
    const unassigned = pick('UnassignedEvent').flatMap((e) => (e.assignee?.login ? [e.assignee.login] : []));
    const who = (logins: string[]) => list(logins.map((l) => (l === actor ? 'themself' : l)));
    const parts = [
      added.length ? `added label${added.length > 1 ? 's' : ''} ${list(added)}` : '',
      removed.length ? `removed label${removed.length > 1 ? 's' : ''} ${list(removed)}` : '',
      assigned.length ? (assigned.every((l) => l === actor) ? 'self-assigned' : `assigned ${who(assigned)}`) : '',
      unassigned.length ? `unassigned ${who(unassigned)}` : '',
      ...pick('ClosedEvent').map((e) => `closed this as ${reasonOf(e.stateReason) === 'NOT_PLANNED' ? 'not planned' : 'completed'}`),
    ].filter(Boolean);
    return {
      id: first?.id ?? '',
      createdAt: g[g.length - 1]?.createdAt ?? '',
      actor,
      text: `${actor} ${list(parts)}`,
    };
  });
}

const person = (p: { login: string; avatarUrl?: string }): Person => ({
  login: p.login,
  avatarUrl: p.avatarUrl,
});

function toComment(c: RawComment, b: BotSettings): IssueComment {
  const minimized = toMinimized(c.isMinimized, c.minimizedReason);
  const bot = botTag(c.author, c.body ?? '', b, c.createdAt);
  return {
    id: c.id,
    author: c.author?.login ?? 'ghost',
    avatarUrl: c.author?.avatarUrl,
    createdAt: c.createdAt,
    ...(c.updatedAt ? { updatedAt: c.updatedAt } : {}),
    bodyHtml: c.bodyHTML,
    ...(minimized ? { minimized } : {}),
    ...(bot ? { bot } : {}),
  };
}

/** The detail without seen state; the provider fills `unseenFrom` and the summary's seen flag. */
export function toIssueDetail(raw: RawIssueDetail, settings: Settings = DEFAULT_SETTINGS): IssueDetail {
  const comments = (raw.comments.nodes).map((c) => toComment(c, settings.bot));
  const linkedPrs: LinkedPr[] = raw.closedByPullRequestsReferences.nodes.map((n) => ({
    repo: fullRepo(n.url, n.repository.name),
    number: n.number,
    title: n.title,
    isDraft: n.isDraft,
    headRef: n.headRefName,
    url: n.url,
  }));
  return {
    summary: toIssueSummary(raw, settings),
    bodyHtml: raw.bodyHTML,
    assignees: raw.assignees.nodes.map(person),
    milestone: raw.milestone?.title,
    comments,
    timeline: toTimeline(raw.timelineItems.nodes),
    linkedPrs,
    participants: raw.participants.nodes.map(person),
    subIssues: (raw.subIssues?.nodes ?? []).map(toSubIssue),
    ...(raw.parent
      ? {
          parent: {
            id: raw.parent.id,
            repo: fullRepo(raw.parent.url, raw.parent.repository.name),
            number: raw.parent.number,
            title: raw.parent.title,
            state: subIssueState(raw.parent.state, raw.parent.stateReason),
            progress: { total: raw.parent.subIssuesSummary.total, completed: raw.parent.subIssuesSummary.completed },
          },
        }
      : {}),
    unseenFrom: comments.length,
  };
}
