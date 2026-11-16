import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SEVERITY_WORD, bulkTitle, handPreview, type Banner, type Severity } from '../shared/findings';
import type { BulkRow } from './useFindings';
import { bot } from './org-settings';
import { AlertIcon, Btn, CheckIcon, KeyCap } from './ui';
import { useFocusTrap } from './useFocusTrap';

/** 12px octagon with a bar: the Blocker and Merge blocked glyph. */
export function OctagonIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2L5.2 1Zm2.05 3.2v4.6h1.5V4.2h-1.5Zm0 6.1v1.5h1.5v-1.5h-1.5Z" fillRule="evenodd" />
    </svg>
  );
}

/** 12px outlined triangle with a bar: the Major glyph. */
function TriangleIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M8 1.8 14.6 13.5H1.4L8 1.8Z" />
      <path d="M8 6v3.6M8 11.2v.4" strokeLinecap="round" />
    </svg>
  );
}

/** Blocker and Major differ by fill, outline, glyph and word. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`sev-badge sev-${severity}`} aria-label={`Severity: ${severity}`}>
      {severity === 'blocker' ? <OctagonIcon /> : <TriangleIcon />}
      {SEVERITY_WORD[severity]}
    </span>
  );
}

interface FindingBtnProps {
  label: string;
  /** Key cap, shown on the focused card. */
  cap?: string;
  busy?: boolean;
  /** Done: dashed, with a check and the past-tense label. */
  spent?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}

/** The 28px action button. Busy keeps the label and swaps the cap for a spinner. */
export function FindingBtn({ label, cap, busy, spent, disabled, title, onClick }: FindingBtnProps) {
  const inert = busy || spent || disabled;
  return (
    <button
      type="button"
      className={`btn finding-btn${spent ? ' is-spent' : ''}${busy ? ' is-busy' : ''}`}
      aria-busy={busy || undefined}
      aria-disabled={inert || undefined}
      title={title}
      onClick={() => {
        if (!inert) onClick();
      }}
    >
      {spent ? <CheckIcon size={12} /> : null}
      {label}
      {busy ? <span className="spinner" aria-hidden="true" /> : cap && !spent ? <KeyCap>{cap}</KeyCap> : null}
    </button>
  );
}

interface BannerProps {
  banner: Banner;
  botOn: boolean;
  /** Hand all is possible: the bot is on and an unresolved finding can take a reply. */
  canHand: boolean;
  /** Key cap on the button, desktop only. */
  cap?: string;
  onHandAll: () => void;
  /** Dispatch all shows (`showDispatchAll`). */
  canDispatch?: boolean;
  onDispatchAll?: () => void;
  dispatchCap?: string;
  /** Findings sent to Orca from this page. */
  sent?: number;
}

/** Pinned above the findings: unresolved count, Merge blocked or Ready to merge, Hand all and Dispatch all. */
export function FindingBanner({ banner, botOn, canHand, cap, onHandAll, canDispatch, onDispatchAll, dispatchCap, sent = 0 }: BannerProps) {
  const hand =
    banner.blocked && botOn && canHand ? (
      <button type="button" className="btn finding-btn finding-banner-btn" onClick={onHandAll}>
        <span className="finding-banner-label">{`Hand all to ${bot().name}`}</span>
        {cap ? <KeyCap>{cap}</KeyCap> : null}
      </button>
    ) : null;
  const dispatch =
    banner.blocked && canDispatch && onDispatchAll ? (
      <button type="button" className="btn finding-btn finding-banner-btn" onClick={onDispatchAll}>
        <span className="finding-banner-label">Dispatch all</span>
        {dispatchCap ? <KeyCap>{dispatchCap}</KeyCap> : null}
      </button>
    ) : null;
  const both = hand !== null && dispatch !== null;
  return (
    <div className={`finding-banner ${banner.blocked ? 'is-blocked' : 'is-ready'}${both ? ' has-actions' : ''}`} role="status">
      <span className="finding-banner-icon">{banner.blocked ? <OctagonIcon size={16} /> : <CheckIcon size={16} />}</span>
      <span className="finding-banner-text">
        <strong>{banner.blocked ? 'Merge blocked' : 'Ready to merge'}</strong>
        <span className="finding-banner-sub">
          {banner.unresolved} unresolved{sent > 0 ? ` · ${sent} sent to Orca` : ''}
        </span>
      </span>
      {both ? (
        <span className="finding-banner-actions">
          {hand}
          {dispatch}
        </span>
      ) : (
        <>
          {hand}
          {banner.blocked && !botOn ? <span className="finding-banner-sub finding-banner-note">No bot set</span> : null}
          {dispatch}
        </>
      )}
    </div>
  );
}

