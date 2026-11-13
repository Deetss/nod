/** The owner part of a full `owner/name` repo. */
export function repoOwner(repo: string): string {
  return repo.slice(0, repo.indexOf('/'));
}

/** The name part of a full `owner/name` repo. */
export function repoName(repo: string): string {
  return repo.slice(repo.indexOf('/') + 1);
}

/**
 * The full `owner/name` of a GitHub item, from its own URL and bare repo name. GitHub's
 * repository field has only the name, and the URL carries the owner.
 */
export function fullRepo(url: string, name: string): string {
  const owner = /^https:\/\/github\.com\/([^/]+)\//.exec(url)?.[1];
  return owner ? `${owner}/${name}` : name;
}

/** A full `owner/name` repo as two encoded URL path segments. */
export function repoPath(repo: string): string {
  return repo.split('/').map(encodeURIComponent).join('/');
}

/**
 * How a list of repos reads on screen: the bare name when every repo shares one owner,
 * otherwise `owner/name`.
 */
export function displayRepo(repo: string, repos: readonly string[]): string {
  const owners = new Set(repos.map(repoOwner));
  return owners.size <= 1 ? repoName(repo) : repo;
}
