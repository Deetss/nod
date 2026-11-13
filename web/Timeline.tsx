import { useCallback, useState, type ReactNode } from 'react';
import { minimizedPill, minimizedSentence } from '../shared/minimized';
import { EyeIcon } from './ui';

/** The thread's rail, events and cards (docs/design/timeline-spec.md section 4). The rail and icons are decorative. */

export function TimelineList({ children, label = 'Thread' }: { children: ReactNode; label?: string }) {
  return (
    <ol className="tl-list" aria-label={label}>
      {children}
    </ol>
  );
}

interface EventProps {
  id?: string;
  icon: ReactNode;
  children: ReactNode;
  age?: string;
  /** Verdict badge, drawn at 32 instead of 28. */
  badge?: 'danger' | 'success';
  /** A Nod line: muted text and no badge fill. */
  quiet?: boolean;
}

/** A one-row event on the rail: a 28 icon, its text, the age at the right. */
export function TlEvent({ id, icon, children, age, badge, quiet }: EventProps) {
  return (
    <li className={`tl-item tl-event-row${quiet ? ' tl-quiet' : ''}`} id={id} tabIndex={id ? -1 : undefined}>
      <span className={`tl-icon${badge ? ` tl-badge tl-badge-${badge}` : ''}`} aria-hidden="true">
        {icon}
      </span>
      <span className="tl-text">{children}</span>
      {age ? <span className="tl-age">{age}</span> : null}
    </li>
  );
}

export interface Pill {
  label: string;
  tone: 'danger' | 'success' | 'attention' | 'neutral';
}

export function TlPill({ pill }: { pill: Pill }) {
  return <span className={`tl-pill tl-pill-${pill.tone}`}>{pill.label}</span>;
}

interface CardProps {
  id?: string;
  author: string;
  /** Left out on inline review cards, where the file and line row above says what the card is. */
  verb?: string | null;
  pill?: Pill;
  age: string;
  /** A control at the right end of the header, after the age. */
  tools?: ReactNode;
  isNew?: boolean;
  /** Index for `]` and `[` stepping. */
  stepIndex?: number;
  tabIndex?: number;
  children: ReactNode;
}

/** The bordered card: a muted header (author, verb, pill, age) and the body. */
export function CardArticle({ id, author, verb, pill, age, tools, isNew, stepIndex, tabIndex, children }: CardProps) {
  return (
    <article
      className={`tl-card${isNew ? ' is-new' : ''}`}
      id={id}
      tabIndex={tabIndex}
      data-comment={stepIndex}
      data-unseen={isNew ? '1' : undefined}
    >
      <header className={`tl-card-h${verb === null ? ' is-inline' : ''}`}>
        <strong title={author}>{author}</strong>
        {verb === null ? null : <> <span>{verb}</span></>}
        {pill ? <TlPill pill={pill} /> : null}
        {isNew ? <span className="badge badge-new">NEW</span> : null}
        {tools ? (
          <span className="tl-card-tools">
            <span className="tl-age">{age}</span>
            {tools}
          </span>
        ) : (
          <span className="tl-age">{age}</span>
        )}
      </header>
      <div className="tl-card-b">{children}</div>
    </article>
  );
}

interface TlCardProps extends CardProps {
  /** The 32 avatar, or a verdict badge, on the rail. */
  avatar: ReactNode;
  badge?: 'danger' | 'success';
}

export function TlCard({ avatar, badge, id, tabIndex, ...card }: TlCardProps) {
  return (
    <li className="tl-item tl-card-row">
      <span className={`tl-avatar${badge ? ` tl-badge tl-badge-${badge}` : ''}`} aria-hidden="true">
        {avatar}
      </span>
      <CardArticle id={id} tabIndex={tabIndex} {...card} />
    </li>
  );
}

interface HiddenProps {
  /** Id of the comment or review, used to name the card. */
  id: string;
  noun: 'comment' | 'review';
  reason: string | undefined;
  open: boolean;
  onToggle: () => void;
  /** The card, built by the caller, drawn under the row while open. */
  children: ReactNode;
  /** Index for `]` and `[` stepping, carried by the row while collapsed. */
  stepIndex?: number;
}

export const hiddenCardId = (id: string): string => `hc-${id}`;

/** A hidden comment or review: one collapsed row, and the card below it once shown. Collapsed content is not rendered. */
export function HiddenItem({ id, noun, reason, open, onToggle, children, stepIndex }: HiddenProps) {
  const sentence = minimizedSentence(reason, noun);
  const action = open ? `Hide ${noun}` : `Show ${noun}`;
  return (
    <li className="tl-item tl-hidden" data-comment={open ? undefined : stepIndex}>
      <span className="tl-icon" aria-hidden="true">
        <EyeIcon />
      </span>
      <div className="tl-hidden-row">
        <span className="tl-hidden-text">{sentence}</span>
        <button
          type="button"
          className="btn tl-hidden-btn"
          data-show
          aria-expanded={open}
          aria-controls={hiddenCardId(id)}
          aria-label={open ? action : `${action}. ${sentence}`}
          onClick={onToggle}
        >
          {action}
        </button>
      </div>
      {open ? children : null}
    </li>
  );
}

/** The reason pill of an expanded hidden card. */
export function reasonPill(reason: string | undefined): Pill | undefined {
  return minimizedPill(reason);
}

/** Which hidden items are shown. Lives as long as the thread stays mounted, so closing the pane clears it. */
export function useShown(): { has: (id: string) => boolean; toggle: (id: string) => void } {
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setShown((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  return { has: (id) => shown.has(id), toggle };
}
