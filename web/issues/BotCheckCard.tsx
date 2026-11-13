import type { ReactNode } from 'react';
import { useState } from 'react';
import type { IssueDetail } from '../../shared/issue-types';
import { bot } from '../org-settings';
import { formatAge, KeyCap } from '../ui';
import { checkCardOf, stripOpen, trimCountFor, trimNoteOf, VERDICT_WORDS } from './bot-card';
import type { BotCheck, BotTrim } from './useBotCheck';

export interface BotCardProps {
  detail: IssueDetail;
  disabled: boolean;
  check: BotCheck;
  trim: BotTrim;
}

/** The card's body: chip, meta line, verdict text, trim state and buttons. Shared by the sidebar card and the 960 strip. */
export function BotCheckBody({ detail, disabled, check, trim }: BotCardProps): ReactNode {
  const b = bot();
  const comments = detail.comments;
  const card = checkCardOf(comments);
  const note = trimNoteOf(comments);
  const trimCount = card?.verdict ? trimCountFor(card.verdict, card.met) : undefined;
  const checking = check.state === 'pending';
  const trimming = trim.state === 'pending';
  const busy = disabled || checking || trimming;

  return (
    <div className="bot-card-body">
      {checking ? (
        <div className="bot-chip-row">
          <span className="chip bot-chip">
            <span className="spinner" aria-hidden="true" /> Checking...
          </span>
        </div>
      ) : card?.verdict ? (
        <div className="bot-chip-row">
          <span className={`chip bot-chip bot-chip-${card.verdict}`}>{VERDICT_WORDS[card.verdict]}</span>
        </div>
      ) : null}
      {card && !checking ? (
        <div className={`bot-meta muted${card.failed ? ' bot-meta-danger' : ''}`}>
          Checked {formatAge(card.comment.createdAt)} ago · comment by{' '}
          <a href={`#${card.comment.id}`} className="bot-comment-link">
            {b.name}
          </a>
        </div>
      ) : null}
      {!card && !checking ? (
        <p className="bot-body muted">No check yet. {b.name} reads the code and posts one comment. It changes nothing.</p>
      ) : null}
      {card?.failed && !checking ? (
        <p className="bot-body bot-danger" role="alert">
          {b.name} could not finish the check
        </p>
      ) : null}
      {card?.verdict && !checking ? (
        <>
          <p className="bot-body">{card.firstLine}</p>
          {card.nextStep ? <p className="bot-body">{card.nextStep}</p> : null}
        </>
      ) : null}
      {trimming ? <p className="bot-body muted">{trimCount ? `Trimming ${trimCount} criteria` : 'Trimming...'}</p> : null}
      {trim.state === 'trimmed' && note?.kind === 'trimmed' ? (
        <p className="bot-body" role="status">
          {`Trimmed ${note.moved} criteria into Already done`}
        </p>
      ) : null}
      {trim.state === 'refused' && note?.kind === 'refused' ? (
        <p className="bot-body bot-danger" role="alert">
          {note.reason}
        </p>
      ) : null}
      {trim.state === 'failed' ? (
        <p className="bot-body bot-danger" role="alert">
          Trim failed. Nothing changed.
        </p>
      ) : null}
      <div className="bot-actions">
        {trim.state === 'offered' && trimCount !== undefined ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={trim.request}>
            {`Trim met criteria (${trimCount})`}
          </button>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={busy}
          aria-keyshortcuts="K"
          title={`Posts ${b.command} check. ${b.name} changes nothing.`}
          onClick={check.request}
        >
          {checking ? 'Checking...' : card ? 'Check again' : `Check with ${b.name}`}
          {checking ? null : <KeyCap>K</KeyCap>}
        </button>
      </div>
      <span className="sr-only" role={card?.failed && !checking ? 'alert' : 'status'}>
        {checking
          ? `Checking ${detail.summary.repo} #${detail.summary.number}`
          : card?.failed
            ? `${b.name} could not finish the check`
            : card?.verdict
              ? `${b.name} check: ${VERDICT_WORDS[card.verdict]}`
              : ''}
      </span>
    </div>
  );
}

/** The 960 strip above the thread: the chip and a Show card / Hide card toggle. Collapsed on every visit to an issue. */
export function BotCheckStrip(p: BotCardProps & { issue: string }) {
  const b = bot();
  const [open, setOpen] = useState<{ issue: string; open: boolean }>({ issue: p.issue, open: false });
  if (!b.enabled) return null;
  const expanded = stripOpen(open, p.issue);
  const card = checkCardOf(p.detail.comments);
  const label = p.check.state === 'pending' ? 'Checking...' : card?.verdict ? VERDICT_WORDS[card.verdict] : card?.failed ? 'Check failed' : 'No check yet';
  const toggle = () => setOpen({ issue: p.issue, open: !expanded });
  return (
    <section className="bot-strip" aria-label={`${b.name} check`}>
      <button type="button" className="bot-strip-h" aria-expanded={expanded} onClick={toggle}>
        <span className="icard-title">{`${b.name.toUpperCase()} CHECK`}</span>
        {card?.verdict && p.check.state !== 'pending' ? (
          <span className={`chip bot-chip bot-chip-${card.verdict}`}>{VERDICT_WORDS[card.verdict]}</span>
        ) : (
          <span className="muted small">{label}</span>
        )}
        <span className="bot-strip-action">{expanded ? 'Hide card' : 'Show card'}</span>
      </button>
      {expanded ? (
        <div className="bot-strip-card icard">
          <BotCheckBody {...p} />
        </div>
      ) : null}
    </section>
  );
}

export function BotCheckCard(p: BotCardProps) {
  const b = bot();
  if (!b.enabled) return null;
  const busy = p.check.state === 'pending' || p.trim.state === 'pending';
  return (
    <section className="icard bot-card" aria-busy={busy || undefined}>
      <header className="icard-h">
        <span className="icard-title">{`${b.name.toUpperCase()} CHECK`}</span>
      </header>
      <div className="icard-b">
        <BotCheckBody {...p} />
      </div>
    </section>
  );
}
