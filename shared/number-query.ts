import { repoName, repoOwner } from './repo-name';

/** A search for an issue or PR by number, optionally pinned to a repo and owner. */
export interface NumberQuery {
  number: number;
  repo?: string;
  owner?: string;
}

/** Anything with a full `owner/name` repo and a number: a PR, an issue, a search item. */
export interface NumberRef {
  repo: string;
  number: number;
}

/** An issue or PR the top-bar lookup found on GitHub. */
export interface NumberHit extends NumberRef {
  kind: 'pr' | 'issue';
  title: string;
  url: string;
}

const BARE =/^#?\s*(\d+)$/;
const QUALIFIED = /^(?:([A-Za-z0-9-]+)\/)?([A-Za-z0-9._-]+)\s*#\s*(\d+)$/;

const toNumber = (digits: string | undefined): number | undefined => {
  const n = Number(digits);
  return Number.isSafeInteger(n) && n >= 1 ? n : undefined;
};

/** Reads `10`, `#10`, `Repo#10` or `org/repo#10`. Anything else is not a number query. */
export function parseNumberQuery(text: string): NumberQuery | undefined {
  const q = text.trim();
  const bare = BARE.exec(q);
  if (bare) {
    const number = toNumber(bare[1]);
    return number === undefined ? undefined : { number };
  }
  const m = QUALIFIED.exec(q);
  if (!m) return undefined;
  const number = toNumber(m[3]);
  if (number === undefined) return undefined;
  return { number, repo: m[2], ...(m[1] ? { owner: m[1] } : {}) };
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Exact number, and repo and owner when the query names them. Case-insensitive. */
export function isNumberMatch(q: NumberQuery, item: NumberRef): boolean {
  if (q.number !== item.number) return false;
  if (q.repo !== undefined && !same(q.repo, repoName(item.repo))) return false;
  return q.owner === undefined || same(q.owner, repoOwner(item.repo));
}

/**
 * The list filter's test. A number query matches its exact item; any query also matches
 * as plain text against `text`, so a number in a title still shows.
 */
export function matchesQuery(item: NumberRef, query: string, text: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const q = parseNumberQuery(needle);
  if (q && isNumberMatch(q, item)) return true;
  return text.toLowerCase().includes(needle);
}

/** Moves exact number matches to the front, keeping the order within each group. */
export function exactFirst<T extends NumberRef>(items: readonly T[], query: string): T[] {
  const q = parseNumberQuery(query);
  if (!q) return [...items];
  const exact = items.filter((i) => isNumberMatch(q, i));
  return exact.length === 0 ? [...items] : [...exact, ...items.filter((i) => !exact.includes(i))];
}
