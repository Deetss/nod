import type { ReactNode } from 'react';
import { PhoneSheet } from './PhoneSheet';
import { useKeyboardInset } from './useKeyboardInset';

interface FitSheetProps {
  title: string;
  sub: string;
  /** The request is running: Close, the scrim and Esc do nothing. */
  busy?: boolean;
  onClose: () => void;
  bar: ReactNode;
  children: ReactNode;
}

/**
 * Content-height bottom sheet over a scrim, for the finding dispatch flow.
 * The scrim shrinks to the visual viewport, so the sheet sits on the keyboard and its body scrolls.
 */
export function PhoneFitSheet(p: FitSheetProps) {
  const height = useKeyboardInset();
  const close = () => {
    if (!p.busy) p.onClose();
  };
  return (
    <div className="ph-scrim" style={{ zIndex: 70, height }} onClick={close}>
      <div className="ph-fit-wrap" onClick={(e) => e.stopPropagation()}>
        <PhoneSheet fit title={p.title} sub={p.sub} closeDisabled={p.busy} onClose={close} bar={p.bar}>
          {p.children}
        </PhoneSheet>
      </div>
    </div>
  );
}

/** Failed request: the message stays under the fields, which keep their text. */
export function PhoneSheetError({ children }: { children: ReactNode }) {
  return (
    <div className="ph-fit-error" role="alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

/** `Cancel` and the primary button. The primary shows a spinner and its busy word while the request runs. */
export function PhoneSheetBar(p: {
  busy: boolean;
  primary: string;
  busyLabel: string;
  disabled: boolean;
  onCancel: () => void;
  onPrimary: () => void;
}) {
  return (
    <>
      <button type="button" className="ph-btn" disabled={p.busy} onClick={p.onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className={`ph-btn is-primary${p.busy ? ' is-busy' : ''}`}
        disabled={!p.busy && p.disabled}
        aria-disabled={p.busy || undefined}
        aria-busy={p.busy || undefined}
        onClick={() => {
          if (!p.busy) p.onPrimary();
        }}
      >
        {p.busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {p.busyLabel}
          </>
        ) : (
          p.primary
        )}
      </button>
    </>
  );
}
