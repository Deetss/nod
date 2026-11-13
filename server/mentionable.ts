import type { MentionablePage } from '../shared/mentions';
import type { Person } from '../shared/issue-types';
import type { RateInfo } from '../shared/types';

/** One page of users who can be mentioned in a repo. 100 per page. */
export const MENTIONABLE_QUERY = `
query Mentionable($owner: String!, $name: String!, $cursor: String) {
  rateLimit { limit cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    mentionableUsers(first: 100, after: $cursor) {
      nodes { login avatarUrl }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export interface MentionableResponse {
  rateLimit?: RateInfo;
  repository: {
    mentionableUsers: {
      nodes: { login: string; avatarUrl?: string | null }[];
      pageInfo: { hasNextPage: boolean; endCursor?: string | null };
    };
  } | null;
}

/** Maps the GraphQL response to the endpoint shape. A missing repository has no people. */
export function mentionablePage(repo: string, data: MentionableResponse): MentionablePage {
  const conn = data.repository?.mentionableUsers;
  const people: Person[] = (conn?.nodes ?? []).map((n) => ({
    login: n.login,
    ...(n.avatarUrl ? { avatarUrl: n.avatarUrl } : {}),
  }));
  return {
    repo,
    people,
    hasNextPage: conn?.pageInfo.hasNextPage ?? false,
    ...(conn?.pageInfo.endCursor ? { endCursor: conn.pageInfo.endCursor } : {}),
  };
}
