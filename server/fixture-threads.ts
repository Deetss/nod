import type { PrThreadItem } from '../shared/types';
import { FIXTURE_VIEWER } from './fixture-data';

type Thread = Extract<PrThreadItem, { kind: 'thread' }>;

const PR_URL = 'https://github.com/acme-co/acme-api/pull/310#discussion_r';

function inline(
  n: number,
  at: string,
  author: string,
  path: string,
  line: number,
  body: string,
  over: Partial<Thread> = {},
  minimized?: { reason: string },
): Thread {
  return {
    kind: 'thread',
    at,
    id: `PRRC_fx${n}`,
    threadId: `PRRT_fx${n}`,
    path,
    line,
    resolved: false,
    isOutdated: false,
    comments: [
      {
        id: `PRRC_fx${n}`,
        author,
        createdAt: at,
        body,
        bodyHtml: body
          .split('\n')
          .map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
          .join(''),
        url: `${PR_URL}${1234567890 + n}`,
        ...(minimized ? { minimized } : {}),
      },
    ],
    ...over,
  };
}

/** Synthetic inline review threads for the fixture PR: three fixable, one resolved, one outdated. */
export const FIXTURE_INLINE_THREADS: PrThreadItem[] = [
  inline(1, '2026-11-08T19:10:00Z', 'github-code-quality', 'sandbox-api/test_web_tools.py', 13, "Module is imported with 'import' and 'import from'."),
  inline(2, '2026-11-08T19:20:00Z', 'github-code-quality', 'sandbox-api/web_tools.py', 27, "Unused global variable '_CACHE'."),
  inline(
    3,
    '2026-11-08T19:30:00Z',
    FIXTURE_VIEWER,
    'sandbox-api/web_tools.py',
    58,
    'Cap the response size here. fetch_page reads the whole body into memory, so one large page can exhaust the sandbox. Please stop at 2 MB and add a test for the limit.',
  ),
  inline(4, '2026-11-08T19:40:00Z', 'github-code-quality', 'sandbox-api/app.py', 9, "Import of 'json' is not used.", { resolved: true }),
  inline(
    5,
    '2026-11-08T19:50:00Z',
    'build-bot',
    'sandbox-api/web_tools.py',
    3,
    'Move this import below the stdlib block.',
    { isOutdated: true },
    { reason: 'outdated' },
  ),
];
