import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SUB_ISSUE_LIMIT, type ParentIssue, type SubIssue } from '../../shared/issue-types';
import { progressOf, subRef, type MoveTarget } from '../../shared/sub-issues';
import { DotsIcon } from '../FileMenu';
import { Btn, KeyCap } from '../ui';
import { Avatar, Card, SubStateGlyph } from './parts';
import { repoLabel } from '../repo-label';

export interface SubIssuesCardProps {
  /** The open issue, which is the parent of every row. */
  parent: { repo: string; number: number };
  rows: SubIssue[];
  busyId: string | undefined;
  disabled: boolean;
  onOpen: (child: SubIssue) => void;
  onMove: (id: string, to: MoveTarget | number) => void;
  /** Asks to remove; `next` is the row to focus once it is gone. */
  onRemove: (child: SubIssue, next: string | undefined) => void;
  onCreate: () => void;
  onAdd: () => void;
  /** True while a row has keyboard focus, so the footer can show the row keys. */
  onRowFocus: (focused: boolean) => void;
}

function GripIcon() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden="true">
      {[2, 6, 10].flatMap((y) => [<circle key={`a${y}`} cx="2" cy={y} r="1.2" />, <circle key={`b${y}`} cx="6" cy={y} r="1.2" />])}
    </svg>
  );
}

interface MenuRow {
  label: string;
  key?: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const MENU_GAP = 4;

/** The row element for a sub-issue id under `root`. */
export function subRowEl(root: ParentNode | null, id: string): HTMLElement | undefined {
  return [...(root?.querySelectorAll<HTMLElement>('[data-sub-id]') ?? [])].find((el) => el.dataset.subId === id);
}

/** The row menu hangs under its button and flips up when it would run into the composer. */
function RowMenu({ anchor, rows, label, onClose }: { anchor: HTMLElement; rows: MenuRow[]; label: string; onClose: () => void }) {
  const enabled = rows.flatMap((r, i) => (r.disabled ? [] : [i]));
  const [focus, setFocus] = useState(enabled[0] ?? 0);
  const [pos, setPos] = useState<{ top: number; left: number }>();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  useLayoutEffect(() => {
    const close = () => closeRef.current();
    const menu = ref.current;
    if (!menu) return;
    const r = anchor.getBoundingClientRect();
    const floor = document.querySelector('.composer')?.getBoundingClientRect().top ?? window.innerHeight;
    const below = r.bottom + MENU_GAP;
    const top = below + menu.offsetHeight > floor ? r.top - MENU_GAP - menu.offsetHeight : below;
    setPos({ top: Math.max(MENU_GAP, top), left: Math.max(MENU_GAP, r.right - menu.offsetWidth) });
    const away = (e: MouseEvent) => {
      if (e.target instanceof Node && (menu.contains(e.target) || anchor.contains(e.target))) return;
      close();
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', close);
    };
  }, [anchor]);

  const pick = (i: number) => {
    const row = rows[i];
    if (!row || row.disabled) return;
    onClose();
    row.run();
  };
  const step = (dir: 1 | -1) => {
    const at = enabled.indexOf(focus);
    const next = enabled[Math.min(enabled.length - 1, Math.max(0, at + dir))];
    if (next !== undefined) setFocus(next);
  };

  return createPortal(
    <div
      ref={ref}
      className="picker fix-menu fix-menu-fixed sub-menu"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, opacity: pos ? undefined : 0 }}
      role="menu"
      aria-label={label}
      tabIndex={-1}
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
        <div key={r.label} className={r.danger ? 'sub-menu-danger-wrap' : undefined}>
          {r.danger ? <div className="sub-menu-divider" role="separator" /> : null}
          <div
            role="menuitem"
            aria-disabled={r.disabled || undefined}
            className={`picker-row fix-menu-row sub-menu-row${i === focus ? ' is-focus' : ''}${r.disabled ? ' is-disabled' : ''}${r.danger ? ' sub-menu-danger' : ''}`}
            onMouseEnter={() => !r.disabled && setFocus(i)}
            onClick={() => pick(i)}
          >
            <span className="fix-menu-title">{r.label}</span>
            {r.key ? <span className="picker-act muted">{r.key}</span> : null}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Above the title of a sub-issue. Click or `u` opens the parent. */
export function ParentStrip({ parent, onOpen }: { parent: ParentIssue; onOpen: () => void }) {
  return (
    <button type="button" className="meta-strip sub-parent" onClick={onOpen} title={`${repoLabel(parent.repo)} #${parent.number} ${parent.title}`}>
      <svg className="sub-parent-up" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="muted">Parent</span>
      <span className="sub-parent-ref">
        <SubStateGlyph state={parent.state} size={14} />
        {repoLabel(parent.repo)} #{parent.number}
      </span>
      <span className="sub-parent-title">{parent.title}</span>
      <span className="sub-parent-done muted">
        {parent.progress.completed} of {parent.progress.total} done
      </span>
      <KeyCap>u</KeyCap>
    </button>
  );
}

/** Sub-issues of the open issue, under the description (docs/design/sub-issues-spec.md §3). */
export function SubIssuesCard(p: SubIssuesCardProps) {
  const { rows } = p;
  const listRef = useRef<HTMLUListElement>(null);
  const [focusId, setFocusId] = useState<string>();
  const [menu, setMenu] = useState<{ id: string; anchor: HTMLElement }>();
  const [drag, setDrag] = useState<{ id: string; gap?: number }>();
  const progress = progressOf(rows);
  const full = rows.length >= SUB_ISSUE_LIMIT;
  const tabId = rows.some((r) => r.id === focusId) ? focusId : rows[0]?.id;

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    subRowEl(listRef.current, id)?.focus();
  };

