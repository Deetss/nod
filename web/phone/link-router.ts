import { isKnownRepo, resolveItemLink, type ItemLink, type LinkRouter } from '../links';
import type { Level } from './sheet-stack';

interface Linkable {
  id: string;
  url: string;
}

/**
 * Routes a link to a loaded PR or issue by pushing its sheet, so back returns to the sheet the
 * link was in. An item that is not loaded returns false and opens GitHub.
 */
export function phoneLinkRouter(
  prs: readonly Linkable[],
  issues: readonly Linkable[],
  push: (level: Level) => void,
): LinkRouter {
  return (l: ItemLink) => {
    if (!isKnownRepo(l, [...prs, ...issues].map((x) => x.url))) return false;
    const hit = resolveItemLink(l, l.kind === 'pr' ? prs : issues);
    if (!hit) return false;
    push({ kind: l.kind, id: hit.id });
    return true;
  };
}
