/** Gesture decisions for swiping between tabs. Pure, apart from the DOM reads in the last two helpers. */

/** Travel before the gesture commits to an axis. */
export const LOCK_PX = 10;

/** Android's back gesture owns this strip at each screen edge. */
export const EDGE_PX = 24;

/** Share of the width a slow drag must pass to change tab. */
export const COMMIT_RATIO = 0.3;

/** A release faster than this, in px/ms, changes tab whatever the distance. */
export const FLING_VELOCITY = 0.5;

/** Past the first or last tab the content follows a third of the finger, up to this far. */
export const RUBBER_MAX_PX = 48;

export type Axis = 'pending' | 'x' | 'y';

/** Commits to an axis once the finger has moved `LOCK_PX` either way; a tie goes to vertical. */
export function lockAxis(dx: number, dy: number): Axis {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return 'pending';
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

export function inEdgeZone(x: number, width: number): boolean {
  return x < EDGE_PX || x > width - EDGE_PX;
}

/** The content offset for a finger offset of `dx`, damped where there is no tab to go to. */
export function dragOffset(dx: number, index: number, count: number): number {
  const pastEdge = (dx > 0 && index === 0) || (dx < 0 && index === count - 1);
  if (!pastEdge) return dx;
  return Math.sign(dx) * Math.min(Math.abs(dx) / 3, RUBBER_MAX_PX);
}

export interface Release {
  /** Finger offset from where the drag locked, positive to the right. */
  dx: number;
  /** Finger speed at release, px/ms, positive to the right. */
  velocity: number;
  width: number;
  index: number;
  count: number;
}

/** The tab a released drag settles on. A fling against the drag direction snaps back. */
export function settleIndex({ dx, velocity, width, index, count }: Release): number {
  const fling = Math.abs(velocity) >= FLING_VELOCITY && Math.sign(velocity) === Math.sign(dx);
  if (!fling && Math.abs(dx) < width * COMMIT_RATIO) return index;
  const next = dx < 0 ? index + 1 : index - 1;
  return Math.min(count - 1, Math.max(0, next));
}

/** Settle duration; reduced motion switches without the slide. */
export function settleMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 250;
}

export interface StartState {
  x: number;
  width: number;
  /** The element that has focus, if any. */
  focused: Element | null;
  /** A modal, menu or picker is open over the pager. */
  overlayOpen: boolean;
  disabled?: boolean;
}

/** Whether a touch may start a tab swipe at all. */
export function canStart(s: StartState): boolean {
  if (s.disabled || s.overlayOpen) return false;
  if (inEdgeZone(s.x, s.width)) return false;
  return !isTextField(s.focused);
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(el.type);
  return (el as HTMLElement).isContentEditable === true;
}

/** Any open modal, menu or picker (pickers are modal sheets) that does not contain the pager. */
export function overlayOver(pager: Element): boolean {
  const open = pager.ownerDocument.querySelectorAll('[aria-modal="true"], [role="alertdialog"], [role="menu"]');
  return [...open].some((el) => !el.contains(pager));
}

/**
 * True when an element between `target` and `pager` scrolls horizontally and can still move
 * the way the finger asks. `dx < 0` drags left, which scrolls content toward its end.
 */
export function scrollerTakes(target: Element, pager: Element, dx: number): boolean {
  for (let el: Element | null = target; el && el !== pager; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth) continue;
    const overflow = getComputedStyle(el).overflowX;
    if (overflow !== 'auto' && overflow !== 'scroll') continue;
    const canEnd = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    const canStart = el.scrollLeft > 0;
    if (dx < 0 ? canEnd : canStart) return true;
  }
  return false;
}
