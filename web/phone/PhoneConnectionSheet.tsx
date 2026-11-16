import { useCallback, useEffect, useRef, useState } from 'react';
import { COMMAND_COPY } from '../copy-link';
import { ConnectionBlock, ConnectionPill } from '../settings/ConnectionBlock';
import type { ConnectionView } from '../settings/useConnection';
import { useFocusTrap } from '../useFocusTrap';

const TOAST_MS = 2000;

/** How to fix: the Connection block as a bottom sheet, with Close and Check again pinned below it. */
export function PhoneConnectionSheet({ view, onClose }: { view: ConnectionView; onClose: () => void }) {
  const trap = useFocusTrap(onClose);
  const [toast, setToast] = useState<{ ok: boolean; message: string }>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopied = useCallback((ok: boolean) => {
    setToast({ ok, message: ok ? COMMAND_COPY.ok : COMMAND_COPY.err });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(undefined), TOAST_MS);
  }, []);

  const c = view.connection;
  if (!c) return null;
  return (
    <div className="ph-scrim ph-conn-scrim" onClick={onClose}>
      <div
        ref={trap}
        className="ph-asheet ph-conn-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="GitHub connection"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ph-conn-head">
          <h2 className="ph-asheet-title">GitHub connection</h2>
          <ConnectionPill state={c.state} />
        </div>
        <div className="ph-asheet-body">
          <ConnectionBlock view={view} phone onCopied={onCopied} />
        </div>
        <div className="ph-actionbar">
          <button type="button" className="ph-btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={`ph-btn${c.state === 'ok' ? '' : ' is-primary'}`}
            aria-busy={view.busy || undefined}
            aria-disabled={view.busy || undefined}
            onClick={() => {
              if (!view.busy) void view.check();
            }}
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
