import type { ReviewerSettings } from '../shared/settings';
import type { PrThreadItem } from '../shared/types';

type Thread = Extract<PrThreadItem, { kind: 'thread' }>;

/** The review bot the fixture findings belong to, whatever the app's settings say. */
export const FIXTURE_REVIEWER: ReviewerSettings = { login: 'review-bot', threadMarker: '<!-- review-bot -->' };

export const FINDINGS_REPO = 'acme-co/orders-api';
export const FINDINGS_PR = 365;

const URL_BASE = `https://github.com/${FINDINGS_REPO}/pull/${FINDINGS_PR}#discussion_r`;
const MIGRATION = 'db/migrate/20261113000000_add_amounts.rb';

function thread(n: number, at: string, author: string, path: string, line: number, body: string, over: Partial<Thread> = {}): Thread {
  const html = body
    .split('\n')
    .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('');
  return {
    kind: 'thread',
    at,
    id: `PRRC_ta${n}`,
    threadId: `PRRT_ta${n}`,
    path,
    line,
    resolved: false,
    isOutdated: false,
    comments: [{ id: `PRRC_ta${n}`, author, createdAt: at, body, bodyHtml: html, url: `${URL_BASE}${2234567890 + n}` }],
    ...over,
  };
}

const marked = (severity: 'Blocker' | 'Major', text: string): string => `${FIXTURE_REVIEWER.threadMarker}\n**${severity}**: ${text}`;

/** Synthetic review threads for acme-co/orders-api #365: two open findings, one person's thread, one resolved finding. */
export const FIXTURE_FINDING_THREADS: PrThreadItem[] = [
  thread(
    1,
    '2026-11-15T09:10:00Z',
    'review-bot',
    MIGRATION,
    12,
    marked(
      'Blocker',
      'The diff adds the new migration without deleting the old version, so the duplicate version remains and migration loading still fails.',
    ),
  ),
  thread(
    2,
    '2026-11-15T09:11:00Z',
    'review-bot',
    MIGRATION,
    31,
    marked(
      'Major',
      'Rolling back the new migration drops the existing parcels table on a database where the old migration already ran.',
    ),
  ),
  thread(3, '2026-11-15T09:20:00Z', 'riley-k', 'app/models/order.rb', 8, 'Can we rename the migration class too?'),
  thread(
    4,
    '2026-11-15T09:05:00Z',
    'review-bot',
    'db/migrate/20261112000000_add_parcels.rb',
    4,
    marked('Major', 'The index name is longer than the database allows.'),
    { resolved: true },
  ),
];
