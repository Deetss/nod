import { useEffect, useRef } from 'react';
import { doneText, type FilterSet } from './bottom-search';
import { PhoneFitSheet } from './PhoneFitSheet';

interface FilterSheetProps {
  title: string;
  sub: string;
  rows: readonly { key: string; label: string; count: number }[];
  value: FilterSet;
  onToggle: (key: string) => void;
  onClear: () => void;
  onClose: () => void;
}

/** One checkbox row per section. Ticks apply at once; Done and Close only shut the sheet. */
export function PhoneFilterSheet(p: FilterSheetProps) {
  const list = useRef<HTMLDivElement>(null);
  const on = p.rows.filter((r) => p.value.has(r.key)).length;

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[role="checkbox"]')?.focus({ preventScroll: true });
  }, []);

  return (
    <PhoneFitSheet
      title={p.title}
      sub={p.sub}
      onClose={p.onClose}
      bar={
        <>
          <button type="button" className={`ph-btn ph-filter-clear${on > 0 ? '' : ' is-off'}`} disabled={on === 0} onClick={p.onClear}>
            Clear
          </button>
          <button type="button" className="ph-btn is-primary" onClick={p.onClose}>
            {doneText(on)}
          </button>
        </>
      }
    >
      <div ref={list} className="ph-pk-list ph-filter-list" role="group" aria-label={p.title}>
        {p.rows.map((r) => {
          const checked = p.value.has(r.key);
          return (
            <button
              key={r.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              className={`ph-pk-row${checked ? ' is-on' : ''}`}
              onClick={() => p.onToggle(r.key)}
            >
              <span className="ph-pk-check" aria-hidden="true" />
              <span className="ph-pk-node">{r.label}</span>
              <span className="ph-pk-cap">{r.count}</span>
            </button>
          );
        })}
      </div>
    </PhoneFitSheet>
  );
}
