import { useContext, useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { BackIcon, MoreIcon } from './PhoneIcons';
import { shouldCloseSwipe } from './phone-logic';
import { SheetHoldContext } from './useSheetStack';
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
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number } | undefined>(undefined);
  const hold = useContext(SheetHoldContext);
  useEffect(() => (p.closeDisabled && hold ? hold() : undefined), [p.closeDisabled, hold]);
  const close = () => {
    if (!p.closeDisabled) p.onClose();
  };
  // A sheet covered by another one leaves Esc to the sheet on top.
  const trap = useFocusTrap(() => {
    if (!p.covered) close();
  });

  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, t: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y));
  };
  const up = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = undefined;
    if (!d) return;
    const dist = Math.max(0, e.clientY - d.y);
    setDy(0);
    if (shouldCloseSwipe(dist, e.timeStamp - d.t)) close();
  };

  return (
    <div
      ref={trap}
      className={`ph-sheet${p.covered ? ' is-covered' : ''}${p.fit ? ' is-fit' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={p.title}
      style={{
        zIndex: 20 + (p.depth ?? 0),
        transform: dy ? `translateY(${dy}px)` : undefined,
        height: p.keyboardHeight && !p.fit ? `calc(${p.keyboardHeight}px - var(--ph-top))` : undefined,
      }}
    >
      <div
        className="ph-strip"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          drag.current = undefined;
          setDy(0);
        }}
      >
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
  );
}
