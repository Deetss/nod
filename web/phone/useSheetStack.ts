import { useCallback, useEffect, useReducer, useRef } from 'react';
import { depthAfterBack, isRoot, layersAfterBack, stackReducer, type Level } from './sheet-stack';

export interface SheetStack {
  stack: readonly Level[];
  push: (level: Level) => void;
  replaceTop: (level: Level) => void;
  /** Swaps the whole stack for one root sheet. History keeps exactly one entry for it, so Back leaves to the list. */
  replaceRoot: (level: Level) => void;
  /** Opens a layer above the sheets (search, a non-default tab). Call from a user gesture. Back closes it. */
  openLayer: (key: string, onBack: () => void) => void;
  /** Closes the top layer through History so the back gesture and the UI agree. */
  closeLayer: (key: string) => void;
  /** Opens a root from a notification navigation. The navigation already made the entry, so the sheet is written into it. */
  openFromNavigation: (level: Level) => void;
  /** Closes the top level. Goes through History so the back gesture and Close agree. */
  pop: () => void;
}

interface Layer {
  key: string;
  onBack: () => void;
}

const entry = (depth: number, layers: number) => ({ phDepth: depth, phLayers: layers });

/**
 * Sheet stack tied to the History API. Each visible level owns one history entry whose `phDepth` is
 * its stack depth, and each layer owns one entry whose `phLayers` counts the layers open at that point.
 * Back (`popstate`) closes the levels and layers above the restored entry.
 */
export function useSheetStack(initial: readonly Level[] = []): SheetStack {
  const [stack, dispatch] = useReducer(stackReducer, initial);
  const size = useRef(stack.length);
  size.current = stack.length;
  const layers = useRef<Layer[]>([]);
  // A root placed over an open stack waits here until History has moved back to depth 1.
  const pendingRoot = useRef<Level | undefined>(undefined);
  // True while the entry at depth 1 is the one the notification navigation created. Nothing sits below it.
  const fromNavigation = useRef(false);

  // A reload or an earlier mount can leave this entry at a depth the new stack does not have.
  useEffect(() => {
    window.history.replaceState(entry(initial.length, 0), '');
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      // Layers above the restored entry were closed by Back.
      const closed = layers.current.splice(layersAfterBack(e.state));
      closed.forEach((l) => l.onBack());
      const depth = depthAfterBack(e.state);
      if (depth === 0) fromNavigation.current = false;
      dispatch({ type: 'truncate', to: depth });
      if (pendingRoot.current) {
        pendingRoot.current = undefined;
        window.history.replaceState(entry(1, layers.current.length), '');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Puts a root in the only level it can hold. A root over an open stack moves History back to depth 1
  // and rewrites that entry, so the entries that covered the old root leave history.
  const placeRoot = useCallback((level: Level) => {
    const depth = depthAfterBack(window.history.state);
    dispatch({ type: 'replaceAll', level });
    if (depth === 0) {
      window.history.pushState(entry(1, layers.current.length), '');
    } else if (depth === 1) {
      window.history.replaceState(entry(1, layers.current.length), '');
    } else {
      pendingRoot.current = level;
      window.history.go(1 - depth);
    }
  }, []);

  const push = useCallback(
    (level: Level) => {
      if (isRoot(level)) return placeRoot(level);
      window.history.pushState(entry(size.current + 1, layers.current.length), '');
      dispatch({ type: 'push', level });
    },
    [placeRoot],
  );

  const replaceTop = useCallback((level: Level) => dispatch({ type: 'replaceTop', level }), []);

  const openLayer = useCallback((key: string, onBack: () => void) => {
    layers.current = [...layers.current, { key, onBack }];
    window.history.pushState(entry(size.current, layers.current.length), '');
  }, []);

  const closeLayer = useCallback((key: string) => {
    const top = layers.current[layers.current.length - 1];
    if (top?.key !== key || layersAfterBack(window.history.state) !== layers.current.length) return;
    layers.current = layers.current.slice(0, -1);
    window.history.back();
  }, []);

  // Pushing here would be skipped by Chrome's rule for entries made without user activation.
  const openFromNavigation = useCallback((level: Level) => {
    window.history.replaceState(entry(1, 0), '', window.location.pathname);
    fromNavigation.current = true;
    dispatch({ type: 'replaceAll', level });
  }, []);

  const pop = useCallback(() => {
    const n = size.current;
    if (n === 0) return;
    if (depthAfterBack(window.history.state) !== n) {
      dispatch({ type: 'pop' });
    } else if (n === 1 && fromNavigation.current) {
      // Nothing below the navigation's entry, so Close drops the depth itself instead of leaving the app.
      fromNavigation.current = false;
      window.history.replaceState(entry(0, 0), '', window.location.pathname);
      dispatch({ type: 'pop' });
    } else {
      window.history.back();
    }
  }, []);

  return { stack, push, replaceTop, replaceRoot: placeRoot, openLayer, closeLayer, openFromNavigation, pop };
}
