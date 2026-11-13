import type { IssueSummary } from '../../shared/issue-types';

export const commentsLabel = (n: number): string =>
  n === 0 ? 'no comments' : n === 1 ? '1 comment' : `${n} comments`;

/** What the one-click "me" button does for an issue: add the viewer, or remove them. */
export function assignMe(
  assignees: readonly { login: string }[],
  viewer: string | undefined,
): { label: 'Assign me' | 'Unassign me'; assigned: boolean; enabled: boolean } {
  const assigned = viewer !== undefined && assignees.some((a) => a.login === viewer);
  return { label: assigned ? 'Unassign me' : 'Assign me', assigned, enabled: viewer !== undefined && viewer !== '' };
}

export interface IssueRef {
  id: string;
  repo: string;
  number: number;
}

export const refOf = (i: IssueSummary): IssueRef => ({ id: i.id, repo: i.repo, number: i.number });
