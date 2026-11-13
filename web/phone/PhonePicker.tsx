import { useEffect, useRef, type ReactNode } from 'react';
import { usePickerState, type PickerItem } from '../issues/picker-state';
import { CloseIcon } from './PhoneIcons';
import { PhoneSheet } from './PhoneSheet';
import { useKeyboardInset } from './useKeyboardInset';

export interface PhonePickerProps {
  /** Sheet title and dialog name, such as `Labels`. */
  title: string;
  /** Header sub line, the repo. */
  sub: string;
  filterPlaceholder: string;
  items: PickerItem[];
  /** Values checked when the picker opens. */
  initial: ReadonlySet<string>;
  /** Single choice with radios; a tap on the chosen row does nothing. */
  single?: boolean;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  /** Shown when the list is empty and nothing is filtered. */
  emptyText?: string;
  /** Note under the list. */
  note?: ReactNode;
  /** Checked rows beyond this many turn off, with `Limit reached`. */
  limit?: number;
  autoFocus?: boolean;
  /** Labels only. Creates the item and rejects with the server message. */
  create?: (name: string) => Promise<PickerItem>;
  /** The request is running: Apply shows its busy state and the sheet will not close. */
  busy?: boolean;
  onApply: (picked: ReadonlySet<string>) => void;
  onClose: () => void;
  depth: number;
  covered: boolean;
}

export const applyText = (changed: number): string =>
  changed === 0 ? 'Apply' : `Apply (${changed} ${changed === 1 ? 'change' : 'changes'})`;

function PlusGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Sticky filter, option rows, create row and a pinned Apply bar. One sheet for labels, assignees and milestone. */
export function PhonePicker(p: PhonePickerProps) {
  const st = usePickerState({ ...p, sticky: p.single });
  const { picked, q, shown, showCreate, name, creating, createError, announce, toggle, doCreate, changed } = st;
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const height = useKeyboardInset();

  useEffect(() => {
    if (p.autoFocus) input.current?.focus();
  }, [p.autoFocus]);

  // A label made in the picker lands checked at the end of the list; bring it into view.
  const madeCount = useRef(0);
  useEffect(() => {
    const n = shown.length;
    if (!creating && q === '' && n > madeCount.current && madeCount.current > 0) {
      list.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
    }
    madeCount.current = n;
  }, [shown.length, creating, q]);

  const atLimit = p.limit !== undefined && picked.size >= p.limit;
  const close = () => {
    if (!p.busy) p.onClose();
  };
  const canApply = changed > 0 && !p.loading && !p.error;

  const caption = (value: string, on: boolean): string => {
    const was = p.initial.has(value);
    if (on === was) return '';
    if (p.single) return on ? 'set' : 'remove';
    return on ? 'add' : 'remove';
  };

  return (
    <PhoneSheet
      title={p.title}
      sub={p.sub}
      depth={p.depth}
      covered={p.covered}
      keyboardHeight={height}
      onClose={close}
      pinned={
        <div className="ph-pk-filter">
          <input
            ref={input}
            className="ph-pk-input"
            type="text"
            value={q}
            placeholder={p.filterPlaceholder}
            aria-label={p.filterPlaceholder}
            enterKeyHint="done"
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(e) => st.setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                input.current?.blur();
              }
            }}
          />
          {q ? (
            <button
              type="button"
              className="ph-pk-clear"
              aria-label="Clear filter"
              onClick={() => {
                st.setQ('');
                input.current?.focus();
              }}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
      }
      bar={
        <>
          <button
            type="button"
            className={`ph-btn is-primary${canApply && !p.busy ? '' : p.busy ? ' is-busy' : ' is-off'}`}
            disabled={!canApply && !p.busy}
            aria-disabled={p.busy || undefined}
            aria-busy={p.busy || undefined}
            onClick={() => {
              if (!p.busy && canApply) p.onApply(picked);
            }}
          >
            {p.busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Applying...
              </>
            ) : (
              applyText(changed)
            )}
          </button>
          <button type="button" className="ph-btn ph-pk-cancel" disabled={p.busy} onClick={close}>
            Cancel
          </button>
        </>
      }
    >
      <div
        ref={list}
        className="ph-pk-list"
        role={p.single ? 'radiogroup' : 'listbox'}
        aria-label={p.title}
        aria-multiselectable={p.single ? undefined : true}
      >
        {p.loading ? <p className="ph-pk-msg ph-muted">Loading...</p> : null}
        {p.error ? (
          <div className="ph-pk-msg" role="alert">
            <span className="ph-pk-err">{p.error}</span>
            {p.onRetry ? (
              <button type="button" className="ph-btn" onClick={p.onRetry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {!p.loading && !p.error && shown.length === 0 && !showCreate ? (
          <p className="ph-pk-msg ph-muted">{q ? 'No matches.' : (p.emptyText ?? 'Nothing to pick.')}</p>
        ) : null}
        {shown.map((item) => {
          const on = picked.has(item.value);
          const off = !p.single && atLimit && !on;
          const word = off ? 'Limit reached' : caption(item.value, on);
          const state = p.single
            ? {}
            : { 'aria-selected': on };
          const hint = word && !off ? `, will be ${word === 'add' ? 'added' : 'removed'}` : '';
          return (
            <button
              key={item.value}
              type="button"
              role={p.single ? 'radio' : 'option'}
              aria-checked={p.single ? on : undefined}
              {...state}
              aria-label={`${item.text}, ${on ? 'selected' : 'not selected'}${hint}`}
              aria-disabled={off || undefined}
              className={`ph-pk-row${on ? ' is-on' : ''}${off ? ' is-off' : ''}`}
              onClick={() => {
                if (!off) toggle(item.value);
              }}
            >
              <span className={p.single ? 'ph-pk-radio' : 'ph-pk-check'} aria-hidden="true" />
              <span className="ph-pk-node">{item.node}</span>
              <span className="ph-pk-cap">{word}</span>
            </button>
          );
        })}
        {showCreate ? (
          <button
            type="button"
            role="option"
            aria-selected="false"
            aria-label={`Create label ${name}`}
            aria-disabled={creating || undefined}
            aria-busy={creating || undefined}
            className="ph-pk-row ph-pk-create"
            onClick={() => void doCreate()}
          >
            <span className="ph-pk-glyph">{creating ? <span className="spinner" aria-hidden="true" /> : <PlusGlyph />}</span>
            {creating ? <span className="ph-muted">Creating...</span> : <span className="ph-pk-node">{`Create label '${name}'`}</span>}
          </button>
        ) : null}
      </div>
      {createError ? (
        <div className="ph-pk-inline" role="alert">
          <span aria-hidden="true">×</span> {createError}
        </div>
      ) : null}
      {showCreate ? <p className="ph-pk-note">New labels are grey. Recolour on GitHub.</p> : null}
      {p.note ? <p className="ph-pk-note">{p.note}</p> : null}
      <span className="sr-only" role="status">
        {announce}
      </span>
    </PhoneSheet>
  );
}
