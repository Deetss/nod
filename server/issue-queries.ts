import { orgScope, searchTime } from './queries';

/** Every open issue in the orgs, and the open ones that mention the viewer. */
export const issueFullSearch = (orgs: readonly string[]): string => `is:open is:issue ${orgScope(orgs)}`;
export const mentionFullSearch = (orgs: readonly string[]): string => `${issueFullSearch(orgs)} mentions:@me`;

/** No `is:open`, so closed issues arrive and get removed. */
export function issueDeltaSearch(orgs: readonly string[], lastSync: number, overlapMs: number): string {
  return `is:issue ${orgScope(orgs)} updated:>=${searchTime(lastSync - overlapMs)}`;
}

export function mentionDeltaSearch(orgs: readonly string[], lastSync: number, overlapMs: number): string {
  return `${issueDeltaSearch(orgs, lastSync, overlapMs)} mentions:@me`;
}

export const ISSUE_FIELDS = `
  id number title url state stateReason createdAt updatedAt closedAt
  repository { name }
  author { login }
  labels(first: 20) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  commentCount: comments { totalCount }
  subIssuesSummary { total completed }
  parent { number url repository { name } }
  projectItems(first: 5) {
    nodes {
      id
      project { number }
      fieldValueByName(name: $statusField) { ... on ProjectV2ItemFieldSingleSelectValue { name optionId } }
    }
  }
`;

const RATE = 'rateLimit { limit cost remaining resetAt }';

export const ISSUE_INBOX_QUERY = `
query IssueSync($q: String!, $after: String, $statusField: String!) {
  viewer { login id }
  ${RATE}
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on Issue { ${ISSUE_FIELDS} } }
  }
}`;

export const MENTION_QUERY = `
query IssueMentions($q: String!, $after: String) {
  ${RATE}
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on Issue { id state } }
  }
}`;

/**
 * One request for a quiet poll: changed PRs, changed issues and changed mentions.
 * `first: 10` keeps a quiet poll near 1 point; a busy search continues from its cursor.
 */
export function pollQuery(prFields: string): string {
  return `
query Poll($prs: String!, $own: String!, $watchOwn: Boolean!, $issues: String!, $mentions: String!, $statusField: String!) {
  viewer { login id }
  ${RATE}
  prs: search(query: $prs, type: ISSUE, first: 10) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${prFields} } }
  }
  own: search(query: $own, type: ISSUE, first: 10) @include(if: $watchOwn) {
    nodes { ... on PullRequest { ${prFields} } }
  }
  issues: search(query: $issues, type: ISSUE, first: 10) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on Issue { ${ISSUE_FIELDS} } }
  }
  mentions: search(query: $mentions, type: ISSUE, first: 10) {
    pageInfo { hasNextPage endCursor }
    nodes { ... on Issue { id state } }
  }
}`;
}

export const ISSUE_DETAIL_QUERY = `
query IssueDetail($owner: String!, $name: String!, $number: Int!, $statusField: String!) {
  viewer { login }
  ${RATE}
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      ${ISSUE_FIELDS}
      bodyHTML
      milestone { title }
      assignees(first: 10) { nodes { login avatarUrl } }
      comments(first: 100) { pageInfo { hasNextPage endCursor } nodes { id body bodyHTML createdAt updatedAt isMinimized minimizedReason author { __typename login avatarUrl } } }
      timelineItems(first: 100, itemTypes: [LABELED_EVENT, UNLABELED_EVENT, ASSIGNED_EVENT, UNASSIGNED_EVENT, CLOSED_EVENT]) {
        nodes {
          __typename
          ... on ClosedEvent { id createdAt actor { login } stateReason }
          ... on LabeledEvent { id createdAt actor { login } label { name } }
          ... on UnlabeledEvent { id createdAt actor { login } label { name } }
          ... on AssignedEvent { id createdAt actor { login } assignee { ... on User { login } } }
          ... on UnassignedEvent { id createdAt actor { login } assignee { ... on User { login } } }
        }
      }
      closedByPullRequestsReferences(first: 10, includeClosedPrs: false) {
        nodes { number title isDraft headRefName url repository { name } }
      }
      participants(first: 20) { nodes { login avatarUrl } }
      parent { id title state stateReason subIssuesSummary { total completed } }
      subIssues(first: 100) {
        nodes { id number title state stateReason url repository { name } assignees(first: 1) { nodes { login } } }
      }
    }
  }
}`;

/** Comments past the first 100, fetched page by page. */
export const ISSUE_COMMENTS_QUERY = `
query IssueComments($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      comments(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { id body bodyHTML createdAt updatedAt isMinimized minimizedReason author { __typename login avatarUrl } }
      }
    }
  }
}`;

