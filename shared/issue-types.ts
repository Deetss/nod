import type { Minimized } from './minimized';
import type { ProjectStatus } from './project-status';
import type { ActionResult, RateInfo, SeenState, Stale, SyncProgress } from './types';

export type IssueSectionKey = 'progress' | 'bot' | 'assigned' | 'created' | 'mentioned' | 'untriaged' | 'all';
export type IssueStateKind = 'open' | 'closed';
export type CloseReason = 'COMPLETED' | 'NOT_PLANNED';

export interface IssueLabel {
  name: string;
  /** Hex colour without the leading "#", as GitHub sends it. */
  color: string;
}

export interface IssueSummary {
  id: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  state: IssueStateKind;
  /** Why a closed issue closed. Absent while open and on rows cached before the field existed. */
  closeReason?: CloseReason;
  labels: IssueLabel[];
  assignees: string[];
  commentCount: number;
  /** Status on the org project; absent when the issue is not on it or the feature is off. */
  status?: ProjectStatus;
  /** Node id of the issue's item on the org project. */
  projectItemId?: string;
  seen: SeenState;
  /** Set when seen is "updated", e.g. "1 new comment". */
  updatedNote?: string;
  /** Sub-issue progress; absent when the issue has none. */
  subIssues?: SubIssueCount;
  /** The parent, when this issue is a sub-issue. */
  parent?: { repo: string; number: number };
}

export interface SubIssueCount {
  total: number;
  completed: number;
}

/** Open, closed as completed, or closed as not planned. */
export type SubIssueState = 'open' | 'completed' | 'not-planned';

/** One child, in the parent's rank order. */
export interface SubIssue {
  id: string;
  repo: string;
  number: number;
  title: string;
  state: SubIssueState;
  url: string;
  /** First assignee's login. */
  assignee?: string;
}

export interface ParentIssue {
  id: string;
  repo: string;
  number: number;
  title: string;
  state: SubIssueState;
  progress: SubIssueCount;
}

/** GitHub's cap on children per parent. */
export const SUB_ISSUE_LIMIT = 100;

export interface IssueSection {
  key: IssueSectionKey;
  title: string;
  count: number;
  issues: IssueSummary[];
}

export interface IssueInboxData {
  viewer: string;
  issues: IssueSummary[];
  /** Ids of open issues that mention the viewer. */
  mentionedIds: string[];
  /** True when the project's Status options resolved; the status UI hides otherwise. */
  projectStatus?: boolean;
  syncedAt: number;
  rate?: RateInfo;
  stale?: Stale;
  syncing?: SyncProgress;
}

export interface Person {
  login: string;
  avatarUrl?: string;
}

export interface IssueComment {
  id: string;
  author: string;
  avatarUrl?: string;
  createdAt: string;
  /** When the comment was last edited. The bot edits its ack into the verdict in place. */
  updatedAt?: string;
  /** GitHub-rendered HTML. Sanitize before inserting. */
  bodyHtml: string;
  /** Markdown source. Only inline review comments carry it. */
  body?: string;
  /** The comment's page on GitHub. Only inline review comments carry it. */
  url?: string;
  /** Set when GitHub hides the comment. */
  minimized?: Minimized;
  /** Set on the bot's own comments: `retry`, `split`, `check` or `trim` when the comment carries that marker. */
  bot?: BotTag;
}

/** One issue in the bot's proposed split. Plain text, never HTML. */
export interface SplitPart {
  title: string;
  acceptanceCriteria: string[];
}

/** The verdict words of the check marker. */
export type CheckVerdict = 'valid' | 'partly' | 'done' | 'obsolete' | 'unclear';

export type BotTag =
  | 'retry'
  | 'plain'
  | 'check-failed'
  | 'trim-failed'
  | { kind: 'split'; parts: SplitPart[] }
  | { kind: 'check'; verdict: CheckVerdict; met?: number[] }
  | { kind: 'trim'; moved: number }
  | { kind: 'trim-refused'; reason: string };

/** A label or assignee change, already worded for the thread. */
export interface TimelineEvent {
  id: string;
  createdAt: string;
  actor: string;
  text: string;
}

export interface LinkedPr {
  repo: string;
  number: number;
  title: string;
  isDraft: boolean;
  headRef: string;
  url: string;
}

export interface IssueDetail {
  summary: IssueSummary;
  bodyHtml: string;
  assignees: Person[];
  milestone?: string;
  comments: IssueComment[];
  timeline: TimelineEvent[];
  linkedPrs: LinkedPr[];
  participants: Person[];
  /** Children in rank order. */
  subIssues: SubIssue[];
  parent?: ParentIssue;
  /** Comments from this index on are unseen. Equals comments.length when none are. */
  unseenFrom: number;
  rate?: RateInfo;
  stale?: Stale;
}

export interface RepoLabel extends IssueLabel {
  id: string;
}

export interface RepoMeta {
  repo: string;
  labels: RepoLabel[];
  milestones: { id: string; title: string }[];
  users: (Person & { id: string })[];
  /** Body of the repo's first issue template. */
  template?: string;
  /** When this was fetched, ms. */
  fetchedAt: number;
}

export type IssueAction =
  | { type: 'comment'; repo: string; number: number; body: string }
  | { type: 'close'; repo: string; number: number; reason: CloseReason; comment?: string }
  | { type: 'reopen'; repo: string; number: number }
  | { type: 'labels'; repo: string; number: number; add: string[]; remove: string[] }
  | { type: 'assignees'; repo: string; number: number; add: string[]; remove: string[] }
  | { type: 'milestone'; repo: string; number: number; milestone: string | null }
  | { type: 'title'; repo: string; number: number; title: string }
  | { type: 'start'; repo: string; number: number }
  | { type: 'stop'; repo: string; number: number }
  | { type: 'status'; repo: string; number: number; status: ProjectStatus }
  | { type: 'bot'; repo: string; number: number }
  | { type: 'create-label'; repo: string; name: string }
  | { type: 'create'; repo: string; title: string; body: string; labels: string[]; assignees: string[] }
  | SubIssueAction;

/** Writes on a parent's sub-issues. `repo` and `number` name the parent. */
export type SubIssueAction =
  | { type: 'sub-create'; repo: string; number: number; childRepo: string; title: string; body: string }
  | { type: 'sub-add'; repo: string; number: number; childRepo: string; childNumber: number; replaceParent: boolean }
  | { type: 'sub-move'; repo: string; number: number; childId: string; afterId?: string; beforeId?: string }
  | { type: 'sub-remove'; repo: string; number: number; childId: string };

export interface IssueActionResult extends ActionResult {
  /** Set by `create`. */
  number?: number;
  /** Set by `create-label`. */
  label?: { name: string; color: string };
}
