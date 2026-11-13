import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { CiState } from '../shared/types';

interface IconProps {
  size?: number;
}

export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ size = 16 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" strokeLinecap="round" />
    </svg>
  );
}

/** Leading glyph of a toast: a circled check on success, a circled cross on error. */
export function ToastIcon({ ok }: { ok: boolean }) {
  return (
    <svg
      className={`toast-icon ${ok ? 'toast-icon-ok' : 'toast-icon-err'}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d={ok ? 'M5.3 8.3l1.9 1.9 3.5-4.2' : 'M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6'} />
    </svg>
  );
}

export function XIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ExternalIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icon-only link to GitHub. Stops the click reaching a clickable row or header. */
export function ExtLink({ href, label, className }: { href: string | undefined; label: string; className?: string }) {
  if (!href) return null;
  return (
    <a
      className={`ext-link${className ? ` ${className}` : ''}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <ExternalIcon />
    </a>
  );
}

/** Dashed circle. `spin` rotates it (running), `pulse` fades it (queued). */
export function RingIcon({ size = 16, motion }: IconProps & { motion?: 'spin' | 'pulse' }) {
  return (
    <svg
      className={motion ? `ring-${motion}` : undefined}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2.2" />
    </svg>
  );
}

export function AlertIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2l6.5 11.5h-13z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11.2v.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A circle with a dot over a stem. Quiet notices and neutral toasts. */
export function InfoIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v3.6M8 5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** A circle with a slash through it. Automatic messages off. */
export function SlashIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.6 12.4l8.8-8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ClockIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BubbleIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3.5h10v7H8.5L5.5 13v-2.5H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

const glyph = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Plain geometric glyphs for the status box and timeline, drawn in the app's stroke style. */
export function DiffIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...glyph}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M8 5v4M6 7h4M6 11.2h4" />
    </svg>
  );
}

export function EyeIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...glyph}>
      <path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4-6.2-4-6.2-4z" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

export function CommitIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...glyph}>
      <circle cx="8" cy="8" r="2.6" />
      <path d="M1.5 8h3.9M10.6 8h3.9" />
    </svg>
  );
}

export function TagIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...glyph}>
      <path d="M2.5 2.5h5.2l6 6-5.2 5.2-6-6z" />
      <circle cx="5.3" cy="5.3" r=".6" />
    </svg>
  );
}

export function MergeIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...glyph}>
      <circle cx="4.5" cy="3.5" r="1.6" />
      <circle cx="4.5" cy="12.5" r="1.6" />
      <circle cx="11.5" cy="8" r="1.6" />
      <path d="M4.5 5.1v5.8M4.5 5.1c0 2.2 2.4 2.9 5.4 2.9" />
    </svg>
  );
}

/** Ringed X, for a cancelled check. */
export function CancelledIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...glyph} strokeWidth={1.4}>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
    </svg>
  );
}

/** Ringed slash, for a skipped check. */
export function SkippedIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...glyph} strokeWidth={1.4}>
      <circle cx="8" cy="8" r="6" />
      <path d="M4.2 11.8l7.6-7.6" />
    </svg>
  );
}

/** The status row glyph for a row model's `glyph` name. */
export function RowGlyph({ name, size = 16 }: { name: 'diff' | 'check' | 'clock' | 'alert' | 'merge' | 'x'; size?: number }) {
  switch (name) {
    case 'diff':
      return <DiffIcon size={size} />;
    case 'check':
      return <CheckIcon size={size} />;
    case 'clock':
      return <ClockIcon size={size} />;
    case 'alert':
      return <AlertIcon size={size} />;
    case 'merge':
      return <MergeIcon size={size} />;
    default:
      return <XIcon size={size} />;
  }
}

interface RingProps {
  segments: { key: string; length: number; start: number }[];
  centre: 'x' | 'spinner' | 'check';
}

/** Split ring, 27 across: one arc per check group on a muted track, a glyph in the middle. Decorative. */
export function ChecksRing({ segments, centre }: RingProps) {
  const r = 13.5;
  const c = 2 * Math.PI * r;
  return (
    <span className="checks-ring" aria-hidden="true">
      <svg width="32" height="32" viewBox="-16 -16 32 32" fill="none">
        <circle className="ring-track" r={r} strokeWidth="4.5" />
        <g transform="rotate(-90)">
          {segments.map((s) => (
            <circle
              key={s.key}
              className={`ring-seg ring-seg-${s.key}`}
              r={r}
              strokeWidth="4.5"
              strokeDasharray={`${s.length} ${c - s.length}`}
              strokeDashoffset={-s.start}
            />
          ))}
        </g>
      </svg>
      <span className={`ring-centre ring-centre-${centre}`}>
        {centre === 'x' ? <XIcon size={14} /> : centre === 'check' ? <CheckIcon size={14} /> : <RingIcon size={14} motion="spin" />}
      </span>
    </span>
  );
}

export function Chevron({ open, size = 16 }: IconProps & { open: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={open ? 'M4 6l4 4 4-4' : 'M6 4l4 4-4 4'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ExpandToggleProps {
  open: boolean;
  /** Id of the region this button shows and hides. */
  controls: string;
  onToggle: () => void;
}

/** Link-styled button that shows or hides the full description. */
export function ExpandToggle({ open, controls, onToggle }: ExpandToggleProps) {
  return (
    <button type="button" className="expand-toggle" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <span>{open ? 'Hide full description' : 'Show full description'}</span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d={open ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  primary?: boolean;
  keyHint?: string;
}

/** The tooltip names the key, since comfortable density shows key caps only while Alt is held. */
function keyTitle(title: string | undefined, children: ReactNode, keyHint: string | undefined): string | undefined {
  const base = title ?? (typeof children === 'string' ? children : undefined);
  if (!keyHint) return base;
  return base ? `${base} (${keyHint})` : `Key: ${keyHint}`;
}

export function Btn({ primary, keyHint, className, children, title, ...rest }: BtnProps) {
  const cls = ['btn', primary ? 'btn-primary' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} title={keyTitle(title, children, keyHint)} {...rest}>
      {children}
      {keyHint ? <KeyCap>{keyHint}</KeyCap> : null}
    </button>
  );
}

export function ConflictChip() {
  return (
    <span className="ci ci-conflict" aria-label="Merge conflicts" title="Merge conflicts with the base branch">
      <AlertIcon size={14} />
      Conflicts
    </span>
  );
}

export function CiPill({ state }: { state: CiState }) {
  if (state === 'none') return null;
  if (state === 'pass') {
    return (
      <span className="ci ci-pass">
        <CheckIcon size={14} />
        CI pass
      </span>
    );
  }
  if (state === 'fail') {
    return (
      <span className="ci ci-fail">
        <XIcon size={14} />
        CI fail
      </span>
    );
  }
  return (
    <span className="ci ci-running">
      <RingIcon size={14} motion="spin" />
      CI running
    </span>
  );
}

/** Key to the unseen dot and the NEW / UPDATED badges. Pinned under the list in compact, shown in the help overlay in comfortable. */
export function Legend({ className = 'legend' }: { className?: string }) {
  return (
    <div className={className}>
      <span className="dot dot-static" aria-hidden="true" />
      <span>unseen</span>
      <span className="badge badge-new">NEW</span>
      <span>first seen</span>
      <span className="legend-item">
        <span className="badge badge-updated">UPDATED</span>
        <span>changed since you looked</span>
      </span>
    </div>
  );
}

export function formatAge(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}