/** Each connection has its own cursor; the caller loops until none has another page. */
export const REPO_META_QUERY = `
query RepoMeta($owner: String!, $name: String!, $labelsAfter: String, $milestonesAfter: String, $usersAfter: String, $wantLabels: Boolean!, $wantMilestones: Boolean!, $wantUsers: Boolean!) {
  ${RATE}
  repository(owner: $owner, name: $name) {
    labels(first: 100, after: $labelsAfter) @include(if: $wantLabels) { pageInfo { hasNextPage endCursor } nodes { id name color } }
    milestones(first: 50, states: OPEN, after: $milestonesAfter) @include(if: $wantMilestones) { pageInfo { hasNextPage endCursor } nodes { id title } }
    assignableUsers(first: 100, after: $usersAfter) @include(if: $wantUsers) { pageInfo { hasNextPage endCursor } nodes { id login avatarUrl } }
    issueTemplates { body }
  }
}`;

export const ADD_COMMENT = `
mutation AddComment($id: ID!, $body: String!) {
  addComment(input: { subjectId: $id, body: $body }) { clientMutationId }
}`;

export const CLOSE_ISSUE = `
mutation CloseIssue($id: ID!, $reason: IssueClosedStateReason!) {
  closeIssue(input: { issueId: $id, stateReason: $reason }) { clientMutationId }
}`;

export const REOPEN_ISSUE = `
mutation ReopenIssue($id: ID!) {
  reopenIssue(input: { issueId: $id }) { clientMutationId }
}`;

export const ADD_LABELS = `
mutation AddLabels($id: ID!, $labels: [ID!]!) {
  addLabelsToLabelable(input: { labelableId: $id, labelIds: $labels }) { clientMutationId }
}`;

export const REMOVE_LABELS = `
mutation RemoveLabels($id: ID!, $labels: [ID!]!) {
  removeLabelsFromLabelable(input: { labelableId: $id, labelIds: $labels }) { clientMutationId }
}`;

export const ADD_ASSIGNEES = `
mutation AddAssignees($id: ID!, $users: [ID!]!) {
  addAssigneesToAssignable(input: { assignableId: $id, assigneeIds: $users }) { clientMutationId }
}`;

export const REMOVE_ASSIGNEES = `
mutation RemoveAssignees($id: ID!, $users: [ID!]!) {
  removeAssigneesFromAssignable(input: { assignableId: $id, assigneeIds: $users }) { clientMutationId }
}`;

export const UPDATE_TITLE = `
mutation UpdateTitle($id: ID!, $title: String!) {
  updateIssue(input: { id: $id, title: $title }) { clientMutationId }
}`;

/** A null `$milestone` clears the milestone. */
export const UPDATE_MILESTONE = `
mutation UpdateMilestone($id: ID!, $milestone: ID) {
  updateIssue(input: { id: $id, milestoneId: $milestone }) { clientMutationId }
}`;

export const CREATE_ISSUE = `
mutation CreateIssue($repo: ID!, $title: String!, $body: String, $labels: [ID!], $users: [ID!], $parent: ID) {
  createIssue(input: { repositoryId: $repo, title: $title, body: $body, labelIds: $labels, assigneeIds: $users, parentIssueId: $parent }) {
    issue { number }
  }
}`;

export const CREATE_LABEL = `
mutation CreateLabel($repo: ID!, $name: String!, $color: String!, $description: String) {
  createLabel(input: { repositoryId: $repo, name: $name, color: $color, description: $description }) { label { id name color } }
}`;

export const PROJECT_META_QUERY = `
query ProjectMeta($org: String!, $number: Int!, $field: String!) {
  organization(login: $org) {
    projectV2(number: $number) {
      id
      field(name: $field) { ... on ProjectV2SingleSelectField { id options { id name } } }
    }
  }
}`;

/** Idempotent: an issue already on the project returns its existing item. */
export const ADD_PROJECT_ITEM = `
mutation AddProjectItem($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`;

export const SET_PROJECT_STATUS = `
mutation SetProjectStatus($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(
    input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }
  ) { clientMutationId }
}`;

/** Without `$replace`, GitHub refuses a child that already has a parent. */
export const ADD_SUB_ISSUE = `
mutation AddSubIssue($id: ID!, $sub: ID!, $replace: Boolean) {
  addSubIssue(input: { issueId: $id, subIssueId: $sub, replaceParent: $replace }) { clientMutationId }
}`;

/** Unlinks only; the child keeps its state. */
export const REMOVE_SUB_ISSUE = `
mutation RemoveSubIssue($id: ID!, $sub: ID!) {
  removeSubIssue(input: { issueId: $id, subIssueId: $sub }) { clientMutationId }
}`;

/** Exactly one of `$after` and `$before` is set. */
export const REPRIORITIZE_SUB_ISSUE = `
mutation ReprioritizeSubIssue($id: ID!, $sub: ID!, $after: ID, $before: ID) {
  reprioritizeSubIssue(input: { issueId: $id, subIssueId: $sub, afterId: $after, beforeId: $before }) { clientMutationId }
}`;

export const ISSUE_ID_QUERY = `
query IssueId($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { issue(number: $number) { id } }
}`;

export const REPO_ID_QUERY = `
query RepoId($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) { id }
}`;
