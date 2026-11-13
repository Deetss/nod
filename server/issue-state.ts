import type { IssueSummary } from '../shared/issue-types';

/** Persisted issue list. `closed` maps an issue key to when it left the open list. */
export interface IssueState {
  viewer: string;
  /** Start time of the last successful issue sync, ms. */
  lastSync: number;
  issues: Record<string, IssueSummary>;
  /** Ids of open issues that mention the viewer. */
  mentioned: string[];
  closed: Record<string, number>;
}

export const EMPTY_ISSUE_STATE: IssueState = {
  viewer: '',
  lastSync: 0,
  issues: {},
  mentioned: [],
  closed: {},
};

export const issueKey = (i: { repo: string; number: number }): string => `${i.repo}#${i.number}`;

/** An issue from a delta result, with whether it is still open. */
export interface ChangedIssue {
  issue: IssueSummary;
  open: boolean;
  closedAt?: string | null;
}

/** A mention search hit, with whether the issue is still open. */
export interface ChangedMention {
  id: string;
  open: boolean;
}

/** A full sweep replaces the list and the mentions. Vanished issues count as closed. */
export function applyIssuesFull(
  state: IssueState,
  viewer: string,
  found: IssueSummary[],
  mentionedIds: string[],
  syncStart: number,
): IssueState {
  const issues: Record<string, IssueSummary> = {};
  for (const i of found) issues[i.id] = i;
  const closed = { ...state.closed };
  for (const old of Object.values(state.issues)) {
    if (!issues[old.id]) closed[issueKey(old)] = syncStart;
  }
  for (const i of found) delete closed[issueKey(i)];
  const mentioned = mentionedIds.filter((id) => issues[id]);
  return { viewer, lastSync: syncStart, issues, mentioned, closed };
}

/** Merges an incremental result: updated issues replace, new ones appear, closed ones go. */
export function applyIssuesDelta(
  state: IssueState,
  viewer: string,
  changed: ChangedIssue[],
  mentions: ChangedMention[],
  syncStart: number,
): IssueState {
  const issues = { ...state.issues };
  const closed = { ...state.closed };
  for (const c of changed) {
    if (c.open) {
      issues[c.issue.id] = c.issue;
      delete closed[issueKey(c.issue)];
    } else {
      delete issues[c.issue.id];
      const at = c.closedAt ? Date.parse(c.closedAt) : syncStart;
      closed[issueKey(c.issue)] = Number.isNaN(at) ? syncStart : at;
    }
  }
  const mentioned = new Set(state.mentioned);
  for (const m of mentions) {
    if (m.open) mentioned.add(m.id);
    else mentioned.delete(m.id);
  }
  for (const id of [...mentioned]) if (!issues[id]) mentioned.delete(id);
  return { ...state, viewer, lastSync: syncStart, issues, mentioned: [...mentioned], closed };
}
