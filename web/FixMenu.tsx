import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, XIcon } from './ui';
import type { MenuControls } from './useFixChecks';
import type { FixStatus } from '../shared/fix-checks';
import { fixMenuLabel, fixRowsFor, type FixRow } from './fix-rows';

const MENU_GAP = 4;
const EDGE = 8;

interface MenuProps {
  fix: MenuControls;
  onClose: () => void;
  /** Comments mode: the button the menu hangs from. The menu is fixed to the page, not the card. */
  anchor?: RefObject<HTMLElement | null>;
}

interface Pos {
  top: number;
  left: number;
}

/** Fixed position under the anchor, right edges aligned. Flips above when the page has no room below. */
export function placeUnder(anchor: HTMLElement, menu: HTMLElement): Pos {
  const r = anchor.getBoundingClientRect();
  const { offsetWidth: w, offsetHeight: h } = menu;
  const below = r.bottom + MENU_GAP;
  const top = below + h > window.innerHeight - EDGE ? Math.max(EDGE, r.top - MENU_GAP - h) : below;
  return { top, left: Math.max(EDGE, Math.min(r.right - w, window.innerWidth - w - EDGE)) };
}

/** Popover under the pressed Fix button. Focus lands on the first row; Esc returns it to the button. */
function FixMenu({ fix, onClose, anchor }: MenuProps) {
  const rows = fixRowsFor(fix);
  const conflicts = fix.mode === 'conflicts';
  const comments = fix.mode === 'comments';
  const busy = fix.busy === true;
  const [focus, setFocus] = useState(() => Math.max(0, rows.findIndex((r) => !r.disabled)));
  const [pos, setPos] = useState<Pos>();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target;
      if (busy || !(t instanceof Node) || ref.current?.contains(t)) return;
      // The anchor button toggles the menu itself.
      if (comments && anchor?.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose, busy, comments, anchor]);

  // The anchor moves with the detail pane, so any scroll closes the menu; while busy it follows instead.
  useLayoutEffect(() => {
    if (!comments) return;
    const place = () => {
      if (anchor?.current && ref.current) setPos(placeUnder(anchor.current, ref.current));
    };
    place();
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      if (busy) place();
      else onClose();
    };
    const onResize = () => (busy ? place() : onClose());
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [comments, anchor, busy, onClose, fix.count, fix.all]);

  const pick = (r: FixRow | undefined) => r && !r.disabled && !busy && fix.pick(r.kind);
  const spun = (r: FixRow) => busy && (fix.busyKind ? r.kind === fix.busyKind : r.kind === 'dispatch');
  const menu = (
    <div
      ref={ref}
      className={`picker fix-menu${conflicts ? ' fix-menu-wide fix-menu-start' : ''}${comments ? ' fix-menu-wide fix-menu-fixed' : ''}`}
      style={comments ? { top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? undefined : 0 } : undefined}
      role="menu"
      aria-label={fixMenuLabel(fix)}
      aria-busy={busy || undefined}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (busy) {
          e.stopPropagation();
          if (e.key !== 'Tab') e.preventDefault();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocus((i) => Math.min(rows.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocus((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          pick(rows[focus]);
        }
      }}
    >
      {rows.map((r, i) => (
        <div
          key={r.kind}
          role="menuitem"
          aria-disabled={r.disabled || undefined}
          className={`picker-row fix-menu-row${i === focus && !(conflicts && r.disabled) ? ' is-focus' : ''}${r.disabled ? ' is-disabled' : ''}`}
          onMouseEnter={() => (busy ? undefined : setFocus(i))}
          onClick={() => pick(r)}
        >
          <span className="fix-menu-text">
            <span className="fix-menu-title">{r.title}</span>
            <span className="fix-menu-sub">{r.sub}</span>
          </span>
          {spun(r) ? (
            <span className="spinner" aria-hidden="true" />
          ) : i === 0 && !r.disabled && (!conflicts || i === focus) ? (
            <span className="picker-act muted">Enter</span>
          ) : null}
        </div>
      ))}
    </div>
  );
  return comments ? createPortal(menu, document.body) : menu;
}

interface FixButtonProps {
  fix: MenuControls;
  /** A check name for a row button, or ALL_FAILING for the header button. */
  scope: string;
  label: string;
  className: string;
  keyHint?: string;
  /** Overrides the reason from `fix`, e.g. `No comments to fix`. */
  disabled?: string;
  /** Called with the busy state of this button, so the label can swap its chevron for a spinner. */
  children: React.ReactNode | ((busy: boolean) => React.ReactNode);
}

/** A Fix button and the menu it opens. Focus returns to the button when the menu closes. */
export function FixButton({ fix, scope, label, className, keyHint, disabled, children }: FixButtonProps) {
  const btn = useRef<HTMLButtonElement>(null);
  const open = fix.menu === scope;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) btn.current?.focus();
    wasOpen.current = open;
  }, [open]);
  // In comments mode one menu is busy at a time; only its button shows it, the others just ignore clicks.
  const mine = fix.busy === true && (fix.busyScope === undefined || fix.busyScope === scope);
  const off = disabled ?? fix.disabled;
  return (
    <span className="fix-wrap">
      <button
        ref={btn}
        type="button"
        className={`btn ${className}${mine ? ' is-busy' : ''}`}
        aria-label={label}
        aria-busy={mine || undefined}
        aria-disabled={fix.busy || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-keyshortcuts={keyHint}
        disabled={off !== undefined}
        title={off}
        onClick={() => (fix.busy ? undefined : open ? fix.closeMenu() : fix.openMenu(scope))}
      >
        {typeof children === 'function' ? children(mine) : children}
      </button>
      {open ? <FixMenu fix={fix} onClose={fix.closeMenu} anchor={btn} /> : null}
    </span>
  );
}

/** One line under the Checks header after a Fix request. */
export function FixStatusLine({ status }: { status: FixStatus }) {
  return (
    <div className="fix-status">
      <span className={`ci pr-chip ${status.ok ? 'pr-chip-wait' : 'pr-chip-danger'}`} role="status">
        <span className="pr-chip-icon" aria-hidden="true">
          {status.ok ? <CheckIcon size={14} /> : <XIcon size={14} />}
        </span>
        <span className="pr-chip-label">{status.text}</span>
      </span>
    </div>
  );
}
