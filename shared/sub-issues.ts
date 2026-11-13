import type { SubIssue, SubIssueCount } from './issue-types';

/** One `reprioritizeSubIssue` anchor: the sibling the child lands after, or before. */
export type MoveArgs = { afterId: string; beforeId?: undefined } | { beforeId: string; afterId?: undefined };

export type MoveTarget = 'up' | 'down' | 'top' | 'bottom';

/** The child's index after a menu or key move. */
export function targetIndex(ids: readonly string[], childId: string, target: MoveTarget): number {
  const from = ids.indexOf(childId);
  if (target === 'top') return 0;
  if (target === 'bottom') return ids.length - 1;
  return target === 'up' ? from - 1 : from + 1;
}

/**
 * Anchor that puts `childId` at index `to` of the reordered list. Index 0 anchors before the
 * first sibling; any other index anchors after the sibling in front. Undefined when nothing moves.
 */
export function moveArgs(ids: readonly string[], childId: string, to: number): MoveArgs | undefined {
  const from = ids.indexOf(childId);
  if (from < 0) return undefined;
  const rest = ids.filter((id) => id !== childId);
  const at = Math.max(0, Math.min(rest.length, to));
  if (at === from) return undefined;
  const first = rest[0];
  const before = rest[at - 1];
  if (at === 0) return first === undefined ? undefined : { beforeId: first };
  return before === undefined ? undefined : { afterId: before };
}

/** The list as GitHub orders it after the move. Unknown ids leave it unchanged. */
export function applyMove<T extends { id: string }>(items: readonly T[], childId: string, args: MoveArgs): T[] {
  const item = items.find((i) => i.id === childId);
  if (!item) return [...items];
  const rest = items.filter((i) => i.id !== childId);
  const anchor = rest.findIndex((i) => i.id === (args.afterId ?? args.beforeId));
  if (anchor < 0) return [...items];
  const at = args.afterId !== undefined ? anchor + 1 : anchor;
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

/** GitHub counts every closed child as done, not-planned ones included. */
export function progressOf(subs: readonly Pick<SubIssue, 'state'>[]): SubIssueCount {
  return { total: subs.length, completed: subs.filter((s) => s.state !== 'open').length };
}

/** `#14` in the parent's repo, `acme-api #421` in another. */
export function subRef(child: { repo: string; number: number }, parentRepo: string): string {
  return child.repo === parentRepo ? `#${child.number}` : `${child.repo} #${child.number}`;
}
