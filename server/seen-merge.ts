import { z } from 'zod';
import type { IssueSeenMark, SeenMark } from './provider';

export type AnyMark = SeenMark | IssueSeenMark;
export type SeenMap = Record<string, AnyMark>;

/** One push holds the marks a desktop made while its hub was down. */
export const MERGE_MAX = 2000;

const when = z.string().max(64).refine((s) => Number.isFinite(Date.parse(s)));
const prMark = z.object({
  id: z.string().min(1).max(200),
  updatedAt: when,
  headSha: z.string().max(64),
  commitCount: z.number().int().nonnegative(),
});
const issueMark = z.object({
  id: z.string().min(1).max(200),
  updatedAt: when,
  commentCount: z.number().int().nonnegative(),
});
const anyMark = z.union([prMark, issueMark]);

export const seenMergeBody =z.object({ marks: z.array(anyMark).max(MERGE_MAX) });

/** True when `next` records a later look than `prev`. Equal times keep `prev`, so a repeat push changes nothing. */
function later(next: AnyMark, prev: AnyMark | undefined): boolean {
  return prev === undefined || Date.parse(next.updatedAt) > Date.parse(prev.updatedAt);
}

/** Keeps the later mark per item. `changed` counts the items whose value moved. */
export function mergeMarks(map: SeenMap, marks: readonly AnyMark[]): { map: SeenMap; changed: number } {
  const next = { ...map };
  let changed = 0;
  for (const mark of marks) {
    if (!later(mark, next[mark.id])) continue;
    next[mark.id] = mark;
    changed += 1;
  }
  return { map: next, changed };
}

/** Marks in `after` that are new or differ from `before`: what this machine recorded since `before` was read. */
export function changedMarks(before: SeenMap, after: SeenMap): AnyMark[] {
  return Object.values(after).filter((m) => JSON.stringify(m) !== JSON.stringify(before[m.id]));
}

/** A seen file as a map. Damaged entries are dropped, and anything unreadable reads as empty. */
export function parseSeenMap(raw: unknown): SeenMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: SeenMap = {};
  for (const [id, value] of Object.entries(raw)) {
    const parsed = anyMark.safeParse(value);
    if (parsed.success && parsed.data.id === id) out[id] = parsed.data;
  }
  return out;
}
