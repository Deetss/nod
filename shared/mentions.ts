import type { Person } from './issue-types';

/** One page of `repository.mentionableUsers`, as the endpoint returns it. */
export interface MentionablePage {
  repo: string;
  people: Person[];
  hasNextPage: boolean;
  endCursor?: string;
}
