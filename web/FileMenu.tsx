import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DiffFile } from '../shared/types';
import { fileActions, type FileHead } from './file-actions';
import { placeUnder } from './FixMenu';
import { openExternal } from './links';

export function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}

interface MenuProps {
  head: FileHead;
  file: DiffFile;
  anchor: HTMLButtonElement;
  onClose: () => void;
}

/** View / Edit / Delete file. Every row opens GitHub; GitHub's own screen commits an edit or a delete. */
function Menu({ head, file, anchor, onClose }: MenuProps) {
  const rows = fileActions(head, file);
  const enabled = rows.flatMap((r, i) => (r.url ? [i] : []));
  const [focus, setFocus] = useState(enabled[0] ?? -1);
  const [pos, setPos] = useState<{ top: number; left: number }>();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => ref.current?.focus({ preventScroll: true }), []);

  useLayoutEffect(() => {
    if (ref.current) setPos(placeUnder(anchor, ref.current));
    const away = (e: MouseEvent) => {
      if (e.target instanceof Node && (ref.current?.contains(e.target) || anchor.contains(e.target))) return;
      onClose();
    };
    const scrolled = (e: Event) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) onClose();
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  const pick = (i: number) => {
    const url = rows[i]?.url;
    if (!url) return;
    openExternal(url);
    onClose();
  };
  const step = (dir: 1 | -1) => {
    const at = enabled.indexOf(focus);
    const next = enabled[Math.min(enabled.length - 1, Math.max(0, at + dir))];
    if (next !== undefined) setFocus(next);
  };

  return createPortal(
    <div
      ref={ref}
      className="picker fix-menu fix-menu-fixed file-menu"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? undefined : 0 }}
      role="menu"
      aria-label={`File actions for ${file.path}`}
      tabIndex={-1}
      // React bubbles portal events to the file header, whose click would fold the file.
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        else if (e.key === 'ArrowDown') step(1);
        else if (e.key === 'ArrowUp') step(-1);
        else if (e.key === 'Enter') pick(focus);
        else return;
        e.preventDefault();
      }}
    >
      {rows.map((r, i) => (
        <div
          key={r.kind}
          role="menuitem"
          aria-disabled={r.url ? undefined : true}
          className={`picker-row fix-menu-row${i === focus ? ' is-focus' : ''}${r.url ? '' : ' is-disabled'}${r.danger ? ' file-menu-danger' : ''}`}
          onMouseEnter={() => r.url && setFocus(i)}
          onClick={() => pick(i)}
        >
          <span className="fix-menu-text">
            <span className="fix-menu-title">{r.title}</span>
            <span className="fix-menu-sub">{r.sub}</span>
          </span>
          {i === focus && r.url ? <span className="picker-act muted">Enter</span> : null}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** The … button at the end of a diff file header. Focus returns to it when the menu closes. */
export function FileMenuButton({ head, file }: { head: FileHead; file: DiffFile }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    btn.current?.focus({ preventScroll: true });
  }, []);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`btn icon-btn df-more${open ? ' is-open' : ''}`}
        aria-label={`File actions for ${file.path}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <DotsIcon />
      </button>
      {open && btn.current ? <Menu head={head} file={file} anchor={btn.current} onClose={close} /> : null}
    </>
  );
}
