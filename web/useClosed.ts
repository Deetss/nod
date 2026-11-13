import { useCallback, useEffect, useReducer, useRef } from 'react';
import { STATE_PARAM } from './api';
import {
  closedReducer,
  initialClosed,
  needsLoad,
  nextWindow,
  type ClosedPage,
  type ClosedSectionState,
  type ClosedWindow,
} from '../shared/closed';

export interface ClosedControls<T> {
  state: ClosedSectionState<T>;
  toggle: () => void;
  setWindow: (w: ClosedWindow) => void;
  /** `W`: Last 30 days to Last 90 days and back. Does nothing while the section is collapsed. */
  cycle: () => void;
  more: () => void;
  retry: () => void;
}

/** Fixture captures (`?state=closed-open`, `closed-selected`, `closed-empty`) start with the section open. */
export const captureOpensClosed = (): boolean =>
  STATE_PARAM === 'closed-open' || STATE_PARAM === 'closed-selected' || STATE_PARAM === 'closed-empty';

/** Every `closed-` capture, `closed-collapsed` included, scrolls the section into view. */
export const captureScrollsClosed = (): boolean => STATE_PARAM?.startsWith('closed-') === true;

/** `?state=closed-selected` also selects the newest closed row. */
export const captureSelectsClosed = (): boolean => STATE_PARAM === 'closed-selected';

type Fetch<T> = (window: ClosedWindow, after?: string) => Promise<ClosedPage<T>>;

/**
 * The closed section of a list. It reads nothing until it first opens, then once more each time
 * the window changes. The rows live in this state only, so there is no saved copy to expire.
 */
export function useClosed<T>(fetchPage: Fetch<T>): ClosedControls<T> {
  const [state, dispatch] = useReducer(closedReducer<T>, undefined, () => ({
    ...initialClosed<T>(),
    open: captureOpensClosed(),
  }));
  const fetcher = useRef(fetchPage);
  fetcher.current = fetchPage;

  useEffect(() => {
    if (!needsLoad(state)) return;
    const window = state.window;
    dispatch({ type: 'start' });
    fetcher
      .current(window)
      .then((page) => dispatch({ type: 'loaded', window, append: false, page }))
      .catch((e: unknown) =>
        dispatch({ type: 'failed', window, append: false, error: e instanceof Error ? e.message : 'Request failed' }),
      );
  }, [state.open, state.status, state.window]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = useCallback(() => {
    if (!state.hasMore || state.more || state.status !== 'ready') return;
    const window = state.window;
    dispatch({ type: 'more' });
    fetcher
      .current(window, state.cursor)
      .then((page) => dispatch({ type: 'loaded', window, append: true, page }))
      .catch((e: unknown) =>
        dispatch({ type: 'failed', window, append: true, error: e instanceof Error ? e.message : 'Request failed' }),
      );
  }, [state]);

  const toggle = useCallback(() => dispatch({ type: 'toggle' }), []);
  const setWindow = useCallback((window: ClosedWindow) => dispatch({ type: 'window', window }), []);
  const cycle = useCallback(() => {
    if (state.open) dispatch({ type: 'window', window: nextWindow(state.window) });
  }, [state.open, state.window]);
  const retry = useCallback(() => dispatch({ type: 'retry' }), []);

  return { state, toggle, setWindow, cycle, more, retry };
}
