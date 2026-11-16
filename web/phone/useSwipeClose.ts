import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type TransitionEvent } from 'react';
import { BUZZ, buzz } from './haptics';
import { crossedUp, sheetScrimOpacity, shouldCloseSwipe, SWIPE_CLOSE_PX } from './phone-logic';

const SETTLE = '180ms cubic-bezier(0.2, 0, 0, 1)';
const LEAVE = '200ms cubic-bezier(0.3, 0, 1, 1)';

/** Fallback for a missed `transitionend`. */
const LEAVE_FALLBACK_MS = 240;

type Phase = 'idle' | 'drag' | 'settling' | 'leaving';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export interface SwipeClose {
  /** Spread on the drag zone: the handle and the title row. */
  bind: {
    onPointerDown: (e: PointerEvent) => void;
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: (e: PointerEvent) => void;
    onPointerCancel: () => void;
  };
  /** Spread on the sheet itself. */
  sheet: { style: CSSProperties; onTransitionEnd: (e: TransitionEvent) => void };
  /** Sets `--ph-scrim-k`, which the scrim background multiplies its alpha by. */
  scrimStyle: CSSProperties;
}

/**
 * Drag a sheet down by its strip. Past 120px, or on a fling, it slides out and then calls
 * `onClose`. Short of that it springs back. Buttons in the strip stay taps.
 */
export function useSwipeClose(onClose: () => void, opts: { disabled?: boolean } = {}): SwipeClose {
  const [dy, setDy] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const drag = useRef<{ y: number; t: number; last: number } | undefined>(undefined);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const finish = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    closeRef.current();
  };

  const down = (e: PointerEvent) => {
    if (opts.disabled || phase === 'leaving') return;
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, t: e.timeStamp, last: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; the drag still follows it.
    }
    setPhase('drag');
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(0, e.clientY - d.y);
    if (crossedUp(d.last, next, SWIPE_CLOSE_PX)) buzz(BUZZ.tick);
    d.last = next;
    setDy(next);
  };
  const up = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = undefined;
    if (!d) return;
    const dist = Math.max(0, e.clientY - d.y);
    const instant = reducedMotion();
    if (!shouldCloseSwipe(dist, e.timeStamp - d.t)) {
      setDy(0);
      setPhase(instant ? 'idle' : 'settling');
      return;
    }
    if (instant) {
      setPhase('idle');
      setDy(0);
      closeRef.current();
      return;
    }
    setPhase('leaving');
    timer.current = setTimeout(finish, LEAVE_FALLBACK_MS);
  };
  const cancel = () => {
    if (!drag.current) return;
    drag.current = undefined;
    setDy(0);
    setPhase(reducedMotion() ? 'idle' : 'settling');
  };

  const onTransitionEnd = (e: TransitionEvent) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    if (phase === 'leaving') finish();
    else if (phase === 'settling') setPhase('idle');
  };

  const leaving = phase === 'leaving';
  const transition = phase === 'settling' ? SETTLE : leaving ? LEAVE : undefined;
  return {
    bind: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: cancel },
    sheet: {
      style: {
        transform: leaving ? 'translateY(100%)' : dy ? `translateY(${dy}px)` : undefined,
        transition: transition && `transform ${transition}`,
      },
      onTransitionEnd,
    },
    scrimStyle: {
      '--ph-scrim-k': leaving ? 0 : sheetScrimOpacity(dy),
      transition: transition && `--ph-scrim-k ${transition}`,
    } as CSSProperties,
  };
}
