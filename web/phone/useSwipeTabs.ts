import { useCallback, useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react';
import {
  LOCK_PX,
  canStart,
  dragOffset,
  lockAxis,
  overlayOver,
  scrollerTakes,
  settleIndex,
  settleMs,
} from './swipe-logic';

interface SwipeOptions {
  index: number;
  count: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  /** The vertical scroller that holds every pane, when the panes do not scroll themselves. */
  scroller?: RefObject<HTMLElement | null>;
  /** Called when a drag starts toward a pane, so it can mount before it shows. */
  onPeek?: (index: number) => void;
}

interface Drag {
  x: number;
  y: number;
  axis: 'pending' | 'x';
  /** Finger x when the axis locked, so the content starts moving from rest. */
  x0: number;
  lastX: number;
  lastT: number;
  velocity: number;
}

export interface SwipeTabs {
  pagerRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<HTMLDivElement | null>;
  /** The active tab indicator, which follows the same position as the track. */
  indicatorRef: RefObject<HTMLDivElement | null>;
  handlers: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: () => void;
  };
}

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Where the visible area of `scroller` starts, below any pinned tab strip inside it. */
function visibleTop(scroller: HTMLElement): number {
  const sticky = scroller.querySelector<HTMLElement>('.ph-sticky');
  return scroller.getBoundingClientRect().top + (sticky?.offsetHeight ?? 0);
}

/** One tap swallowed after a swipe, so lifting the finger over a row does not open it. */
function swallowNextClick() {
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener('click', stop, true);
  };
  window.addEventListener('click', stop, true);
  setTimeout(() => window.removeEventListener('click', stop, true), 400);
}

/**
 * Horizontal swipe between tabs. The track and indicator read `--swipe-pos` (the fractional tab
 * index), written straight to the DOM so a drag never re-renders React.
 */
export function useSwipeTabs({ index, count, onChange, disabled, scroller, onPeek }: SwipeOptions): SwipeTabs {
  const pagerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | undefined>(undefined);
  const frame = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shown = useRef<number | undefined>(undefined);
  const scrollTops = useRef(new Map<number, number>());

  const paint = useCallback((pos: number, ms: number) => {
    for (const el of [trackRef.current, indicatorRef.current]) {
      if (!el) continue;
      el.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
      el.style.setProperty('--swipe-pos', String(pos));
    }
  }, []);

  const setMoving = useCallback((on: boolean) => {
    clearTimeout(settleTimer.current);
    trackRef.current?.classList.toggle('is-moving', on);
  }, []);

  const settle = useCallback(
    (pos: number) => {
      const ms = settleMs(reducedMotion());
      paint(pos, ms);
      settleTimer.current = setTimeout(() => trackRef.current?.classList.remove('is-moving'), ms);
    },
    [paint],
  );

  // Each scroll is remembered against the tab showing, so coming back restores it.
  useLayoutEffect(() => {
    const el = scroller?.current;
    if (!el) return;
    const save = () => {
      if (shown.current !== undefined) scrollTops.current.set(shown.current, el.scrollTop);
    };
    el.addEventListener('scroll', save, { passive: true });
    return () => el.removeEventListener('scroll', save);
  }, [scroller]);

  // A tap or a settled swipe both land here: slide to the tab and restore its scroll.
  useLayoutEffect(() => {
    const first = shown.current === undefined;
    shown.current = index;
    if (first) {
      paint(index, 0);
      return;
    }
    if (!drag.current) {
      setMoving(true);
      settle(index);
    }
    const el = scroller?.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const floor = track.getBoundingClientRect().top - visibleTop(el) + el.scrollTop;
    el.scrollTop = scrollTops.current.get(index) ?? Math.min(el.scrollTop, Math.max(0, floor));
  }, [index, paint, settle, setMoving, scroller]);

  useLayoutEffect(() => () => {
    cancelAnimationFrame(frame.current);
    clearTimeout(settleTimer.current);
  }, []);

  const onPointerDown = (e: PointerEvent) => {
    const pager = pagerRef.current;
    drag.current = undefined;
    if (!pager || e.pointerType === 'mouse' || !e.isPrimary || count < 2) return;
    const ok = canStart({
      x: e.clientX,
      width: window.innerWidth,
      focused: document.activeElement === document.body ? null : document.activeElement,
      overlayOpen: overlayOver(pager),
      disabled,
    });
    if (!ok) return;
    drag.current = { x: e.clientX, y: e.clientY, axis: 'pending', x0: 0, lastX: e.clientX, lastT: e.timeStamp, velocity: 0 };
  };

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const pager = pagerRef.current;
    if (!d || !pager) return;
    const dx = e.clientX - d.x;
    if (d.axis === 'pending') {
      const axis = lockAxis(dx, e.clientY - d.y);
      if (axis === 'pending') return;
      if (axis === 'y' || scrollerTakes(e.target as Element, pager, dx)) {
        drag.current = undefined;
        return;
      }
      d.axis = 'x';
      d.x0 = d.x + Math.sign(dx) * LOCK_PX;
      const el = scroller?.current;
      const track = trackRef.current;
      if (el && track) {
        const peek = Math.max(0, visibleTop(el) - track.getBoundingClientRect().top);
        track.style.setProperty('--swipe-peek', `${peek}px`);
      }
      setMoving(true);
      const toward = dx < 0 ? index + 1 : index - 1;
      if (toward >= 0 && toward < count) onPeek?.(toward);
      // Capture keeps the drag alive off the pager. It throws for a pointer the browser no longer
      // tracks, and the drag then runs on bubbled moves.
      try {
        pager.setPointerCapture(e.pointerId);
      } catch {
        /* see above */
      }
    }
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    const offset = dragOffset(e.clientX - d.x0, index, count);
    const width = pager.clientWidth || window.innerWidth;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => paint(index - offset / width, 0));
  };

  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    const pager = pagerRef.current;
    if (!d || d.axis !== 'x' || !pager) {
      drag.current = undefined;
      return;
    }
    cancelAnimationFrame(frame.current);
    // A finger that stopped before lifting is not a fling.
    const velocity = e.timeStamp - d.lastT > 100 ? 0 : d.velocity;
    const target = settleIndex({
      dx: e.clientX - d.x0,
      velocity,
      width: pager.clientWidth || window.innerWidth,
      index,
      count,
    });
    swallowNextClick();
    settle(target);
    drag.current = undefined;
    if (target !== index) onChange(target);
  };

  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = undefined;
    if (!d || d.axis !== 'x') return;
    cancelAnimationFrame(frame.current);
    settle(index);
  };

  return { pagerRef, trackRef, indicatorRef, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
