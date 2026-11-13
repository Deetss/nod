import { isConflicting } from '../shared/conflicts';
import { fullRepo } from '../shared/repo-name';
import type { CheckItem, CiState, PrSummary } from '../shared/types';

export interface RawPr {
  assignees?: { nodes: { login: string }[] };
  mergeable?: string;
  mergeStateStatus?: string;
  id: string;
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRefOid: string;
  headRefName?: string;
  isDraft?: boolean;
  state?: string;
  closedAt?: string | null;
  reviewRequests?: {
    nodes: { requestedReviewer: { login?: string; slug?: string } | null }[];
  };
  repository: { name: string };
  author: { login: string } | null;
  reviewDecision: string | null;
  autoMergeRequest?: { enabledAt: string } | null;
  approvals: { totalCount: number };
  anyReviews: { totalCount: number };
  commitCount: { totalCount: number };
  lastCommit: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
}

/**
 * GitHub's `viewerCanMergeAsAdmin` ignores ruleset bypass lists, so a repo ADMIN
 * counts as able to admin merge too. GitHub still has the final say on the merge.
 */
export function canAdminMerge(
  viewerCanMergeAsAdmin: boolean | undefined,
  viewerPermission: string | undefined,
): boolean {
  return viewerCanMergeAsAdmin === true || viewerPermission === 'ADMIN';
}

export function ciFromRollup(state: string | undefined): CiState {
  switch (state) {
    case 'SUCCESS':
      return 'pass';
    case 'FAILURE':
    case 'ERROR':
      return 'fail';
    case 'PENDING':
    case 'EXPECTED':
      return 'running';
    default:
      return 'none';
  }
}

export function reviewStatus(raw: RawPr): string {
  const approvals = raw.approvals.totalCount;
  if (raw.reviewDecision === 'CHANGES_REQUESTED') return 'changes requested';
  if (approvals > 0) return `${approvals} approval${approvals === 1 ? '' : 's'}`;
  return raw.anyReviews.totalCount === 0 ? 'no reviews yet' : 'needs review';
}

/** The query asks for one more than this, so a full page shows the list was cut. */
export const MAX_REQUESTS = 30;

function requestedOf(raw: RawPr): string[] {
  const out: string[] = [];
  for (const n of (raw.reviewRequests?.nodes ?? []).slice(0, MAX_REQUESTS)) {
    const who = n.requestedReviewer?.login ?? n.requestedReviewer?.slug;
    if (who) out.push(who);
  }
  return out;
}

/** Review counts for the status box, from the requested reviewers and each reviewer's latest review. */
export function reviewCounts(raw: {
  reviewRequests?: RawPr['reviewRequests'];
  latestReviews?: { nodes: { state: string }[] };
}): { pendingReviews: number; changeRequests: number; approvals: number } {
  return {
    approvals: (raw.latestReviews?.nodes ?? []).filter((r) => r.state === 'APPROVED').length,
    pendingReviews: (raw.reviewRequests?.nodes ?? []).filter((n) => n.requestedReviewer).length,
    changeRequests: (raw.latestReviews?.nodes ?? []).filter((r) => r.state === 'CHANGES_REQUESTED').length,
  };
}

export function toSummary(raw: RawPr): PrSummary {
  const rollup = raw.lastCommit.nodes[0]?.commit.statusCheckRollup?.state;
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
    ci: ciFromRollup(rollup),
    reviewStatus: reviewStatus(raw),
    seen: 'seen',
    url: raw.url,
    isDraft: raw.isDraft ?? false,
    ...(raw.autoMergeRequest ? { autoMerge: true } : {}),
    requested: requestedOf(raw),
    ...(raw.assignees?.nodes.length ? { assignees: raw.assignees.nodes.map((a) => a.login) } : {}),
    ...((raw.reviewRequests?.nodes.length ?? 0) > MAX_REQUESTS ? { requestsTruncated: true } : {}),
    conflicting: isConflicting(raw),
    ...(raw.headRefName ? { headRef: raw.headRefName } : {}),
  };
}

export interface RawContext {
  __typename: 'CheckRun' | 'StatusContext';
  name?: string;
  status?: string;
  conclusion?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  context?: string;
  state?: string;
  detailsUrl?: string | null;
  targetUrl?: string | null;
}

function duration(start?: string | null, end?: string | null): string {
  if (!start || !end) return '';
  const s = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/**
 * Check run conclusion to app status, the one place the mapping lives.
 *
 *   SUCCESS, NEUTRAL                                 pass
 *   SKIPPED                                          skipped
 *   CANCELLED                                        cancelled
 *   FAILURE, TIMED_OUT, ACTION_REQUIRED, STALE,
 *   STARTUP_FAILURE, anything else                   fail
 */
export function checkStatusFromConclusion(conclusion: string | null | undefined): CheckItem['status'] {
  switch (conclusion) {
    case 'SUCCESS':
    case 'NEUTRAL':
      return 'pass';
    case 'SKIPPED':
      return 'skipped';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'fail';
  }
}

export function toCheck(c: RawContext): CheckItem {
  if (c.__typename === 'StatusContext') {
    const status = c.state === 'SUCCESS' ? 'pass' : c.state === 'PENDING' ? 'running' : 'fail';
    return { name: c.context ?? 'status', status, duration: '', url: c.targetUrl ?? undefined };
  }
  let status: CheckItem['status'] = 'running';
  if (c.status === 'COMPLETED') {
    status = checkStatusFromConclusion(c.conclusion);
  } else if (['QUEUED', 'WAITING', 'PENDING', 'REQUESTED'].includes(c.status ?? '')) {
    status = 'queued';
  }
  return {
    name: c.name ?? 'check',
    status,
    duration: duration(c.startedAt, c.completedAt),
    startedAt: c.startedAt ?? undefined,
    url: c.detailsUrl ?? undefined,
  };
}

export function reviewSummary(state: string | undefined): string {
  switch (state) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes requested';
    case 'COMMENTED':
      return 'commented';
    case 'DISMISSED':
      return 'dismissed';
    default:
      return 'needs review';
  }
}
