import { useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useSwipeTabs, type SwipeTabs } from './useSwipeTabs';

export interface TabPager {
  index: number;
  swipe: SwipeTabs;
  /** Tabs shown at least once. The rest render empty until shown or swiped toward. */
  mounted: ReadonlySet<number>;
}

interface TabPagerOptions {
  disabled?: boolean;
  /** The vertical scroller holding the panes, when they do not scroll themselves. */
  scroller?: RefObject<HTMLElement | null>;
}

/** Swipe state for a tab set. A swipe calls `onChange` with the same key a tab tap would. */
export function useTabPager<K>(order: readonly K[], value: K, onChange: (k: K) => void, opts: TabPagerOptions = {}): TabPager {
  const index = Math.max(0, order.indexOf(value));
  const [mounted, setMounted] = useState<ReadonlySet<number>>(() => new Set([index]));
  const mount = (i: number) => setMounted((m) => (m.has(i) ? m : new Set([...m, i])));
  if (!mounted.has(index)) mount(index);
  const swipe = useSwipeTabs({
    index,
    count: order.length,
    onChange: (i) => onChange(order[i] ?? value),
    onPeek: mount,
    ...opts,
  });
  return { index, swipe, mounted };
}

interface SwipePagerProps {
  pager: TabPager;
  /** One node per tab, in tab order. */
  panes: ReactNode[];
  /** Panes sit in the parent's scroller and take their own height, instead of filling and scrolling. */
  flow?: boolean;
}

/** The panes of a tab set side by side. Only the active one is in the tab and reading order. */
export function SwipePager({ pager, panes, flow }: SwipePagerProps) {
  const { index, swipe, mounted } = pager;
  return (
    <div ref={swipe.pagerRef} className={`ph-pager${flow ? ' is-flow' : ''}`} {...swipe.handlers}>
      <div ref={swipe.trackRef} className="ph-pager-track">
        {panes.map((pane, i) => (
          <div
            key={i}
            className={`ph-pane${i === index ? ' is-active' : ''}`}
            inert={i !== index}
            aria-hidden={i !== index || undefined}
          >
            {mounted.has(i) ? pane : null}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SheetTabsProps<K extends string> {
  tabs: readonly (readonly [K, ReactNode])[];
  value: K;
  onChange: (k: K) => void;
  pager: TabPager;
  /** Sticks to the top of the sheet's scroller. */
  sticky?: boolean;
}

/** A sheet's tab strip, with the underline a swipe moves. */
export function SheetTabs<K extends string>({ tabs, value, onChange, pager, sticky }: SheetTabsProps<K>) {
  return (
    <div className={`ph-tabs${sticky ? ' ph-sticky' : ''}`} role="tablist" style={{ '--tab-count': tabs.length } as CSSProperties}>
      <div ref={pager.swipe.indicatorRef} className="ph-tabs-ind" aria-hidden="true" />
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          className={value === key ? 'is-active' : undefined}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
