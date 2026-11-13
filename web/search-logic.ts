import { isNumberMatch, parseNumberQuery, type NumberHit, type NumberQuery } from '../shared/number-query';
import { repoName, repoOwner } from '../shared/repo-name';

/** One jump target, a PR or an issue. Items from a GitHub lookup carry `url`. */
export interface SearchItem {
  id: string;
  kind: 'pr' | 'issue';
  repo: string;
  number: number;
  title: string;
  /** Extra text the query matches, such as the author. */
  extra: string;
  url?: string;
}

/** What the top bar shows for a query, and what it still has to ask GitHub. */
export interface SearchPlan {
  results: SearchItem[];
  /** Set for a number query. */
  number?: NumberQuery;
  /** Repos the query covers, named as the lists name them. */
  repos: string[];
  /** Covered repos with no local item of that number. Empty means no lookup. */
  lookup: string[];
}

export const SEARCH_LIMIT = 8;

const lower = (s: string) => s.toLowerCase();

export function trackedRepos(items: readonly SearchItem[]): string[] {
  return [...new Set(items.map((i) => i.repo))].sort((a, b) => a.localeCompare(b));
}

/**
 * A number query matches every PR and issue with that number, in either list. Any other
 * query matches text on the current view's kind only.
 */
export function planSearch(items: readonly SearchItem[], query: string, kind: SearchItem['kind']): SearchPlan {
  const needle = lower(query.trim());
  if (!needle) return { results: [], repos: [], lookup: [] };
  const q = parseNumberQuery(needle);
  if (!q) {
    const results = items
      .filter((i) => i.kind === kind && lower(`${i.repo} #${i.number} ${i.extra} ${i.title}`).includes(needle))
      .slice(0, SEARCH_LIMIT);
    return { results, repos: [], lookup: [] };
  }
  const all = trackedRepos(items);
  const repos = all.filter(
    (r) =>
      (q.owner === undefined || lower(repoOwner(r)) === lower(q.owner)) &&
      (q.repo === undefined || lower(repoName(r)) === lower(q.repo)),
  );
  const results = items.filter((i) => isNumberMatch(q, i)).slice(0, SEARCH_LIMIT);
  const found = new Set(results.map((r) => r.repo));
  return { results, number: q, repos, lookup: repos.filter((r) => !found.has(r)) };
}

export function hitToItem(h: NumberHit): SearchItem {
  return { id: `${h.kind}:${h.repo}#${h.number}`, kind: h.kind, repo: h.repo, number: h.number, title: h.title, extra: '', url: h.url };
}

/** Local results first, then lookup hits for repos the local ones lack, by repo name. */
export function mergeHits(local: readonly SearchItem[], hits: readonly NumberHit[]): SearchItem[] {
  const have = new Set(local.map((i) => `${i.kind}:${i.repo}#${i.number}`));
  const extra = hits
    .map(hitToItem)
    .filter((i) => !have.has(i.id))
    .sort((a, b) => a.repo.localeCompare(b.repo));
  return [...local, ...extra].slice(0, SEARCH_LIMIT);
}

/** The miss line: `No issue or PR #10 in acme-co/acme-api, acme-dev/notes`. */
export function missText(number: number, repos: readonly string[]): string {
  return `No issue or PR #${number} in ${repos.length > 0 ? repos.join(', ') : 'the repos this app lists'}`;
}
