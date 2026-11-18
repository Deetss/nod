import { MERGE_MAX, type AnyMark } from '../server/seen-merge';
import type { Fetcher } from './hub';

/** No Electron import here, so the push is testable in Node. */

const TIMEOUT_MS = 10_000;
const TOKEN_RE = /<meta name="nod-token" content="([A-Za-z0-9_-]{16,200})"/;

/** The session token the hub writes into its page, as any paired browser reads it. */
export function tokenFromHtml(html: string): string | undefined {
  return TOKEN_RE.exec(html)?.[1];
}

/**
 * Sends the marks this desktop made in local mode to its hub, with the device cookie, the
 * hub's session token and the hub's own Origin. Returns how many items the hub changed.
 */
export async function pushSeen(origin: string, marks: readonly AnyMark[], fetcher: Fetcher): Promise<number> {
  if (marks.length === 0) return 0;
  const page = await fetcher(`${origin}/`, { credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
  const token = page.status === 200 ? tokenFromHtml(await page.text()) : undefined;
  if (!token) throw new Error(`hub page answered ${page.status} without a token`);
  let changed = 0;
  for (let at = 0; at < marks.length; at += MERGE_MAX) {
    const res = await fetcher(`${origin}/api/seen/merge`, {
      method: 'POST',
      credentials: 'include',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { origin, 'x-nod-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ marks: marks.slice(at, at + MERGE_MAX) }),
    });
    if (res.status !== 200) throw new Error(`seen merge answered ${res.status}`);
    const body: unknown = await res.json().catch(() => undefined);
    const n = typeof body === 'object' && body !== null ? (body as { changed?: unknown }).changed : undefined;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new Error('seen merge sent a bad answer');
    changed += n;
  }
  return changed;
}
