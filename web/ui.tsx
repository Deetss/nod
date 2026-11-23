import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {
  AlertIcon as OcticonAlert,
  CheckCircleIcon,
  CheckIcon as OcticonCheck,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon as OcticonClock,
  CommentIcon,
  CopyIcon as OcticonCopy,
  DiffIcon as OcticonDiff,
  EyeClosedIcon as EyeClosedOcticon,
  EyeIcon as OcticonEye,
  GitCommitIcon,
  GitMergeIcon,
  InfoIcon as OcticonInfo,
  LinkExternalIcon,
  LinkIcon as OcticonLink,
  SkipIcon,
  TagIcon as OcticonTag,
  XCircleIcon,
  XIcon as OcticonX,
} from '@primer/octicons-react';
import type { CiState } from '../shared/types';

interface IconProps {
  size?: number;
}

export function CheckIcon({ size = 16 }: IconProps) {
  return <OcticonCheck size={size} />;
}

export function CopyIcon({ size = 16 }: IconProps) {
  return <OcticonCopy size={size} />;
}

export function LinkIcon({ size = 16 }: IconProps) {
  return <OcticonLink size={size} />;
}

/** Leading glyph of a toast: a circled check on success, a circled cross on error. */
export function ToastIcon({ ok }: { ok: boolean }) {
  const Icon = ok ? CheckCircleIcon : XCircleIcon;
  return <Icon className={`toast-icon ${ok ? 'toast-icon-ok' : 'toast-icon-err'}`} size={16} />;
}

export function XIcon({ size = 16 }: IconProps) {
  return <OcticonX size={size} />;
}

export function ExternalIcon({ size = 14 }: IconProps) {
  return <LinkExternalIcon size={size} />;
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
  return <OcticonAlert size={size} />;
}

/** Quiet notices and neutral toasts. */
export function InfoIcon({ size = 16 }: IconProps) {
  return <OcticonInfo size={size} />;
}

/** A circle with a slash through it. Automatic messages off. */
export function SlashIcon({ size = 14 }: IconProps) {
  return <SkipIcon size={size} />;
}

export function ClockIcon({ size = 16 }: IconProps) {
  return <OcticonClock size={size} />;
}

export function BubbleIcon({ size = 14 }: IconProps) {
  return <CommentIcon size={size} />;
}

/** Glyphs for the status box and timeline. */
export function DiffIcon({ size = 16 }: IconProps) {
  return <OcticonDiff size={size} />;
}

export function EyeIcon({ size = 16 }: IconProps) {
  return <OcticonEye size={size} />;
}

export function EyeClosedIcon({ size = 16 }: IconProps) {
  return <EyeClosedOcticon size={size} />;
}

export function CommitIcon({ size = 16 }: IconProps) {
  return <GitCommitIcon size={size} />;
}

export function TagIcon({ size = 16 }: IconProps) {
  return <OcticonTag size={size} />;
}

export function MergeIcon({ size = 16 }: IconProps) {
  return <GitMergeIcon size={size} />;
}

/** Ringed X, for a cancelled check. */
export function CancelledIcon({ size = 16 }: IconProps) {
  return <XCircleIcon size={size} />;
}

/** Ringed slash, for a skipped check. */
export function SkippedIcon({ size = 16 }: IconProps) {
  return <SkipIcon size={size} />;
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
  return open ? <ChevronDownIcon size={size} /> : <ChevronRightIcon size={size} />;
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
      {open ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
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

/** `formatAge` for screen readers: `5 minutes ago`, `2 hours ago`, `3 days ago`. */
export function ageWords(iso: string, now = Date.now()): string {
  const short = formatAge(iso, now);
  const n = Number(short.slice(0, -1));
  const unit = { m: 'minute', h: 'hour', d: 'day' }[short.slice(-1)] ?? 'day';
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

export function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}
