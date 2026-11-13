/**
 * The search qualifier for the configured orgs. With none it falls back to everything the
 * viewer is involved in, so a personal setup works without an org.
 */
export const orgScope = (orgs: readonly string[]): string =>
  orgs.length ? orgs.map((o) => `org:${o}`).join(' ') : 'involves:@me';

/** Every open PR in the orgs. The front end derives the sections. */
export const fullSearch = (orgs: readonly string[]): string => `is:open is:pr ${orgScope(orgs)}`;

const pad = (n: number) => String(n).padStart(2, '0');

/** GitHub search wants `YYYY-MM-DDTHH:MM:SSZ`. */
export function searchTime(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
  );
}

/** No `is:open`, so closed and merged PRs arrive and get removed. */
export function deltaSearch(orgs: readonly string[], lastSync: number, overlapMs: number): string {
  return `is:pr ${orgScope(orgs)} updated:>=${searchTime(lastSync - overlapMs)}`;
}

/**
 * The viewer's open PRs. A check run finishing does not move a PR's `updated` time, so the
 * delta search alone misses CI turning red until the hourly sweep.
 */
export function ownOpenSearch(orgs: readonly string[], viewer: string): string {
  return `is:pr is:open ${orgScope(orgs)} author:${viewer}`;
}

export const PR_FIELDS = `
  id number title url isDraft state closedAt createdAt updatedAt additions deletions changedFiles headRefOid headRefName
  repository { name }
  author { login }
  reviewDecision
  autoMergeRequest { enabledAt }
  reviewRequests(first: 31) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
  approvals: reviews(states: APPROVED) { totalCount }
  anyReviews: reviews { totalCount }
  commitCount: commits { totalCount }
  lastCommit: commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  assignees(first: 10) { nodes { login } }
  mergeable mergeStateStatus
`;

export const INBOX_QUERY = `
query InboxSync($q: String!, $after: String) {
  viewer { login }
  rateLimit { limit cost remaining resetAt }
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${PR_FIELDS} } }
  }
}`;

/** One PR read directly, never through search, so a merge shows up without index lag. */
export const FOLLOW_QUERY = `
query Follow($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      ${PR_FIELDS}
    }
  }
}`;

export const DETAIL_QUERY = `
query Detail($owner: String!, $name: String!, $number: Int!, $viewer: String!) {
  viewer { login }
  rateLimit { limit cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    viewerPermission
    pullRequest(number: $number) {
      ${PR_FIELDS}
      body bodyHTML baseRefName headRefName isCrossRepository mergedBy { login }
      viewerCanMergeAsAdmin mergeStateStatus mergeable
      latestReviews(first: 50) { nodes { state } }
      allCommits: commits(last: 30) { nodes { commit { oid messageHeadline url } } }
      myReviews: reviews(author: $viewer, last: 5) { nodes { author { login } state submittedAt commit { oid } } }
      pendingReview: reviews(author: $viewer, states: [PENDING], last: 1) { nodes { id comments { totalCount } } }
      comments(last: 50) { nodes { id author { login avatarUrl } bodyHTML createdAt url isMinimized minimizedReason } }
      threadReviews: reviews(last: 50) { nodes { id author { login avatarUrl } state bodyHTML submittedAt url isMinimized minimizedReason } }
      reviewThreads(last: 50) { nodes { id isResolved isOutdated path line diffSide startLine startDiffSide comments(first: 20) { nodes { id author { login avatarUrl } bodyHTML body state createdAt url isMinimized minimizedReason } } } }
      files(first: 100) { pageInfo { hasNextPage } nodes { path additions deletions viewerViewedState } }
      commits(last: 1) { nodes { commit { author { user { login } } committer { user { login } } } } }
      checkCommit: commits(last: 1) {
        nodes { commit { statusCheckRollup { state contexts(first: 50) { pageInfo { hasNextPage } nodes {
          __typename
          ... on CheckRun { name status conclusion startedAt completedAt detailsUrl }
          ... on StatusContext { context state targetUrl }
        } } } } }
      }
    }
  }
}`;

/** Fresh merge state, fetched on selection and before any merge. Never served from a cache. */
export const MERGE_STATE_QUERY = `
query MergeState($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    viewerPermission
    pullRequest(number: $number) {
      id title state isDraft baseRefName headRefName
      author { login }
      viewerCanMergeAsAdmin mergeStateStatus reviewDecision
      commits(last: 1) {
        nodes { commit { author { user { login } } committer { user { login } } statusCheckRollup { state contexts(first: 50) { pageInfo { hasNextPage } nodes {
          __typename
          ... on CheckRun { name status conclusion startedAt completedAt detailsUrl }
          ... on StatusContext { context state targetUrl }
        } } } } }
      }
    }
  }
}`;

