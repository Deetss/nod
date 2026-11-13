import type { NumberHit } from '../shared/number-query';
import { ApiError, type GithubClient } from './github-client';

/** Most repos one lookup may ask about. Each costs one REST call. */
export const LOOKUP_MAX_REPOS = 30;

interface RestIssue {
  number: number;
  title: string;
  html_url: string;
  pull_request?: unknown;
}

/**
 * Finds issue or PR `number` in each repo, one REST call per repo. The issues endpoint
 * answers for PRs too. A repo without that number is skipped; a rate limit fails the lookup.
 */
export async function lookupNumber(
  client: Pick<GithubClient, 'rest'>,
  number: number,
  repos: readonly string[],
): Promise<NumberHit[]> {
  const found = await Promise.all(
    repos.slice(0, LOOKUP_MAX_REPOS).map(async (repo): Promise<NumberHit | undefined> => {
      try {
        const i = await client.rest<RestIssue>(`/repos/${repo}/issues/${number}`);
        return { kind: i.pull_request ? 'pr' : 'issue', repo, number: i.number, title: i.title, url: i.html_url };
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'ratelimit') throw e;
        return undefined;
      }
    }),
  );
  return found.filter((h): h is NumberHit => h !== undefined);
}