  // A moved row keeps focus at its new place.
  useEffect(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !listRef.current?.contains(el) || !focusId) return;
    if (el.dataset.subId !== focusId) focusRow(focusId);
  }, [rows, focusId]);

  const askRemove = (child: SubIssue) => {
    const at = rows.findIndex((r) => r.id === child.id);
    p.onRemove(child, (rows[at + 1] ?? rows[at - 1])?.id);
  };

  const menuRows = (child: SubIssue): MenuRow[] => {
    const at = rows.findIndex((r) => r.id === child.id);
    const first = at === 0;
    const last = at === rows.length - 1;
    return [
      { label: `Open ${subRef(child, p.parent.repo)}`, key: 'Enter', run: () => p.onOpen(child) },
      { label: 'Move up', key: 'Alt+↑', run: () => p.onMove(child.id, 'up'), disabled: first || p.disabled },
      { label: 'Move down', key: 'Alt+↓', run: () => p.onMove(child.id, 'down'), disabled: last || p.disabled },
      { label: 'Move to top', run: () => p.onMove(child.id, 'top'), disabled: first || p.disabled },
      { label: 'Move to bottom', run: () => p.onMove(child.id, 'bottom'), disabled: last || p.disabled },
      { label: `Remove from #${p.parent.number}`, key: 'Del', run: () => askRemove(child), disabled: p.disabled, danger: true },
    ];
  };

  const onRowKey = (e: React.KeyboardEvent<HTMLLIElement>, child: SubIssue, i: number) => {
    const alt = e.altKey && !e.ctrlKey && !e.metaKey;
    if (alt && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (!p.disabled) p.onMove(child.id, e.key === 'ArrowUp' ? 'up' : 'down');
    } else if (e.altKey || e.ctrlKey || e.metaKey) {
      return;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      focusRow(rows[e.key === 'ArrowUp' ? Math.max(0, i - 1) : Math.min(rows.length - 1, i + 1)]?.id);
    } else if (e.key === 'Enter') {
      p.onOpen(child);
    } else if (e.key === 'Delete') {
      if (!p.disabled) askRemove(child);
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      setMenu({ id: child.id, anchor: e.currentTarget.querySelector<HTMLElement>('.sub-more') ?? e.currentTarget });
    } else if (e.key === 'Escape') {
      e.currentTarget.closest<HTMLElement>('.idetail-scroll')?.focus();
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  /** Drop gap under the pointer, 0 above the first row to n below the last. */
  const gapAt = (y: number): number => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-sub-id]') ?? [])];
    const i = items.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return i < 0 ? items.length : i;
  };

  const drop = () => {
    if (!drag || drag.gap === undefined) return setDrag(undefined);
    const from = rows.findIndex((r) => r.id === drag.id);
    const to = drag.gap > from ? drag.gap - 1 : drag.gap;
    setDrag(undefined);
    if (to !== from) p.onMove(drag.id, to);
  };

  const head =
    progress.total > 0 ? (
      <span className="sub-progress">
        <span className="progress sub-bar" aria-hidden="true">
          <div style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
        </span>
        <span className="sub-done muted">
          {progress.completed} of {progress.total} done
        </span>
      </span>
    ) : (
      <span className="sub-done muted">none</span>
    );

  const menuChild = menu ? rows.find((r) => r.id === menu.id) : undefined;

  return (
    <Card
      title="Sub-issues"
      className="sub-card"
      meta={head}
      hint={
        rows.length > 1 ? (
          <>
            <KeyCap>Alt+↑↓</KeyCap>reorder
          </>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <div className="sub-empty">
          <p>No sub-issues yet. Break this issue into smaller ones, in this repo or another.</p>
          <p className="muted small">Up to 100 per issue, nested up to 8 levels.</p>
        </div>
      ) : (
        <ul
          ref={listRef}
          className={`sub-list${drag ? ' is-dragging' : ''}`}
          aria-label="Sub-issues"
          onFocus={() => p.onRowFocus(true)}
          onBlur={(e) => {
            if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) p.onRowFocus(false);
          }}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            const gap = gapAt(e.clientY);
            if (gap !== drag.gap) setDrag({ ...drag, gap });
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop();
          }}
        >
          {rows.map((child, i) => {
            const closed = child.state !== 'open';
            const busy = p.busyId === child.id;
            return (
              <li
                key={child.id}
                data-sub-id={child.id}
                tabIndex={child.id === tabId ? 0 : -1}
                className={`sub-row${closed ? ' is-closed' : ''}${menu?.id === child.id ? ' is-menu' : ''}${drag?.id === child.id ? ' is-lifted' : ''}${drag?.gap === i ? ' drop-before' : ''}${drag?.gap === rows.length && i === rows.length - 1 ? ' drop-after' : ''}`}
                aria-label={`${subRef(child, p.parent.repo)} ${child.title}`}
                aria-busy={busy || undefined}
                onFocus={() => setFocusId(child.id)}
                onClick={(e) => {
                  if (!(e.target instanceof Element && e.target.closest('button'))) p.onOpen(child);
                }}
                onKeyDown={(e) => onRowKey(e, child, i)}
              >
                <span
                  className="sub-grip"
                  aria-hidden="true"
                  draggable={!p.disabled && rows.length > 1}
                  onDragStart={(e) => {
                    const row = e.currentTarget.closest('li');
                    if (row) e.dataTransfer.setDragImage(row, 16, 18);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', child.id);
                    setDrag({ id: child.id });
                  }}
                  onDragEnd={() => setDrag(undefined)}
                >
                  <GripIcon />
                </span>
                <SubStateGlyph state={child.state} />
                <span className="sub-title" title={child.title}>
                  {child.title}
                </span>
                <span className="sub-ref">{subRef(child, p.parent.repo)}</span>
                <span className="sub-av">{child.assignee ? <Avatar login={child.assignee} size={20} /> : null}</span>
                <span className="sub-more-slot">
                  {busy ? (
                    <span className="spinner" aria-label="Saving" />
                  ) : (
                    <button
                      type="button"
                      className="btn icon-btn sub-more"
                      tabIndex={-1}
                      aria-label="Sub-issue actions"
                      aria-haspopup="menu"
                      aria-expanded={menu?.id === child.id}
                      onClick={(e) => {
                        const anchor = e.currentTarget;
                        setMenu((m) => (m?.id === child.id ? undefined : { id: child.id, anchor }));
                      }}
                    >
                      <DotsIcon />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="sub-foot">
        <Btn keyHint="N" disabled={p.disabled || full} onClick={p.onCreate}>
          Create sub-issue
        </Btn>
        <Btn keyHint="E" disabled={p.disabled || full} onClick={p.onAdd}>
          Add existing
        </Btn>
        <span className="sub-count muted">
          {rows.length} of {SUB_ISSUE_LIMIT}
          {full ? ', the GitHub limit' : ''}
        </span>
      </div>
      {menu && menuChild ? (
        <RowMenu
          anchor={menu.anchor}
          rows={menuRows(menuChild)}
          label={`Actions for ${subRef(menuChild, p.parent.repo)}`}
          onClose={() => {
            setMenu(undefined);
            focusRow(menuChild.id);
          }}
        />
      ) : null}
    </Card>
  );
}
