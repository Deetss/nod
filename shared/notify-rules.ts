import { isOwnPr, sameLogin } from './pr-actions';
import { sectionsFor } from './sections';
import type { IssueInboxData, IssueSummary } from './issue-types';
import type { InboxData, PrSummary } from './types';

/** One entry per notification trigger. Add a key here and a rule below to add a trigger. */
export const TRIGGER_KEYS = ['review', 'feedback', 'ci', 'shipped', 'issueAssigned', 'issueMention'] as const;
export type TriggerKey = (typeof TRIGGER_KEYS)[number];

/** One on or off switch per trigger. */
export type TriggerSwitches = Record<TriggerKey, boolean>;

export const ALL_TRIGGERS_ON: TriggerSwitches = {
  review: true,
  feedback: true,
  ci: true,
  shipped: true,
  issueAssigned: true,
  issueMention: true,
};

export interface NotifySettings extends TriggerSwitches {
  muted: boolean;
}

export const DEFAULT_SETTINGS: NotifySettings = { muted: false, ...ALL_TRIGGERS_ON };

export const TRIGGER_LABELS: Record<TriggerKey, string> = {
  review: 'Review requested',
  feedback: 'New review on my PR',
  ci: 'CI failing on my PR',
  shipped: 'My PR merged or closed',
  issueAssigned: 'Issue assigned to me',
  issueMention: 'Issue mentions me',
};

/** One line under each switch. */
export const TRIGGER_DESCRIPTIONS: Record<TriggerKey, string> = {
  review: 'You or your team are asked to review a PR.',
  feedback: 'A PR you opened is approved, commented on or sent back.',
  ci: 'Checks start failing on a PR you opened.',
  shipped: 'A PR you opened or are assigned to merges or closes.',
  issueAssigned: 'An issue is newly assigned to you.',
  issueMention: 'An issue newly mentions you.',
};

export function isTriggerKey(kind: unknown): kind is TriggerKey {
  return (TRIGGER_KEYS as readonly unknown[]).includes(kind);
}

export interface NotifyTarget {
  kind: 'pr' | 'issue';
  repo: string;
  number: number;
}

/** What raised a notification, for the log line. */
export type NotifyKind = TriggerKey | 'summary' | 'test';

export interface NotifyItem {
  title: string;
  body: string;
  /** Absent on summaries, which only bring the window forward. */
  target?: NotifyTarget;
  kind?: NotifyKind;
}

/** `review pr acme-api#7`: the kind and target for a log line. Never the title or body. */
export function notifyLabel(item: NotifyItem): string {
  const { kind = 'unknown', target } = item;
  return target ? `${kind} ${target.kind} ${target.repo}#${target.number}` : kind;
}

export interface NotifyInput {
  /** The previous snapshot. Undefined on the first sync after start, which stays silent. */
  prev: InboxData | undefined;
  next: InboxData;
  settings: NotifySettings;
  /** Issue snapshots, with the same first-sync rule as `prev`. */
  prevIssues?: IssueInboxData;
  nextIssues?: IssueInboxData;
  /** PR and issue ids the user already opened this session. */
  seenIds?: ReadonlySet<string>;
  windowFocused: boolean;
}

/** More notifications than this in one poll collapse into a single summary. */
export const MAX_INDIVIDUAL = 3;

interface Ctx {
  prev: InboxData;
  next: InboxData;
  prevById: Map<string, PrSummary>;
  seenIds: ReadonlySet<string>;
  prevIssues: IssueInboxData | undefined;
  nextIssues: IssueInboxData | undefined;
}

type Rule = (ctx: Ctx) => NotifyItem[];

function itemFor(pr: PrSummary, headline: string): NotifyItem {
  return {
    title: `${headline}: ${pr.repo} #${pr.number}`,
    body: pr.title,
    target: { kind: 'pr', repo: pr.repo, number: pr.number },
  };
}

function issueItem(issue: IssueSummary, headline: string): NotifyItem {
  return {
    title: `${headline}: ${issue.repo} #${issue.number}`,
    body: issue.title,
    target: { kind: 'issue', repo: issue.repo, number: issue.number },
  };
}

function needsReview(pr: PrSummary, data: InboxData): boolean {
  return sectionsFor(pr, data.viewer, data.teams).includes('needs');
}

function approvalCount(status: string): number {
  const m = /^(\d+) approvals?$/.exec(status);
  return m ? Number(m[1]) : 0;
}

/** The new review's headline, or undefined when the status shows no new review. */
function newReview(before: string, after: string): string | undefined {
  if (before === after) return undefined;
  if (after === 'changes requested') return 'Changes requested';
  if (approvalCount(after) > approvalCount(before)) return 'Approved';
  if (before === 'no reviews yet' && after === 'needs review') return 'Review comment';
  return undefined;
}

