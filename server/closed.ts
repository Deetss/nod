import {
  CLOSED_PAGE_SIZE,
  reasonOf,
  windowStart,
  type ClosedIssue,
  type ClosedKind,
  type ClosedPage,
  type ClosedPr,
  type ClosedWindow,
} from '../shared/closed';
import { fullRepo } from '../shared/repo-name';
import type { RateInfo } from '../shared/types';
import { orgScope, searchTime } from './queries';
import type { LogSink } from './request-log';

/**
 * Closed items, merged or closed within the window. The fields are the list row's own, with no
 * reviews or check rollup, so a page of 100 stays cheap.
 */
const RATE = 'rateLimit { limit cost remaining resetAt }';

export const CLOSED_PR_QUERY = `
query ClosedPrs($q: String!, $after: String) {
  ${RATE}
  search(query: $q, type: ISSUE, first: ${CLOSED_PAGE_SIZE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        id number title url closedAt createdAt updatedAt additions deletions changedFiles headRefOid headRefName
        merged mergedBy { login }
        repository { name }
        author { login }
        commitCount: commits { totalCount }
      }
    }
  }
}`;

export const CLOSED_ISSUE_QUERY = `
query ClosedIssues($q: String!, $after: String) {
  ${RATE}
  search(query: $q, type: ISSUE, first: ${CLOSED_PAGE_SIZE}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        id number title url state stateReason closedAt createdAt updatedAt
        repository { name }
        author { login }
        labels(first: 20) { nodes { name color } }
        assignees(first: 10) { nodes { login } }
        commentCount: comments { totalCount }
      }
    }
  }
}`;

/** `is:pr is:closed org:X closed:>=<start>`: merged and unmerged together. Newest update first. */
export function closedSearch(
  kind: ClosedKind,
  orgs: readonly string[],
  window: ClosedWindow,
  now: number,
): string {
  const type = kind === 'prs' ? 'pr' : 'issue';
  return `is:${type} is:closed ${orgScope(orgs)} closed:>=${searchTime(windowStart(now, window))} sort:updated-desc`;
}

export interface RawClosedPr {
  id: string;
  number: number;
  title: string;
  url: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRefOid: string;
  headRefName?: string;
  merged: boolean;
  mergedBy?: { login: string } | null;
  repository: { name: string };
  author: { login: string } | null;
  commitCount: { totalCount: number };
}

export interface RawClosedIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  stateReason?: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  repository: { name: string };
  author: { login: string } | null;
  labels: { nodes: { name: string; color: string }[] };
  assignees: { nodes: { login: string }[] };
  commentCount: { totalCount: number };
}

export function toClosedPr(raw: RawClosedPr): ClosedPr {
  return {
    id: raw.id,
    repo: fullRepo(raw.url, raw.repository.name),
    number: raw.number,
    title: raw.title,
    author: raw.author?.login ?? 'ghost',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    headSha: raw.headRefOid,
    additions: raw.additions,
    deletions: raw.deletions,
    changedFiles: raw.changedFiles,
    commitCount: raw.commitCount.totalCount,
    ci: 'none',
    reviewStatus: raw.merged ? 'merged' : 'closed',
    seen: 'seen',
    url: raw.url,
    ...(raw.headRefName ? { headRef: raw.headRefName } : {}),
    merged: raw.merged,
    closedAt: raw.closedAt ?? raw.updatedAt,
    ...(raw.mergedBy ? { mergedBy: raw.mergedBy.login } : {}),
  };
}

export function toClosedIssue(raw: RawClosedIssue): ClosedIssue {
  const reason = reasonOf(raw.stateReason);
  return {
    id: raw.id,
    repo: fullRepo(raw.url, raw.repository.name),
    number: raw.number,
    title: raw.title,
    author: raw.author?.login ?? 'ghost',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    url: raw.url,
    state: 'closed',
    labels: raw.labels.nodes.map((l) => ({ name: l.name, color: l.color })),
    assignees: raw.assignees.nodes.map((a) => a.login),
    commentCount: raw.commentCount.totalCount,
    seen: 'seen',
    closeReason: reason,
    closedAt: raw.closedAt ?? raw.updatedAt,
  };
}

interface ClosedResponse<N> {
  rateLimit?: RateInfo;
  search: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: (N | Record<string, never>)[] };
}

export interface ClosedClient {
  graphql<T>(query: string, variables: Record<string, unknown>, label?: string): Promise<T>;
}

const newestFirst = (a: { closedAt: string }, b: { closedAt: string }): number =>
  Date.parse(b.closedAt) - Date.parse(a.closedAt);

/**
 * One page of closed items. Read only and never cached here; the page's rate-limit cost is
 * logged so the real price of the search is known. `first` marks the first page of a load.
 */
export async function fetchClosedPage(
  client: ClosedClient,
  log: LogSink,
  args: {
    kind: ClosedKind;
    orgs: readonly string[];
    window: ClosedWindow;
    after: string | undefined;
    now: number;
  },
): Promise<ClosedPage<ClosedPr> | ClosedPage<ClosedIssue>> {
  const { kind, window, after } = args;
  const q = closedSearch(kind, args.orgs, window, args.now);
  const query = kind === 'prs' ? CLOSED_PR_QUERY : CLOSED_ISSUE_QUERY;
  const data = await client.graphql<ClosedResponse<RawClosedPr & RawClosedIssue>>(
    query,
    { q, after: after ?? null },
    kind === 'prs' ? 'ClosedPrs' : 'ClosedIssues',
  );
  const nodes = data.search.nodes.filter((n): n is RawClosedPr & RawClosedIssue => 'id' in n);
  const rate = data.rateLimit;
  log(
    `[closed] ${kind} window=${window}d ${after ? 'next page' : 'first page'} items=${nodes.length}` +
      ` pageSize=${CLOSED_PAGE_SIZE} cost=${rate?.cost ?? '?'} remaining=${rate?.remaining ?? '?'}` +
      ` resetAt=${rate?.resetAt ?? '?'}`,
  );
  const base = {
    hasMore: data.search.pageInfo.hasNextPage,
    ...(data.search.pageInfo.endCursor ? { cursor: data.search.pageInfo.endCursor } : {}),
    ...(rate ? { rate } : {}),
  };
  return kind === 'prs'
    ? { ...base, items: nodes.map(toClosedPr).sort(newestFirst) }
    : { ...base, items: nodes.map(toClosedIssue).sort(newestFirst) };
}
