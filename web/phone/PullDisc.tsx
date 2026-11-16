import { useEffect, useRef, useState, type CSSProperties, type RefObject, type TouchEvent } from 'react';
import { AlertIcon } from '../ui';
import { BUZZ, buzz } from './haptics';
import { crossedUp, DISC_REST, discTravel, PULL_THRESHOLD, pullProgress, shouldRefresh } from './phone-logic';

/** `returning` travels back to 0 after a release short of the line. */
export type DiscState = 'idle' | 'pulling' | 'returning' | 'syncing' | 'done' | 'failed' | 'limited';

/** Failed and rate-limited discs hold this long before they shrink out. */
export const DISC_HOLD_MS = 1000;
const SHRINK_MS = 150;
const RETURN_MS = 150;

/** Circumference of the ring, r 9. */
const RING = 56.55;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

interface PullOptions {
  scroller: RefObject<HTMLElement | null>;
  /** Resolves false when the sync failed. */
  onRefresh: () => Promise<boolean>;
  /** GitHub's rate limit holds: the disc follows the finger but no request is sent. */
  limited?: boolean;
}

/** Pull to refresh state for one list: touch handlers, the disc, and what the sync line says. */
export function usePullToRefresh({ scroller, onRefresh, limited }: PullOptions) {
  const [dy, setDy] = useState(0);
  const [state, setState] = useState<DiscState>('idle');
  const [travel, setTravel] = useState(0);
  const [hidden, setHidden] = useState(false);
  const start = useRef<number | undefined>(undefined);
  const last = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(() => live.current && fn(), ms));
  };
  const reset = () => {
    setState('idle');
    setTravel(0);
    setHidden(false);
  };
  const shrink = () => {
    setState('done');
    later(reducedMotion() ? 0 : SHRINK_MS, reset);
  };
  const busy = state === 'syncing' || state === 'failed' || state === 'done' || (state === 'limited' && start.current === undefined);

  const onTouchStart = (e: TouchEvent) => {
    const top = scroller.current?.scrollTop ?? 1;
    start.current = top <= 0 && !busy ? e.touches[0]?.clientY : undefined;
    last.current = 0;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (start.current === undefined) return;
    const next = (e.touches[0]?.clientY ?? start.current) - start.current;
    if (!limited && crossedUp(last.current, next, PULL_THRESHOLD)) buzz(BUZZ.tick);
    last.current = next;
    setDy(next);
    setTravel(discTravel(next));
    setState(next > 0 ? (limited ? 'limited' : 'pulling') : 'idle');
  };
  const onTouchEnd = () => {
    if (start.current === undefined) return;
    start.current = undefined;
    const pulled = dy;
    setDy(0);
    if (pulled <= 0) return reset();
    if (limited) {
      setState('limited');
      later(DISC_HOLD_MS, shrink);
      return;
    }
    if (!shouldRefresh(pulled)) {
      setState('returning');
      setTravel(0);
      later(reducedMotion() ? 0 : RETURN_MS, reset);
      return;
    }
    setState('syncing');
    setTravel(DISC_REST);
    void onRefresh().then(
      (ok) => {
        if (!live.current) return;
        if (ok) return shrink();
        setState('failed');
        later(DISC_HOLD_MS, shrink);
      },
      () => live.current && shrink(),
    );
  };

  // Scrolling the list during a sync hides the disc at once; the sync line keeps its text.
  const onScroll = () => {
    if (state === 'syncing' && (scroller.current?.scrollTop ?? 0) > 0) setHidden(true);
  };

  const line =
    state === 'syncing' ? 'Refreshing…' : state === 'failed' ? 'Sync failed' : state === 'pulling' && shouldRefresh(dy) ? 'Release to refresh' : undefined;

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, onScroll },
    disc: <PullDisc state={hidden ? 'idle' : state} travel={travel} progress={pullProgress(dy)} />,
    /** The sync line's text while the disc speaks, or undefined for the list's own. */
    line,
    /** The disc stands in for the sync line's inline spinner. */
    discShown: state !== 'idle',
    /** True from release until a failed disc leaves, so a new error banner waits for the disc. */
    holding: state === 'syncing' || state === 'failed',
  };
}

/** 40px round disc that drops from under the header. State rides on ring, icon, dash and motion. */
export function PullDisc({ state, travel, progress }: { state: DiscState; travel: number; progress: number }) {
  const style: CSSProperties = { transform: `translateY(${travel}px)${state === 'done' ? ' scale(0)' : ''}` };
  const ring = state === 'syncing' ? 0.25 : state === 'done' ? 1 : progress;
  return (
    <div className={`ph-pull-disc is-${state}`} style={style} aria-hidden={state === 'limited' ? undefined : true}>
      {state === 'failed' ? (
        <span className="ph-pull-alert">
          <AlertIcon size={16} />
        </span>
      ) : state === 'limited' ? (
        <>
          <span className="ph-pull-pause" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="ph-pull-pill" role="status">
            No request sent
          </span>
        </>
      ) : (
        <svg className="ph-pull-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle className="ph-pull-track" cx="10" cy="10" r="9" />
          <circle className="ph-pull-arc" cx="10" cy="10" r="9" strokeDasharray={RING} strokeDashoffset={RING * (1 - ring)} />
        </svg>
      )}
    </div>
  );
}
