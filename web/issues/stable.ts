import { refOf, type IssueRef } from './issue-utils';
import type { IssueSummary } from '../../shared/issue-types';

/** Keeps `prev` when `next` has the same content, so a quiet poll re-renders nothing downstream. */
export function keepIfSame<T>(prev: T | undefined, next: T): T {
  if (prev === undefined) return next;
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

/**
 * The issue the detail shows. An explicit selection wins. Otherwise the first issue shown
 * stays pinned while it is still listed, so a poll that reorders the list cannot swap it.
 */
export function resolveEffective(
  selected: IssueRef | undefined,
  pinnedId: string | undefined,
  issues: readonly IssueSummary[],
  first: IssueSummary | undefined,
): IssueRef | undefined {
  if (selected) return selected;
  const pinned = pinnedId ? issues.find((i) => i.id === pinnedId) : undefined;
  const pick = pinned ?? first;
  return pick ? refOf(pick) : undefined;
}
