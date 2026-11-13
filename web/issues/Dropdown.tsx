import { useEffect, useRef, useState } from 'react';
import { Chevron } from '../ui';

interface DropdownProps {
  /** Text on the button, e.g. "Repo: all". */
  label: string;
  /** Short text used when the pane is narrow. */
  shortLabel: string;
  narrow: boolean;
  active: boolean;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** When set, the first row clears the filter and reads this. */
  clearLabel?: string;
}

/** Filter button with a menu of options. The active filter uses the accent style. */
export function Dropdown(p: DropdownProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const pick = (v: string | undefined) => {
    p.onChange(v);
    setOpen(false);
  };

  return (
    <div className="dd" ref={root}>
      <button
        type="button"
        className={`btn dd-btn${p.active ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dd-label">{p.narrow ? p.shortLabel : p.label}</span>
        <Chevron open size={14} />
      </button>
      {open ? (
        <ul className="dd-menu" role="listbox">
          {p.clearLabel ? (
            <li>
              <button type="button" role="option" aria-selected={p.value === undefined} onClick={() => pick(undefined)}>
                {p.clearLabel}
              </button>
            </li>
          ) : null}
          {p.options.map((o) => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={p.value === o.value} onClick={() => pick(o.value)}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