interface ShellProps {
  title: string;
  /** Extra classes on the dialog. */
  className: string;
  busy: boolean;
  phone?: boolean;
  /** Ctrl+Enter confirms from anywhere; otherwise Enter outside buttons and inputs does. */
  ctrlEnter?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}

/** The bulk confirm's shell: scrim, focus trap, Esc to cancel (not while busy) and the confirm key. */
export function BulkShell({ title, className, busy, phone, ctrlEnter, onCancel, onConfirm, children }: ShellProps) {
  const trap = useFocusTrap();
  return createPortal(
    <div className={`scrim${phone ? ' ph-scrim finding-bulk-scrim' : ''}`} onMouseDown={() => !busy && onCancel()}>
      <div
        ref={trap}
        tabIndex={-1}
        className={`dialog finding-bulk ${className}${phone ? ' is-phone' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) {
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            const plain = !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement);
            if (ctrlEnter ? !(e.ctrlKey || e.metaKey) : !plain) return;
            e.preventDefault();
            onConfirm();
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface BulkProps {
  rows: BulkRow[];
  busy: boolean;
  phone?: boolean;
  onToggle: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirm for Hand all: one reply per ticked finding. Human threads never appear. */
export function BulkDialog({ rows, busy, phone, onToggle, onCancel, onConfirm }: BulkProps) {
  const b = bot();
  const n = rows.filter((r) => r.checked).length;
  const title = bulkTitle(n, b.name);
  const go = (): void => {
    if (!busy && n > 0) onConfirm();
  };
  return (
    <BulkShell title={title} className="fix-dialog" busy={busy} phone={phone} onCancel={onCancel} onConfirm={go}>
      <div className="dialog-head">
        <h2>{title}</h2>
      </div>
      <p className="muted small">One reply per thread. The command comes from Settings.</p>
      <ul className="finding-bulk-rows">
        {rows.map(({ finding, checked }) => {
          const preview = handPreview(finding, b);
          return (
            <li key={finding.thread.id} className="finding-bulk-row">
              <label className="finding-bulk-check">
                <input type="checkbox" checked={checked} disabled={busy} onChange={() => onToggle(finding.thread.id)} />
                <SeverityBadge severity={finding.severity} />
              </label>
              <code className="finding-bulk-cmd" title={preview}>
                {preview}
              </code>
            </li>
          );
        })}
      </ul>
      <div className="dialog-actions">
        <Btn disabled={busy} onClick={onCancel}>
          Cancel {phone ? null : <KeyCap>Esc</KeyCap>}
        </Btn>
        <button
          type="button"
          className={`btn btn-primary${busy ? ' is-busy' : ''}`}
          disabled={!busy && n === 0}
          aria-busy={busy || undefined}
          onClick={go}
        >
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {`Hand ${n} to bot`}
          {phone ? null : <KeyCap>Enter</KeyCap>}
        </button>
      </div>
    </BulkShell>
  );
}

/** A status line under the actions: waiting, confirmed, or failed with Retry. */
export function StatusLine({
  tone,
  children,
  retry,
  retryKey,
}: {
  tone: 'wait' | 'ok' | 'err';
  children: ReactNode;
  retry?: () => void;
  retryKey?: string;
}) {
  return (
    <div className={`finding-status is-${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      <span className="finding-status-icon">
        {tone === 'ok' ? <CheckIcon size={14} /> : tone === 'err' ? <AlertIcon size={14} /> : <span className="finding-clock" aria-hidden="true" />}
      </span>
      <span className="finding-status-text">{children}</span>
      {retry ? (
        <button type="button" className="btn finding-retry" onClick={retry}>
          Retry
          {retryKey ? <KeyCap>{retryKey}</KeyCap> : null}
        </button>
      ) : null}
    </div>
  );
}
