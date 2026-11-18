import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnMark } from '../connections/ConnMark';
import { HUB_DOCS_URL, type ConnRow, type LinkState } from '../connections/model';
import { phoneRail } from '../connections/phone-model';
import type { ConnectionsView } from '../connections/useConnections';
import { formatClock, useClockFormat } from '../time-format';
import { useFocusTrap } from '../useFocusTrap';
import { copyLink } from './link-actions';
import { useSwipeClose } from './useSwipeClose';

const TOAST_MS = 2000;

function RailRow({ row, link, onCopy }: { row: ConnRow; link?: LinkState | undefined; onCopy?: (() => void) | undefined }) {
  return (
    <li className={`ph-cx-row is-${row.mark}`}>
      <ConnMark mark={row.mark} size={row.mark === 'hub' ? 16 : 14} />
      {link ? <span className={`ph-cx-link is-${link}`} aria-hidden="true" /> : null}
      <span className="ph-cx-text">
        <span className="ph-cx-name">{row.name}</span>
        <span className={`ph-cx-detail${row.mono ? ' is-mono' : ''}`}>{row.detail}</span>
      </span>
      {row.action === 'copy' && onCopy ? (
        <button type="button" className="ph-cx-action" onClick={onCopy}>
          Copy
        </button>
      ) : null}
      {row.action === 'setup' ? (
        <a className="ph-cx-action" href={HUB_DOCS_URL} target="_blank" rel="noopener noreferrer">
          Set up a hub
        </a>
      ) : null}
    </li>
  );
}

/** Connections on the phone: the path it uses as a rail, then the hub's other devices. Read only. */
export function PhoneConnectionsSheet({ view, onClose }: { view: ConnectionsView; onClose: () => void }) {
  const trap = useFocusTrap(onClose);
  const swipe = useSwipeClose(onClose);
  const [clock] = useClockFormat();
  const [toast, setToast] = useState<{ ok: boolean; message: string }>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const b = view.data;
  const url = b?.tailscale.url;
  const copy = useCallback(async () => {
    if (!url) return;
    const res = await copyLink(url);
    setToast({ ok: res.ok, message: res.message });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(undefined), TOAST_MS);
  }, [url]);

  const { subtitle, rail, links, others } = phoneRail(b, { now: Date.now(), clock });
  return (
    <div className="ph-scrim ph-conn-scrim" style={swipe.scrimStyle} onClick={onClose}>
      <div
        ref={trap}
        className="ph-asheet ph-cx-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Connections"
        onClick={(e) => e.stopPropagation()}
        {...swipe.sheet}
      >
        <div className="ph-strip" {...swipe.bind}>
          <span className="ph-handle" aria-hidden="true" />
          <h2 className="ph-cx-title">Connections</h2>
          <p className="ph-cx-sub">{subtitle}</p>
        </div>
        <div className="ph-asheet-body ph-cx-body">
          <ol className="ph-cx-rail" aria-label="How this phone reaches the hub">
            {rail.map((row, i) => (
              <RailRow key={row.key} row={row} link={links[i]} onCopy={url ? () => void copy() : undefined} />
            ))}
          </ol>
          {others.length > 0 ? (
            <>
              <h3 className="ph-cx-others">Other devices on this hub</h3>
              <ul className="ph-cx-rail is-plain">
                {others.map((row) => (
                  <RailRow key={row.key} row={row} />
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <p className="ph-cx-checked" role="status">
          {b ? `Checked ${formatClock(new Date(b.checkedAt), clock)}` : ''}
        </p>
        <div className="ph-actionbar ph-cx-bar">
          <button type="button" className="ph-btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="ph-btn"
            aria-busy={view.busy || undefined}
            aria-disabled={view.busy || undefined}
            onClick={() => !view.busy && void view.check()}
          >
            {view.busy ? <span className="ph-spinner" aria-hidden="true" /> : null}
            Check again
          </button>
        </div>
        {toast ? (
          <div className={`ph-toast${toast.ok ? '' : ' is-error'}`} role="status">
            {toast.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