/** Only what moves without the PR's updatedAt. Refreshes the open PR's live checks and merge state. */
export const CHECKS_QUERY = `
query Checks($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    viewerPermission
    pullRequest(number: $number) {
      viewerCanMergeAsAdmin mergeStateStatus mergeable reviewDecision
      commits(last: 1) {
        nodes { commit { statusCheckRollup { state contexts(first: 50) { pageInfo { hasNextPage } nodes {
          __typename
          ... on CheckRun { name status conclusion startedAt completedAt detailsUrl }
          ... on StatusContext { context state targetUrl }
        } } } } }
      }
    }
  }
}`;

/** The last 100 commits, for a PR with more new commits than the detail query carries. */
export const ALL_COMMITS_QUERY = `
query AllCommits($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      commits(last: 100) { nodes { commit { oid messageHeadline url } } }
    }
  }
}`;

/** Slugs of the org teams the login belongs to. */
export const TEAMS_QUERY = `
query Teams($org: String!, $login: String!) {
  organization(login: $org) {
    teams(first: 100, userLogins: [$login]) { nodes { slug } }
  }
}`;

export const SET_VIEWED = `
mutation SetViewed($id: ID!, $path: String!) {
  markFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId }
}`;

/** Takes a draft PR out of draft. GitHub then allows merging. */
export const MARK_READY = `
mutation MarkReady($id: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId }
}`;

export const UNSET_VIEWED = `
mutation UnsetViewed($id: ID!, $path: String!) {
  unmarkFileAsViewed(input: { pullRequestId: $id, path: $path }) { clientMutationId }
}`;

/** The viewer's pending review on a PR, if any, plus the head sha. GitHub returns only the viewer's own pending reviews. */
export const PENDING_REVIEW_QUERY = `
query PendingReview($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id headRefOid
      reviews(states: [PENDING], last: 1) { nodes { id comments { totalCount } } }
    }
  }
}`;

/** Creates a pending review (no event) on a PR. Drafts then attach to it. */
export const ADD_PENDING_REVIEW = `
mutation AddPendingReview($pullRequestId: ID!, $commitOID: GitObjectID!) {
  addPullRequestReview(input: { pullRequestId: $pullRequestId, commitOID: $commitOID }) {
    pullRequestReview { id }
  }
}`;

/** Adds a draft line or file comment to the pending review. */
export const ADD_REVIEW_THREAD = `
mutation AddReviewThread($pullRequestReviewId: ID!, $path: String!, $body: String!, $line: Int, $side: DiffSide, $startLine: Int, $startSide: DiffSide, $subjectType: PullRequestReviewThreadSubjectType) {
  addPullRequestReviewThread(input: {
    pullRequestReviewId: $pullRequestReviewId, path: $path, body: $body,
    line: $line, side: $side, startLine: $startLine, startSide: $startSide, subjectType: $subjectType
  }) {
    thread { id }
  }
}`;

/** Replies to a thread as a live comment. */
export const ADD_THREAD_REPLY = `
mutation AddThreadReply($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment { id }
  }
}`;

export const RESOLVE_THREAD = `
mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } }
}`;

export const UNRESOLVE_THREAD = `
mutation UnresolveThread($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } }
}`;

export const UPDATE_REVIEW_COMMENT = `
mutation UpdateReviewComment($id: ID!, $body: String!) {
  updatePullRequestReviewComment(input: { pullRequestReviewCommentId: $id, body: $body }) {
    pullRequestReviewComment { id }
  }
}`;

export const DELETE_REVIEW_COMMENT = `
mutation DeleteReviewComment($id: ID!) {
  deletePullRequestReviewComment(input: { id: $id }) { pullRequestReview { id } }
}`;

export const DELETE_PENDING_REVIEW = `
mutation DeletePendingReview($id: ID!) {
  deletePullRequestReview(input: { pullRequestReviewId: $id }) { pullRequestReview { id } }
}`;

export const SUBMIT_REVIEW = `
mutation SubmitReview($id: ID!, $event: PullRequestReviewEvent!, $body: String) {
  submitPullRequestReview(input: { pullRequestReviewId: $id, event: $event, body: $body }) {
    pullRequestReview { id }
  }
}`;

/** One item's rendered HTML, re-read once the signed image URLs in it have expired. */
export const ITEM_HTML_QUERY = `
query ItemHtml($id: ID!) {
  node(id: $id) {
    ... on Issue { bodyHTML }
    ... on PullRequest { bodyHTML }
    ... on IssueComment { bodyHTML }
    ... on PullRequestReview { bodyHTML }
    ... on PullRequestReviewComment { bodyHTML }
  }
}`;

export interface ItemHtmlResponse {
  node: { bodyHTML?: string } | null;
}
