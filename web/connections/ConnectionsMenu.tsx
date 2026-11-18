import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopyUrl } from '../copy-link';
import { openExternal } from '../links';
import { formatClock, useClockFormat } from '../time-format';
import { KeyCap } from '../ui';
import { useFocusTrap } from '../useFocusTrap';
import { ChipMark } from './ConnMark';
import { ConnRowView } from './ConnRowView';
import { ConnectionsStrip } from './ConnectionsStrip';
import { CHECKING_ROWS, chipFor, desktopRows, HUB_DOCS_URL, stripFor, subtitle, type ConnRow } from './model';
import { useConnectionsKey } from './useConnectionsKey';
import type { ConnectionsView } from './useConnections';
import { api } from '../api';

interface PopoverProps {
  view: ConnectionsView;
  onClose: () => void;
  onPair: () => void;
  onGithub: () => void;
}

/** Device rows past four fold into one `N more devices` row, which opens them in place. */
function withMore(rows: ConnRow[], hidden: ConnRow[], more: boolean): (ConnRow | 'more')[] {
  if (hidden.length === 0) return rows;
  const last = rows.reduce((at, r, i) => (r.key.startsWith('device:') ? i : at), -1);
  return [...rows.slice(0, last + 1), ...(more ? hidden : ['more' as const]), ...rows.slice(last + 1)];
}

function ConnectionsPopover({ view, onClose, onPair, onGithub }: PopoverProps) {
  const [renaming, setRenaming] = useState<string>();
  const [more, setMore] = useState(false);
  const trap = useFocusTrap(() => (renaming ? setRenaming(undefined) : onClose()));
  const copy = useCopyUrl();
  const [clock] = useClockFormat();
  const ctx = { now: Date.now(), clock };
  const b = view.data;
  const { rows, hidden } = b ? desktopRows(b, ctx) : { rows: CHECKING_ROWS, hidden: [] };
  const list = withMore(rows, hidden, more);

  useEffect(() => {
    trap.current?.querySelector<HTMLElement>('.cx-action, .cx-footer .btn')?.focus();
    // Focus lands once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = (row: ConnRow) => {
    if (row.action === 'details' || row.action === 'fix') {
      onClose();
      onGithub();
    } else if (row.action === 'copy' && b?.tailscale.url) void copy?.(b.tailscale.url);
    else if (row.action === 'setup') openExternal(HUB_DOCS_URL);
    else if (row.action === 'rename') setRenaming(row.key);
  };

  return (
    <div
      ref={trap}
      className="cx-pop"
      role="dialog"
      aria-label="Connections"
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.stopPropagation();
      }}
    >
      <div className="cx-head">
        <h2 className="cx-title">Connections</h2>
        <p className="cx-sub">{subtitle(b)}</p>
        <KeyCap>Esc</KeyCap>
      </div>
      <ConnectionsStrip strip={stripFor(b)} />
      <ul className={`cx-rows${list.length > 6 ? ' is-scroll' : ''}`}>
        {list.map((row) =>
          row === 'more' ? (
            <li key="more" className="cx-row cx-more">
              <button type="button" className="cx-action" onClick={() => setMore(true)}>
                {hidden.length} more {hidden.length === 1 ? 'device' : 'devices'}
              </button>
            </li>
          ) : (
            <ConnRowView
              key={row.key}
              row={row}
              onAction={act}
              rename={
                renaming === row.key && row.deviceId
                  ? {
                      save: async (name) => {
                        await api.renameDevice(row.deviceId!, name);
                        setRenaming(undefined);
                        view.reload();
                      },
                      cancel: () => setRenaming(undefined),
                    }
                  : undefined
              }
            />
          ),
        )}
      </ul>
      <div className="cx-footer">
        {b?.tailscale.on === false ? null : (
          // Pairing needs phone access, so the button leaves with it.
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onPair();
            }}
          >
            Pair device
          </button>
        )}
        <button
          type="button"
          className="btn"
          aria-busy={view.busy || undefined}
          aria-disabled={view.busy || undefined}
          onClick={() => !view.busy && void view.check()}
        >
          {view.busy ? <span className="spinner" aria-hidden="true" /> : null}
          Check now
        </button>
        <span className="cx-checked" role="status">
          {b ? `Checked ${formatClock(new Date(b.checkedAt), clock)}` : ''}
        </span>
      </div>
    </div>
  );
}

interface ConnectionsMenuProps {
  view: ConnectionsView;
  onPair: () => void;
  onGithub: () => void;
  /** `g c` works while no dialog owns the keyboard. */
  keys: boolean;
}

/** The top bar chip, worst state wins, and its anchored popover. */
export function ConnectionsMenu({ view, onPair, onGithub, keys }: ConnectionsMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [clock] = useClockFormat();
  const chip = chipFor(view.data, { now: Date.now(), clock });
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  useConnectionsKey(keys, toggle);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  return (
    <div className="cx-menu" ref={root}>
      <button
        type="button"
        className={`cx-chip is-${chip.tone}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-keyshortcuts="g c"
        aria-label={`Connections: ${chip.label}`}
        title={`${chip.label}. Connections (g c)`}
        onClick={toggle}
      >
        <ChipMark tone={chip.tone} />
        <span className="cx-chip-full">{chip.label}</span>
        {chip.short ? <span className="cx-chip-short">{chip.short}</span> : null}
      </button>
      {open ? (
        <>
          <span className="cx-arrow" aria-hidden="true" />
          <ConnectionsPopover view={view} onClose={close} onPair={onPair} onGithub={onGithub} />
        </>
      ) : null}
    </div>
  );
}