const RULES: Record<TriggerKey, Rule> = {
  // A PR newly enters Needs my review, by user or team request.
  review: ({ next, prevById, seenIds }) =>
    next.prs
      .filter((pr) => needsReview(pr, next) && !seenIds.has(pr.id))
      .filter((pr) => {
        const before = prevById.get(pr.id);
        return !before || !needsReview(before, next);
      })
      .map((pr) => itemFor(pr, 'Review requested')),

  // One of the viewer's PRs gets a new review.
  feedback: ({ next, prevById }) =>
    next.prs.flatMap((pr) => {
      const before = prevById.get(pr.id);
      if (!before || !isOwnPr(pr.author, next.viewer)) return [];
      const headline = newReview(before.reviewStatus, pr.reviewStatus);
      return headline ? [itemFor(pr, headline)] : [];
    }),

  // CI on one of the viewer's PRs turns to failing.
  ci: ({ next, prevById }) =>
    next.prs
      .filter((pr) => isOwnPr(pr.author, next.viewer) && pr.ci === 'fail')
      .filter((pr) => {
        const before = prevById.get(pr.id);
        return before !== undefined && before.ci !== 'fail';
      })
      .map((pr) => itemFor(pr, 'CI failing')),

  // A PR the viewer authored or is assigned to merges or closes, auto-merge and bot PRs included.
  shipped: ({ prev, next }) => {
    const before = new Set((prev.shipped ?? []).map((s) => s.id));
    return (next.shipped ?? [])
      .filter((s) => !before.has(s.id))
      .map((s) => ({
        title: `${s.merged ? 'Merged' : 'Closed'}: ${s.repo} #${s.number}`,
        body: s.title,
        target: { kind: 'pr', repo: s.repo, number: s.number },
      }));
  },

  // An issue is newly assigned to the viewer.
  issueAssigned: ({ prevIssues, nextIssues, seenIds }) => {
    if (!prevIssues || !nextIssues) return [];
    const before = new Map(prevIssues.issues.map((i) => [i.id, i]));
    const mine = (i: IssueSummary | undefined) => i?.assignees.some((a) => sameLogin(a, nextIssues.viewer)) === true;
    return nextIssues.issues
      .filter((i) => mine(i) && !seenIds.has(i.id))
      .filter((i) => !mine(before.get(i.id)))
      .map((i) => issueItem(i, 'Issue assigned'));
  },

  // An issue newly mentions the viewer.
  issueMention: ({ prevIssues, nextIssues, seenIds }) => {
    if (!prevIssues || !nextIssues) return [];
    const before = new Set(prevIssues.mentionedIds);
    const byId = new Map(nextIssues.issues.map((i) => [i.id, i]));
    return nextIssues.mentionedIds
      .filter((id) => !before.has(id) && !seenIds.has(id))
      .flatMap((id) => {
        const issue = byId.get(id);
        return issue ? [issueItem(issue, 'Issue mentions you')] : [];
      });
  },
};

/** Every notification one poll raises, before collapsing. Empty when muted, focused or on the first sync. */
export function collectNotifications(input: NotifyInput): NotifyItem[] {
  const { prev, next, settings, seenIds = new Set<string>() } = input;
  if (!prev || settings.muted || input.windowFocused) return [];

  const ctx: Ctx = {
    prev,
    next,
    prevById: new Map(prev.prs.map((p) => [p.id, p])),
    seenIds,
    prevIssues: input.prevIssues,
    nextIssues: input.nextIssues,
  };
  return TRIGGER_KEYS.filter((key) => settings[key]).flatMap((key) =>
    RULES[key](ctx).map((item) => ({ ...item, kind: key })),
  );
}

/** More than `MAX_INDIVIDUAL` items become one summary. */
export function collapseNotifications(items: NotifyItem[]): NotifyItem[] {
  if (items.length > MAX_INDIVIDUAL) {
    return [{ title: `${items.length} updates in Nod`, body: 'Open Nod to see them.', kind: 'summary' }];
  }
  return items;
}

/** What the desktop shows of `items`: nothing while muted, and no type switched off. Summaries and tests pass. */
export function gateDesktop(
  items: readonly NotifyItem[],
  settings: NotifySettings,
): { show: NotifyItem[]; skipped: TriggerKey[] } {
  if (settings.muted) return { show: [], skipped: [] };
  const off = (i: NotifyItem) => isTriggerKey(i.kind) && !settings[i.kind];
  const skipped = [...new Set(items.filter(off).map((i) => i.kind as TriggerKey))];
  return { show: items.filter((i) => !off(i)), skipped };
}

/** The notifications one poll should show. */
export function computeNotifications(input: NotifyInput): NotifyItem[] {
  return collapseNotifications(collectNotifications(input));
}
