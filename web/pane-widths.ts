/** Pure width rules for the resizable panes. No DOM, no storage. */

export type PaneLayout = 'three' | 'two' | 'issues' | 'issues-two';

/** Width of the 1px handle column between panes. */
export const HANDLE_W = 1;

/** Spec widths of every pane left of the last (the last pane takes the rest). */
export const SPEC_WIDTHS: Record<PaneLayout, readonly number[]> = {
  three: [400, 480],
  two: [300],
  issues: [420, 960],
  'issues-two': [300],
};

/** Minimum width of each fixed pane. */
export const MIN_WIDTHS: Record<PaneLayout, readonly number[]> = {
  three: [280, 360],
  two: [280],
  issues: [280, 400],
  'issues-two': [280],
};

/** Minimum width of the last pane (Diff, Review, or the issue sidebar and detail). */
export const REST_MINS: Record<PaneLayout, number> = {
  three: 480,
  two: 480,
  issues: 280,
  'issues-two': 400,
};

function budget(layout: PaneLayout, total: number): number {
  return total - SPEC_WIDTHS[layout].length * HANDLE_W - REST_MINS[layout];
}

/** Largest width pane `index` can take with the other fixed panes unchanged. */
export function maxWidth(layout: PaneLayout, widths: readonly number[], index: number, total: number): number {
  const others = widths.reduce((sum, w, i) => (i === index ? sum : sum + w), 0);
  return Math.max(MIN_WIDTHS[layout][index] ?? 0, budget(layout, total) - others);
}

/** Moves pane `index` to `proposed`, stopping at its minimum and at the last pane's minimum. */
export function clampWidth(
  layout: PaneLayout,
  widths: readonly number[],
  index: number,
  proposed: number,
  total: number,
): number[] {
  const min = MIN_WIDTHS[layout][index] ?? 0;
  const next = Math.round(Math.min(Math.max(proposed, min), maxWidth(layout, widths, index, total)));
  return widths.map((w, i) => (i === index ? next : w));
}

/** Shrinks panes to fit `total`: the last pane first (implicit), then Detail, then Inbox, never below a minimum. */
export function fitWidths(layout: PaneLayout, widths: readonly number[], total: number): number[] {
  const mins = MIN_WIDTHS[layout];
  const out = widths.map((w, i) => Math.max(w, mins[i] ?? 0));
  let excess = out.reduce((a, b) => a + b, 0) - budget(layout, total);
  for (let i = out.length - 1; i >= 0 && excess > 0; i--) {
    const room = (out[i] ?? 0) - (mins[i] ?? 0);
    const give = Math.min(excess, room);
    out[i] = (out[i] ?? 0) - give;
    excess -= give;
  }
  return out;
}

/** Width the Issues sidebar takes by default; the detail pane gets what is left. */
export const ISSUES_SIDEBAR_W = 340;

/** Largest stored width taken as sane; anything above is a stale or corrupt value. */
export const MAX_STORED_WIDTH = 4000;

/** Spec widths. At the Issues layout the detail pane is sized so the sidebar lands on its default width. */
export function resetWidths(layout: PaneLayout, total?: number): number[] {
  const spec = [...SPEC_WIDTHS[layout]];
  if (layout === 'issues' && total !== undefined) {
    const list = spec[0] ?? 0;
    spec[1] = Math.max(MIN_WIDTHS.issues[1] ?? 0, total - 2 * HANDLE_W - list - ISSUES_SIDEBAR_W);
  }
  return spec;
}

/** Parses a stored value. Returns null when it is missing, malformed, or outside [minimum, MAX_STORED_WIDTH]. */
export function parseWidths(layout: PaneLayout, raw: string | null): number[] | null {
  try {
    const v: unknown = raw ? JSON.parse(raw) : undefined;
    const mins = MIN_WIDTHS[layout];
    const ok =
      Array.isArray(v) &&
      v.length === SPEC_WIDTHS[layout].length &&
      v.every((n, i) => typeof n === 'number' && Number.isFinite(n) && n >= (mins[i] ?? 0) && n <= MAX_STORED_WIDTH);
    if (ok) return v as number[];
  } catch {
    // fall through
  }
  return null;
}
