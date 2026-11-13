import { deriveIssueSections } from '../../shared/issue-sections';
import type { IssueInboxData, IssueSectionKey, IssueSummary } from '../../shared/issue-types';
import type { ProjectStatus } from '../../shared/project-status';
import { exactFirst, matchesQuery } from '../../shared/number-query';
import { bot, statusOption } from '../org-settings';

export type IssueSortKey = 'updated' | 'created' | 'comments';

export interface IssueFilter {
  /** Empty string means all repos. */
  repo: string;
  /** Empty string means any label. */
  label: string;
  /** Empty string means any status. */
  status: ProjectStatus | '';
  text: string;
  sort: IssueSortKey;
}

export const DEFAULT_ISSUE_FILTER: IssueFilter = { repo: '', label: '', status: '', text: '', sort: 'updated' };

export const SORT_LABELS: Record<IssueSortKey, string> = {
  updated: 'updated',
  created: 'created',
  comments: 'comments',
};

export interface IssueSectionView {
  key: IssueSectionKey;
  title: string;
  /** Matching issues in this section after the filters. */
  count: number;
  open: boolean;
  issues: IssueSummary[];
}

/**
 * Repo, label, status and text filters. An issue off the project counts as Backlog.
 * Text matches repo, author, title and label names, or the issue number.
 */
export function matchesIssue(issue: IssueSummary, f: IssueFilter): boolean {
  if (f.repo && issue.repo !== f.repo) return false;
  if (f.label && !issue.labels.some((l) => l.name === f.label)) return false;
  if (f.status && (issue.status ?? statusOption('backlog')) !== f.status) return false;
  const hay = [issue.repo, issue.author, issue.title, ...issue.labels.map((l) => l.name)].join(' ');
  return matchesQuery(issue, f.text, hay);
}

/** Newest first for `updated` and `created`, most comments first for `comments`. Stable. */
export function sortIssues(issues: readonly IssueSummary[], key: IssueSortKey): IssueSummary[] {
  const score = (i: IssueSummary): number => {
    if (key === 'created') return Date.parse(i.createdAt);
    if (key === 'comments') return i.commentCount;
    return Date.parse(i.updatedAt);
  };
  return [...issues].sort((a, b) => score(b) - score(a));
}

export function issueRepos(issues: readonly IssueSummary[]): string[] {
  return [...new Set(issues.map((i) => i.repo))].sort((a, b) => a.localeCompare(b));
}

export function issueLabelNames(issues: readonly IssueSummary[]): string[] {
  const names = new Set(issues.flatMap((i) => i.labels.map((l) => l.name)));
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Sections for the list: filtered, sorted with exact number matches first, open or collapsed applied. */
export function buildIssueSections(
  data: IssueInboxData,
  f: IssueFilter,
  collapsed: ReadonlySet<IssueSectionKey>,
): IssueSectionView[] {
  const visible = data.issues.filter((i) => matchesIssue(i, f));
  return deriveIssueSections(data.viewer, visible, data.mentionedIds, statusOption('inProgress'), bot()).map((s) => ({
    key: s.key,
    title: s.title,
    count: s.issues.length,
    open: !collapsed.has(s.key),
    issues: exactFirst(sortIssues(s.issues, f.sort), f.text),
  }));
}

/** Issue ids in the order j and k walk them: open sections only, each issue once. */
export function issueWalkOrder(sections: readonly IssueSectionView[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sections) {
    if (!s.open) continue;
    for (const i of s.issues) {
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      out.push(i.id);
    }
  }
  return out;
}
