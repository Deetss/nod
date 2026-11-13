import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  HANDLE_W,
  MIN_WIDTHS,
  clampWidth,
  fitWidths,
  maxWidth,
  parseWidths,
  resetWidths,
  type PaneLayout,
} from './pane-widths';

const LAYOUTS: readonly PaneLayout[] = ['three', 'two', 'issues', 'issues-two'];

// v2 drops widths saved while the container measurement could be stale.
const key = (layout: PaneLayout) => `nod-panes-v2-${layout}`;

function load(layout: PaneLayout): number[] | null {
  try {
    return parseWidths(layout, window.localStorage.getItem(key(layout)));
  } catch {
    return null;
  }
}

function save(layout: PaneLayout, widths: readonly number[] | null): void {
  try {
    if (widths) window.localStorage.setItem(key(layout), JSON.stringify(widths));
    else window.localStorage.removeItem(key(layout));
  } catch {
    // storage unavailable; widths last for this session only
  }
}

export interface PaneWidths {
  /** Fitted widths of the fixed panes (Inbox, then Detail at three panes). */
  widths: number[];
  /** `grid-template-columns` value with a handle column after each fixed pane. */
  columns: string;
  min: (index: number) => number;
  max: (index: number) => number;
  setWidth: (index: number, px: number) => void;
  reset: () => void;
}

/** Widths of the resizable panes for one layout, persisted per layout. */
export function usePaneWidths(layout: PaneLayout, container: RefObject<HTMLElement | null>): PaneWidths {
  // null means "no saved widths": the spec widths for the current container apply.
  const [store, setStore] = useState<Record<PaneLayout, number[] | null>>(() => ({
    three: load('three'),
    two: load('two'),
    issues: load('issues'),
    'issues-two': load('issues-two'),
  }));
  const [total, setTotal] = useState(() => window.innerWidth);
  const observed = useRef<{ el: HTMLElement; ro: ResizeObserver }>(undefined);

  // The container can mount and unmount (PRs and Issues swap views), so the
  // observer follows whichever element the ref holds after each render.
  useLayoutEffect(() => {
    const el = container.current;
    if (el === observed.current?.el) return;
    observed.current?.ro.disconnect();
    observed.current = undefined;
    if (!el) return;
    setTotal(el.clientWidth);
    const ro = new ResizeObserver(() => setTotal(el.clientWidth));
    ro.observe(el);
    observed.current = { el, ro };
  });

  useEffect(
    () => () => {
      observed.current?.ro.disconnect();
      observed.current = undefined;
    },
    [],
  );

  useEffect(() => {
    for (const l of LAYOUTS) save(l, store[l]);
  }, [store]);

  const base = store[layout] ?? resetWidths(layout, total);
  const widths = fitWidths(layout, base, total);

  const setWidth = useCallback(
    (index: number, px: number) =>
      setStore((s) => {
        const current = fitWidths(layout, s[layout] ?? resetWidths(layout, total), total);
        return { ...s, [layout]: clampWidth(layout, current, index, px, total) };
      }),
    [layout, total],
  );
  const reset = useCallback(() => setStore((s) => ({ ...s, [layout]: null })), [layout]);

  const cols = widths.flatMap((w) => [`${w}px`, `${HANDLE_W}px`]);
  return {
    widths,
    columns: [...cols, 'minmax(0, 1fr)'].join(' '),
    min: (i) => MIN_WIDTHS[layout][i] ?? 0,
    max: (i) => maxWidth(layout, widths, i, total),
    setWidth,
    reset,
  };
}
