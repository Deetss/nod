import type { ClosedPage, ClosedPr, ClosedWindow } from '../shared/closed';
import { windowStart } from '../shared/closed';
import type { RateInfo } from '../shared/types';
import { FIXTURE_VIEWER } from './fixture-data';

/** Synthetic closed PRs. Authors are limited to the fixture viewer and build-bot. */

const HOUR = 3_600_000;

/** Fixture pages are four rows, so a 30-day window already has a second page. */
export const FIXTURE_CLOSED_PAGE = 4;

interface Seed {
  repo: string;
  number: number;
  title: string;
  author: string;
  closedH: number;
  merged: boolean;
  adds: number;
  dels: number;
  files: number;
}

const SEEDS: Seed[] = [
  { repo: 'acme-co/acme-web', number: 1398, title: 'Fix date picker timezone', author: FIXTURE_VIEWER, closedH: 24, merged: true, adds: 14, dels: 3, files: 2 },
  { repo: 'acme-co/acme-api', number: 381, title: 'Bump zod to 3.23', author: 'build-bot', closedH: 72, merged: true, adds: 6, dels: 6, files: 2 },
  { repo: 'acme-co/acme-web', number: 1390, title: 'Try virtual list', author: FIXTURE_VIEWER, closedH: 120, merged: false, adds: 88, dels: 41, files: 5 },
  { repo: 'acme-co/acme-api', number: 377, title: 'Cache ETag for repo meta', author: FIXTURE_VIEWER, closedH: 216, merged: true, adds: 32, dels: 4, files: 3 },
  { repo: 'acme-dev/tools', number: 52, title: 'Drop the legacy retry wrapper', author: 'build-bot', closedH: 288, merged: true, adds: 9, dels: 57, files: 4 },
  { repo: 'acme-co/acme-web', number: 1344, title: 'Spike: inline color sheet preview', author: FIXTURE_VIEWER, closedH: 480, merged: false, adds: 120, dels: 12, files: 6 },
  { repo: 'acme-co/acme-api', number: 340, title: 'Add ACPR approval export', author: 'build-bot', closedH: 1080, merged: true, adds: 64, dels: 8, files: 5 },
  { repo: 'acme-dev/notes', number: 29, title: 'Move vendor notes to a folder per community', author: FIXTURE_VIEWER, closedH: 1680, merged: true, adds: 21, dels: 21, files: 8 },
];

function toPr(s: Seed, now: number): ClosedPr {
  const closedAt = new Date(now - s.closedH * HOUR).toISOString();
  return {
    id: `PR_${s.repo}_${s.number}`,
    repo: s.repo,
    number: s.number,
    title: s.title,
    author: s.author,
    createdAt: new Date(now - (s.closedH + 72) * HOUR).toISOString(),
    updatedAt: closedAt,
    headSha: `c10${s.number}d`.padEnd(7, '0'),
    additions: s.adds,
    deletions: s.dels,
    changedFiles: s.files,
    commitCount: 1,
    ci: 'none',
    reviewStatus: s.merged ? 'merged' : 'closed',
    seen: 'seen',
    url: `https://github.com/${s.repo}/pull/${s.number}`,
    merged: s.merged,
    closedAt,
    ...(s.merged ? { mergedBy: FIXTURE_VIEWER } : {}),
  };
}

/** Every closed fixture PR, newest first. */
export const closedFixturePrs = (now: number): ClosedPr[] => SEEDS.map((s) => toPr(s, now));

/** One page of closed items, `FIXTURE_CLOSED_PAGE` rows at a time. The cursor is the next offset. */
export function pageOf<T extends { closedAt: string }>(
  all: readonly T[],
  window: ClosedWindow,
  after: string | undefined,
  now: number,
  rate: RateInfo,
): ClosedPage<T> {
  const start = windowStart(now, window);
  const inside = all.filter((i) => Date.parse(i.closedAt) >= start);
  const from = Number(after ?? 0) || 0;
  const items = inside.slice(from, from + FIXTURE_CLOSED_PAGE);
  const next = from + items.length;
  return { items, hasMore: next < inside.length, ...(next < inside.length ? { cursor: String(next) } : {}), rate };
}
