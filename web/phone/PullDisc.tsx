import { useEffect, useRef, useState, type CSSProperties, type RefObject, type TouchEvent } from 'react';
import { AlertIcon } from '../ui';
import { BUZZ, buzz } from './haptics';
import { crossedUp, DISC_REST, discTravel, PULL_DONE_HOLD_MS, PULL_THRESHOLD, pullProgress, shouldRefresh } from './phone-logic';

/** `returning` travels back to 0 after a release short of the line. `leaving` is the shrink out. */
export type DiscState = 'idle' | 'pulling' | 'returning' | 'syncing' | 'done' | 'failed' | 'limited' | 'leaving';

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
  /** The pill while pulling short of the line, `Synced 2m ago`. */
  synced: string;
}

/** What the pill beside the disc says in each state. */
function pillText(state: DiscState, dy: number, synced: string): string {
  if (state === 'syncing') return 'Refreshing…';
  if (state === 'done') return 'Synced just now';
  if (state === 'failed') return 'Sync failed';
  if (state === 'limited') return 'No request sent';
  if (state === 'pulling' && shouldRefresh(dy)) return 'Release to refresh';
  return synced;
}

/** Pull to refresh state for one list: touch handlers and the disc with its pill. */
export function usePullToRefresh({ scroller, onRefresh, limited, synced }: PullOptions) {
  const [dy, setDy] = useState(0);
  const [state, setState] = useState<DiscState>('idle');
  const [travel, setTravel] = useState(0);
  const [hidden, setHidden] = useState(false);
  const start = useRef<number | undefined>(undefined);
  const last = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const live = useRef(true);

  // While leaving, the disc keeps the look and words of the state it left.
  const shown = useRef<{ state: DiscState; pill: string }>({ state: 'idle', pill: synced });
  if (state !== 'leaving') shown.current = { state, pill: pillText(state, dy, synced) };

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
    setState('leaving');
    later(reducedMotion() ? 0 : SHRINK_MS, reset);
  };
  /** Holds a result long enough to read, then shrinks. Reduced motion keeps the hold. */
  const hold = (s: DiscState) => {
    setState(s);
    later(PULL_DONE_HOLD_MS, shrink);
  };
  const settling = state === 'syncing' || state === 'done' || state === 'failed' || state === 'leaving';
  const busy = settling || (state === 'limited' && start.current === undefined);

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
    if (limited) return hold('limited');
    if (!shouldRefresh(pulled)) {
      setState('returning');
      setTravel(0);
      later(reducedMotion() ? 0 : RETURN_MS, reset);
      return;
    }
    setState('syncing');
    setTravel(DISC_REST);
    void onRefresh().then(
      (ok) => live.current && hold(ok ? 'done' : 'failed'),
      () => live.current && shrink(),
    );
  };

  // Scrolling the list during a sync hides the disc and its pill at once.
  const onScroll = () => {
    if (state === 'syncing' && (scroller.current?.scrollTop ?? 0) > 0) setHidden(true);
  };

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, onScroll },
    disc: (
      <PullDisc
        state={hidden ? 'idle' : state}
        look={shown.current.state}
        travel={travel}
        progress={pullProgress(dy)}
        pill={shown.current.pill}
      />
    ),
    /** True from release until a failed disc leaves, so a new error banner waits for the disc. */
    holding: state === 'syncing' || state === 'failed',
  };
}

interface DiscProps {
  state: DiscState;
  /** What the disc draws. While leaving, the state it left. */
  look?: DiscState;
  travel: number;
  progress: number;
  pill: string;
}

/** 40px round disc that drops from under the header, with a pill beside it. State rides on ring, icon, dash, motion and words. */
export function PullDisc({ state, look = state, travel, progress, pill }: DiscProps) {
  const leaving = state === 'leaving';
  const style: CSSProperties = { transform: `translateY(${travel}px)${leaving ? ' scale(0)' : ''}` };
  const ring = look === 'syncing' ? 0.25 : look === 'done' ? 1 : progress;
  const cls = leaving ? `is-${look} is-leaving` : `is-${state}`;
  return (
    <div className={`ph-pull-disc ${cls}`} style={style} aria-hidden={state === 'idle' ? true : undefined}>
      {look === 'failed' ? (
        <span className="ph-pull-alert">
          <AlertIcon size={16} />
        </span>
      ) : look === 'limited' ? (
        <span className="ph-pull-pause" aria-hidden="true">
          <span />
          <span />
        </span>
      ) : (
        <svg className="ph-pull-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <circle className="ph-pull-track" cx="10" cy="10" r="9" />
          <circle className="ph-pull-arc" cx="10" cy="10" r="9" strokeDasharray={RING} strokeDashoffset={RING * (1 - ring)} />
        </svg>
      )}
      <span className="ph-pull-pill" role="status">
        {state === 'idle' ? null : pill}
      </span>
    </div>
  );
}
