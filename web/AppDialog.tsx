import { useEffect, useRef, type KeyboardEventHandler, type ReactNode, type RefObject } from 'react';
import { Dialog } from '@primer/react';
import { XIcon } from '@primer/octicons-react';
import { KeyCap } from './ui';

type Size = 'small' | 'medium' | 'large';

const WIDTHS: Record<Size, number> = { small: 296, medium: 480, large: 640 };

export interface AppDialogProps {
  title: ReactNode;
  /** Esc, the close button and a scrim click all land here. Ignored while `busy`. */
  onClose: () => void;
  busy?: boolean;
  width?: Size | number;
  /** The footer buttons, right aligned. */
  footer?: ReactNode;
  /** Short 12px text left of the buttons, such as why Confirm is disabled. */
  footerNote?: ReactNode;
  /** Extra classes for the dialog box, so a dialog keeps its own CSS hooks. */
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Key handling for the whole dialog, header and footer included. */
  onKeyDown?: KeyboardEventHandler;
  children: ReactNode;
}

function AppDialogHeader(p: { title: ReactNode; labelId: string; busy: boolean; onClose: () => void }) {
  return (
    <Dialog.Header className="app-dialog-header">
      <Dialog.Title id={p.labelId} className="app-dialog-title">
        {p.title}
      </Dialog.Title>
      <KeyCap>Esc</KeyCap>
      <button
        type="button"
        className="btn app-dialog-close"
        aria-label="Close"
        title="Close (Esc)"
        disabled={p.busy}
        onClick={p.onClose}
      >
        <XIcon size={16} />
      </button>
    </Dialog.Header>
  );
}

/**
 * The shared dialog shell: a pinned header, a scrolling body and a pinned footer, on Primer's
 * `Dialog` for the focus trap, Esc, scroll lock and focus return.
 */
export function AppDialog(p: AppDialogProps) {
  const busy = p.busy === true;
  const box = useRef<HTMLDivElement>(null);
  const px = typeof p.width === 'number' ? p.width : WIDTHS[p.width ?? 'medium'];

  useEffect(() => {
    box.current?.setAttribute('aria-busy', String(busy));
  }, [busy]);

  const close = () => {
    if (!busy) p.onClose();
  };
  const hasFooter = p.footer != null || p.footerNote != null;

  // The wrapper renders no box of its own. React bubbles key events from the portal to it.
  return (
    <div className="app-dialog-root" onKeyDown={p.onKeyDown}>
      <Dialog
        ref={box}
        className={`dialog app-dialog${p.className ? ` ${p.className}` : ''}`}
        title={p.title}
        width={`min(${px}px, calc(100vw - 32px))`}
        onClose={close}
        initialFocusRef={p.initialFocusRef}
        renderHeader={(h) => <AppDialogHeader title={p.title} labelId={h.dialogLabelId} busy={busy} onClose={close} />}
        renderBody={(b) => <Dialog.Body className="app-dialog-body">{b.children}</Dialog.Body>}
        renderFooter={() =>
          hasFooter ? (
            <Dialog.Footer className="app-dialog-footer">
              {p.footerNote != null ? <span className="app-dialog-note">{p.footerNote}</span> : null}
              <div className="dialog-actions">{p.footer}</div>
            </Dialog.Footer>
          ) : null
        }
      >
        {p.children}
      </Dialog>
    </div>
  );
}
