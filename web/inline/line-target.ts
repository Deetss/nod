/**
 * Maps a diff row to the comment target it takes, and the composer's key bindings. Pure, so the
 * tests can run them without a DOM.
 */
import type { DiffLine, DiffSide, Hunk } from '../../shared/types';

/**
 * The side and line number a comment on this row posts to. A removed line sits on the LEFT side
 * at its old number. Added and context lines sit on the RIGHT side at their new number.
 * Returns undefined when the row has no number on that side (should not happen for a real diff).
 */
export function lineTarget(line: DiffLine): { side: DiffSide; line: number } | undefined {
  if (line.kind === 'del') return line.oldNo === undefined ? undefined : { side: 'LEFT', line: line.oldNo };
  return line.newNo === undefined ? undefined : { side: 'RIGHT', line: line.newNo };
}

/** A commentable row: the side and line a comment on it posts to. */
export interface LineRef {
  side: DiffSide;
  line: number;
}

/** Every commentable row of a file, in diff order. */
export function fileTargets(hunks: readonly Hunk[]): LineRef[] {
  const rows: LineRef[] = [];
  for (const h of hunks) {
    for (const l of h.lines) {
      const t = lineTarget(l);
      if (t) rows.push(t);
    }
  }
  return rows;
}

/**
 * The row `delta` steps from `cur` (`n` is 1, `p` is -1), without wrapping. With `side`, only rows on
 * that side count, so a range stays on one side. With no `cur`, the first row (down) or the last (up).
 */
export function stepCursor(rows: readonly LineRef[], cur: LineRef | undefined, delta: 1 | -1, side?: DiffSide): LineRef | undefined {
  const pool = side === undefined ? rows : rows.filter((r) => r.side === side);
  if (pool.length === 0) return undefined;
  const at = cur === undefined ? -1 : pool.findIndex((r) => r.side === cur.side && r.line === cur.line);
  if (at < 0) return pool[delta > 0 ? 0 : pool.length - 1];
  return pool[Math.min(pool.length - 1, Math.max(0, at + delta))];
}

export type ComposerKey = 'post' | 'draft' | 'close';

/**
 * What a key does inside the composer's textarea or buttons. Ctrl+Enter posts, Ctrl+Shift+Enter
 * adds a draft, Esc closes. Any other key is left alone. The mention strip takes Enter first when
 * it is open, so the host does not see that Enter.
 */
export function composerKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): ComposerKey | undefined {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Enter' && mod) return e.shiftKey ? 'draft' : 'post';
  if (e.key === 'Escape') return 'close';
  return undefined;
}
