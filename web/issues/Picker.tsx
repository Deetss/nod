import { useEffect, useRef } from 'react';
import { Btn } from '../ui';
import { useFocusTrap } from '../useFocusTrap';
import { usePickerState, type PickerItem, type PickerOrder } from './picker-state';

export type { PickerItem };

interface PickerProps {
  title: string;
  filterPlaceholder: string;
  items: PickerItem[];
  /** Values checked when the picker opens. */
  initial: ReadonlySet<string>;
  /** Single choice instead of a set. */
  single?: boolean;
  loading?: boolean;
  error?: string;
  note?: string;
  applyLabel?: string;
  /** Where the popover sits. `sidebar` hangs under the Labels card; `center` floats mid-pane. */
  anchor: 'sidebar' | 'center';
  /** Labels only. Creates the item and rejects with the server message on failure. */
  create?: (name: string) => Promise<PickerItem>;
  /** Row order keys, read once when the picker opens. Defaults to `initial` checked first. */
  ranked?: PickerOrder;
  onApply: (picked: ReadonlySet<string>) => void;
  onCancel: () => void;
}

function PlusGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Popover with a filter box and a checkbox row per item. Up and Down move, Space toggles,
 * Enter applies, Esc cancels. With `create`, a last row makes an item from the filter text.
 */
export function Picker(p: PickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const st = usePickerState(p);
  const { picked, q, shown, focus, setFocus, rows, showCreate, createFocused, name, creating, createError, announce, toggle, doCreate, changed } = st;

  useEffect(() => input.current?.focus(), []);
  const trap = useFocusTrap();

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      p.onCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocus((f) => Math.min(rows - 1, f + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocus((f) => Math.max(0, f - 1));
    } else if (e.key === ' ' && shown[focus] && e.target === input.current && q === '') {
      e.preventDefault();
      toggle(shown[focus].value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (createFocused) void doCreate();
      else p.onApply(picked);
    }
  };

  return (
    <div className="scrim picker-scrim" onMouseDown={p.onCancel}>
      <div
        ref={trap}
        className={`picker picker-${p.anchor}`}
        role="dialog"
        aria-modal="true"
        aria-label={p.title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <h2 className="picker-title">{p.title}</h2>
        <input
          ref={input}
          className="picker-filter"
          value={q}
          placeholder={p.filterPlaceholder}
          aria-label={p.filterPlaceholder}
          onChange={(e) => st.setQ(e.target.value)}
        />
        <div className="picker-list" role="listbox">
          {p.loading ? <div className="muted picker-msg">Loading...</div> : null}
          {p.error ? <div className="picker-msg" role="alert">{p.error}</div> : null}
          {shown.map((item, i) => {
            const on = picked.has(item.value);
            const was = p.initial.has(item.value);
            return (
              <label
                key={item.value}
                role="option"
                aria-selected={on}
                className={`picker-row${i === focus ? ' is-focus' : ''}`}
                onMouseEnter={() => setFocus(i)}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(item.value)} tabIndex={-1} />
                {item.node}
                <span className="muted picker-act">{p.single ? '' : was ? 'remove' : 'add'}</span>
              </label>
            );
          })}
          {showCreate ? (
            <div
              role="option"
              aria-selected="false"
              aria-label={`Create label ${name}`}
              aria-keyshortcuts="Enter"
              aria-disabled={creating || undefined}
              aria-busy={creating || undefined}
              className={`picker-row picker-create${focus === shown.length ? ' is-focus' : ''}`}
              onMouseEnter={() => setFocus(shown.length)}
              onClick={() => void doCreate()}
            >
              <span className="picker-create-glyph">{creating ? <span className="spinner" aria-hidden="true" /> : <PlusGlyph />}</span>
              {creating ? (
                <span className="muted">Creating...</span>
              ) : (
                <>
                  <span className="picker-create-text" title={`Create label '${name}'`}>{`Create label '${name}'`}</span>
                  <span className="muted picker-act">Enter</span>
                </>
              )}
            </div>
          ) : null}
        </div>
        {createError ? <div className="picker-msg" role="alert">{createError}</div> : null}
        <span className="sr-only" role="status">{announce}</span>
        <p className="muted small picker-note">
          {changed === 0 ? 'Nothing changed. ' : `${changed} will be set. `}
          {p.note ?? ''}
        </p>
        <div className="picker-actions">
          <Btn primary keyHint="Enter" onClick={() => p.onApply(picked)}>
            {p.applyLabel ?? 'Apply'}
          </Btn>
          <Btn keyHint="Esc" onClick={p.onCancel}>
            Cancel
          </Btn>
        </div>
      </div>
    </div>
  );
}
