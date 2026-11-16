import { useContext, useEffect, type ReactNode, type RefObject } from 'react';
import { BackIcon, MoreIcon } from './PhoneIcons';
import { SheetHoldContext } from './useSheetStack';
import { useSwipeClose } from './useSwipeClose';
import { useFocusTrap } from '../useFocusTrap';

export interface SheetTarget {
  kind: 'pr' | 'issue';
  id: string;
}

interface PhoneSheetProps {
  title: string;
  sub: string;
  onClose: () => void;
  /** Header More button. Omitted when the sheet has no action sheet. */
  onMore?: () => void;
  /** Pinned under the header, never scrolls (tab strip, file strip). */
  pinned?: ReactNode;
  /** Pinned action bar. */
  bar?: ReactNode;
  /** Body owns vertical scrolling unless `bodyScrolls` is false (the child scrolls itself). */
  bodyScrolls?: boolean;
  bodyRef?: RefObject<HTMLDivElement | null>;
  /** Stacking order among sheets. */
  depth?: number;
  /** True while another sheet covers this one. */
  covered?: boolean;
  /** Visual viewport height while the keyboard is up, so the sheet ends on top of it. */
  keyboardHeight?: number;
  /** Content-height bottom sheet over a scrim, height set by its content. */
  fit?: boolean;
  /** A request is running: Back, the swipe, Esc and the Android back gesture wait. */
  closeDisabled?: boolean;
  children: ReactNode;
}

/**
 * Full-screen sheet over the tab bar: drag handle, pinned header and action bar, own scroll.
 * Dragging the top strip down past 120px, or flinging, closes it.
 */
export function PhoneSheet(p: PhoneSheetProps) {
  const hold = useContext(SheetHoldContext);
  useEffect(() => (p.closeDisabled && hold ? hold() : undefined), [p.closeDisabled, hold]);
  const close = () => {
    if (!p.closeDisabled) p.onClose();
  };
  const swipe = useSwipeClose(close, { disabled: p.closeDisabled });
  // A sheet covered by another one leaves Esc to the sheet on top.
  const trap = useFocusTrap(() => {
    if (!p.covered) close();
  });

  const z = 20 + (p.depth ?? 0);
  return (
    <>
    {/* A fit sheet already sits on its own scrim. */}
    {p.fit ? null : <div className="ph-sheet-scrim" aria-hidden="true" style={{ ...swipe.scrimStyle, zIndex: z }} />}
    <div
      ref={trap}
      className={`ph-sheet${p.covered ? ' is-covered' : ''}${p.fit ? ' is-fit' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={p.title}
      onTransitionEnd={swipe.sheet.onTransitionEnd}
      style={{
        ...swipe.sheet.style,
        zIndex: z,
        height: p.keyboardHeight && !p.fit ? `calc(${p.keyboardHeight}px - var(--ph-top))` : undefined,
      }}
    >
      <div className="ph-strip" {...swipe.bind}>
        <span className="ph-handle" aria-hidden="true" />
        <header className="ph-sheet-head">
          <button type="button" className="ph-iconbtn" aria-label="Back" disabled={p.closeDisabled} onClick={close}>
            <BackIcon />
          </button>
          <div className="ph-sheet-titles">
            <h2 className="ph-sheet-title">{p.title}</h2>
            <p className="ph-sheet-sub">{p.sub}</p>
          </div>
          {p.onMore ? (
            <button type="button" className="ph-iconbtn" aria-label="More actions" onClick={p.onMore}>
              <MoreIcon />
            </button>
          ) : null}
        </header>
      </div>
      {p.pinned}
      <div ref={p.bodyRef} className={`ph-sheet-body${p.bodyScrolls === false ? ' no-scroll' : ''}`}>{p.children}</div>
      {p.bar ? <div className="ph-actionbar">{p.bar}</div> : null}
    </div>
    </>
  );
}
