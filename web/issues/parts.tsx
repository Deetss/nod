import type { CSSProperties } from 'react';
import { chipColors } from '../../shared/label-chip';
import type { CloseReason, IssueLabel, IssueStateKind, SubIssueCount, SubIssueState } from '../../shared/issue-types';
import { statusSlug, type ProjectStatus } from '../../shared/project-status';

/** Both theme palettes are set as variables; CSS picks the one for the active theme. */
function chipVars(color: string): CSSProperties {
  const dark = chipColors(color, 'dark');
  const light = chipColors(color, 'light');
  return {
    '--chip-fill-dark': dark.fill,
    '--chip-border-dark': dark.border,
    '--chip-text-dark': dark.text,
    '--chip-fill-light': light.fill,
    '--chip-border-light': light.border,
    '--chip-text-light': light.text,
  } as CSSProperties;
}

export function LabelChip({ label }: { label: IssueLabel }) {
  return (
    <span className="chip label-chip" style={chipVars(label.color)} title={label.name}>
      {label.name}
    </span>
  );
}

export function StatusChip({ status }: { status: ProjectStatus }) {
  return <span className={`status-chip status-${statusSlug(status)}`}>{status}</span>;
}

export function Avatar({ login, url, size = 18 }: { login: string; url?: string; size?: number }) {
  return url ? (
    <img className="avatar" src={url} width={size} height={size} alt="" />
  ) : (
    <span className="avatar avatar-initial" style={{ width: size, height: size }} aria-hidden="true">
      {login.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function CircleDotIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}

export function CircleCheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.4 8.2l1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SlashCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.2 11.8l7.6-7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PrIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4.5" cy="3.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4.5" cy="12.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.5" cy="12.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 5.1v5.8M11.5 10.9V6.5a2 2 0 0 0-2-2H8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const STATE_WORD: Record<SubIssueState, string> = { open: 'Open', completed: 'Closed as completed', 'not-planned': 'Closed as not planned' };

/** Sub-issue state by shape as well as colour: dot, check, or slash. */
export function SubStateGlyph({ state, size = 16 }: { state: SubIssueState; size?: number }) {
  return (
    <span className={`sub-glyph sub-glyph-${state}`} role="img" aria-label={STATE_WORD[state]}>
      {state === 'open' ? <CircleDotIcon size={size} /> : state === 'completed' ? <CircleCheckIcon size={size} /> : <SlashCircleIcon size={size} />}
    </span>
  );
}

/** List-row progress: a 12px ring whose arc is the done share, then `3 of 5`. */
export function SubIssueChip({ total, completed }: SubIssueCount) {
  const r = 4.5;
  const c = 2 * Math.PI * r;
  const done = total > 0 ? (completed / total) * c : 0;
  return (
    <span className="status-chip subissue-chip" title={`${completed} of ${total} sub-issues done`}>
      <svg width="12" height="12" viewBox="-6 -6 12 12" fill="none" aria-hidden="true">
        <circle className="subissue-track" r={r} strokeWidth="2" />
        {done > 0 ? (
          <circle className="subissue-arc" r={r} strokeWidth="2" strokeDasharray={`${done} ${c - done}`} transform="rotate(-90)" />
        ) : null}
      </svg>
      {completed} of {total}
    </span>
  );
}

/** Open or Closed: icon plus the word, never colour alone. */
export function StatePill({ state, reason }: { state: IssueStateKind; reason?: CloseReason | undefined }) {
  if (state === 'closed' && reason === 'NOT_PLANNED') {
    return (
      <span className="state-pill state-not-planned">
        <SlashCircleIcon />
        Not planned
      </span>
    );
  }
  const open = state === 'open';
  return (
    <span className={`state-pill ${open ? 'state-open' : 'state-closed'}`}>
      {open ? <CircleDotIcon /> : <CircleCheckIcon />}
      {open ? 'Open' : 'Closed'}
    </span>
  );
}

/** A card with a muted header, as used in the sidebar and the description. */
export function Card({
  title,
  count,
  meta,
  hint,
  children,
  className,
}: {
  title: string;
  count?: number;
  /** Shown after the title, such as a progress bar. */
  meta?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`icard${className ? ` ${className}` : ''}`}>
      <header className="icard-h">
        <span className="icard-title">{title}</span>
        {count !== undefined ? <span className="count">{count}</span> : null}
        {meta}
        {hint ? <span className="icard-hint muted">{hint}</span> : null}
      </header>
      <div className="icard-b">{children}</div>
    </section>
  );
}
