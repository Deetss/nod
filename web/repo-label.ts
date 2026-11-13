import { displayRepo } from '../shared/repo-name';

let known: readonly string[] = [];

/** The `owner/name` repos of every loaded PR and issue. Set on each render of the app root. */
export function setKnownRepos(repos: readonly string[]): void {
  known = repos;
}

/** How a repo reads on screen: its name when one owner covers every loaded item, else `owner/name`. */
export const repoLabel = (repo: string): string => displayRepo(repo, known);
