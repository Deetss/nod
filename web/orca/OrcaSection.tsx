import type { ReactNode } from 'react';
import {
  STATE_WORD,
  type ConfirmedBy,
  type PrSessions,
  type Receipt,
  type SendResult,
  type SessionView,
} from '../../shared/orca-sessions';
import { AlertIcon, BubbleIcon, Btn, InfoIcon, SlashIcon, ToastIcon } from '../ui';
import { outputAgo, StateGlyph } from './orca-ui';
import { repoLabel } from '../repo-label';

export interface SendOutcome extends SendResult {
  prId: string;
  session: SessionView;
  /** The text that was sent, kept so Copy message and Retry work. */
  text: string;
}

/** A notification that went to the session in this view. Kept until the next event or a reload. */
export interface SentNote {
  prId: string;
  name: string;
  word: string;
  at: number;
  confirmed: boolean;
}

export interface OrcaSectionProps {
  prId: string;
  repo: string;
  sessions: PrSessions | undefined;
  /** Automatic messages are on for this repo. */
  autoOn: boolean;
  outcome: SendOutcome | undefined;
  sent: SentNote | undefined;
  busy: boolean;
  onSend: () => void;
  onOpen: () => void;
  onChoose: () => void;
  onCloseOutcome: () => void;
  onSendAgain: () => void;
  onCheckAgain: () => void;
  onRetry: () => void;
  onDispatch: () => void;
  onCopy: () => void;
  onTurnOn: () => void;
}

const hhmm = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

function Link({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="orca-link" onClick={onClick}>
      {children}
    </button>
  );
}

/** One quiet line: no border, no fill. Used when no single session is related. */
function Quiet({ children }: { children: ReactNode }) {
  return (
    <div className="orca-quiet" role="status">
      <InfoIcon size={14} />
      <span>{children}</span>
    </div>
  );
}

const hintFor = (s: SessionView): string | undefined =>
  s.state === 'waiting'
    ? 'Orca may refuse text while a permission menu is open (agent_prompt_blocked).'
    : s.state === 'done'
      ? 'Sending starts a new turn. Automatic messages reach an idle session only for merge, close and request changes.'
      : s.state === 'unknown'
        ? 'Orca reported a state this app does not know. Sending still works.'
        : undefined;

const CONFIRMED_SUB: Record<ConfirmedBy, string> = {
  orca: 'Orca confirmed the agent started a turn.',
  echo: 'The message showed up in the session’s terminal.',
  state: 'The session started working after the message.',
};

/** The receipt in a few words, e.g. `provider unsupported, stopped at input_accepted`. */
export function receiptLine(r: Receipt | undefined): string {
  const parts: string[] = [];
  if (r?.provider) parts.push(`provider ${r.provider}`);
  const last = r?.stages?.at(-1);
  if (last) parts.push(`stopped at ${last}`);
  return parts.length > 0 ? parts.join(', ') : 'no readable receipt';
}

const RESULT = {
  sent: { right: 'sent', title: (n: string) => `Sent to ${n}` },
  unconfirmed: { right: 'unconfirmed', title: () => 'Sent, not confirmed' },
  'not-writable': {
    right: 'not sent',
    title: (n: string) => `${n} has exited`,
    sub: 'Nothing was sent (terminal not writable). Start a new worktree with this message as its prompt.',
  },
  blocked: {
    right: 'not sent',
    title: (n: string) => `${n} is showing a prompt`,
    sub: 'Nothing was sent (agent_prompt_blocked). Answer the prompt in Orca, then send again.',
  },
  unreachable: {
    right: 'not sent',
    title: () => 'Orca is not reachable',
    sub: 'Orca is closed or its CLI failed. Nothing was sent. Start Orca, then retry.',
  },
} as const;

function subFor(o: SendOutcome): string {
  switch (o.status) {
    case 'sent':
      return CONFIRMED_SUB[o.confirmedBy ?? 'orca'];
    case 'unconfirmed':
      return `Orca accepted the text but could not confirm delivery (${receiptLine(o.receipt)}), and the message has not shown in the terminal yet. Check the session before sending again.`;
    default:
      return RESULT[o.status].sub;
  }
}

function ResultBody(p: OrcaSectionProps & { outcome: SendOutcome }) {
  const o = p.outcome;
  const r = RESULT[o.status];
  const icon =
    o.status === 'sent' ? (
      <span className="orca-result-icon orca-ok"><ToastIcon ok /></span>
    ) : o.status === 'unconfirmed' ? (
      <span className="orca-result-icon orca-muted"><InfoIcon size={16} /></span>
    ) : (
      <span className={`orca-result-icon ${o.status === 'unreachable' ? 'orca-danger' : 'orca-warn'}`}><AlertIcon size={16} /></span>
    );
  const buttons =
    o.status === 'sent' ? (
      <>
        <Btn keyHint="o" onClick={p.onOpen}>Open in Orca</Btn>
        <Btn onClick={p.onCloseOutcome}>Close</Btn>
      </>
    ) : o.status === 'unconfirmed' ? (
      <>
        <Btn keyHint="o" onClick={p.onOpen}>Open in Orca</Btn>
        {o.requestId ? (
          <Btn disabled={p.busy} onClick={p.onCheckAgain}>Check again</Btn>
        ) : null}
        <Btn disabled={p.busy} onClick={p.onSendAgain}>Send again</Btn>
      </>
    ) : o.status === 'not-writable' ? (
      <>
        <Btn onClick={p.onDispatch}>Dispatch with Orca</Btn>
        <Btn onClick={p.onCopy}>Copy message</Btn>
      </>
    ) : o.status === 'blocked' ? (
      <>
        <Btn keyHint="o" onClick={p.onOpen}>Open in Orca</Btn>
        <Btn onClick={p.onCopy}>Copy message</Btn>
      </>
    ) : (
      <>
        <Btn onClick={p.onRetry}>Retry</Btn>
        <Btn onClick={p.onCopy}>Copy message</Btn>
      </>
    );
  return (
    <>
      <div className="orca-body orca-result">
        {icon}
        <div className="orca-result-text">
          <div className="orca-result-title">{r.title(o.session.name)}</div>
          <div className="orca-result-sub muted">{subFor(o)}</div>
          <div className="orca-buttons">{buttons}</div>
        </div>
      </div>
    </>
  );
}

function Footer(p: OrcaSectionProps) {
  if (p.sent && p.sent.prId === p.prId) {
    const word = p.sent.confirmed ? p.sent.word : `${p.sent.word}, not confirmed`;
    return (
      <div className="orca-foot">
        <span className="orca-ok"><ToastIcon ok /></span>
        <span>{`Notified ${p.sent.name} (${word}) at ${hhmm(p.sent.at)}`}</span>
      </div>
    );
  }
  if (!p.autoOn) {
    return (
      <div className="orca-foot">
        <SlashIcon size={14} />
        <span>
          Automatic messages off for {repoLabel(p.repo)}. <Link onClick={p.onTurnOn}>Turn on</Link>
        </span>
      </div>
    );
  }
  return (
    <div className="orca-foot">
      <BubbleIcon size={14} />
      <span>Automatic messages on for {repoLabel(p.repo)}</span>
    </div>
  );
}

/**
 * The Orca session card in the detail pane, or one quiet line when no single session is related.
 * Nothing renders when Orca is absent (the caller does not mount it).
 */
export function OrcaSection(p: OrcaSectionProps) {
  const related = p.sessions?.related ?? [];
  const possible = p.sessions?.possible ?? [];
  const chosen = p.sessions?.chosen;
  const [one] = related;

  if (related.length > 1) {
    return (
      <Quiet>
        {related.length} sessions match. <Link onClick={p.onChoose}>Choose</Link>
      </Quiet>
    );
  }
  if (!one) {
    return possible.length > 0 ? (
      <Quiet>
        No Orca session related. {possible.length} possible {possible.length === 1 ? 'match' : 'matches'}.{' '}
        <Link onClick={p.onChoose}>Choose</Link>
      </Quiet>
    ) : (
      <Quiet>No Orca session related. Nobody notified.</Quiet>
    );
  }

  const outcome = p.outcome && p.outcome.prId === p.prId ? p.outcome : undefined;
  const hint = hintFor(one);
  const detail = outputAgo(one.lastOutputAt);
  const right = outcome ? RESULT[outcome.status].right : 'related';
  const reason =
    chosen === one.id ? (
      <>
        Chosen by you for this PR. <Link onClick={p.onChoose}>Change</Link>
      </>
    ) : (
      `Related by ${one.reason}`
    );

  return (
    <section className="card orca-card" aria-label="Orca session">
      <div className="card-h">
        <span>Orca session</span>
        <span className="card-h-right muted orca-right">{right}</span>
      </div>
      {outcome ? (
        <ResultBody {...p} outcome={outcome} />
      ) : (
        <div className="orca-body">
          <div className="orca-session-row">
            <span className={`orca-state-glyph orca-state-${one.state}`}>
              <StateGlyph state={one.state} size={14} />
            </span>
            <span className="mono orca-name" title={one.name}>{one.name}</span>
            <span className={`orca-word orca-state-${one.state}`}>{STATE_WORD[one.state]}</span>
          </div>
          <div className="orca-reason muted">{reason}</div>
          <div className="orca-detail muted">
            <span className="mono">{one.branch}</span>
            {detail ? ` · ${detail}` : ''}
          </div>
          {hint ? <div className="orca-hint muted">{hint}</div> : null}
          <div className="orca-buttons">
            {p.busy ? (
              <Btn aria-disabled="true" className="is-busy">
                <span className="spinner" aria-hidden="true" />
                Sending...
              </Btn>
            ) : (
              <Btn keyHint="s" onClick={p.onSend}>Send message...</Btn>
            )}
            <Btn keyHint="o" aria-disabled={p.busy || undefined} onClick={p.busy ? undefined : p.onOpen}>
              Open in Orca
            </Btn>
          </div>
        </div>
      )}
      {outcome ? null : <Footer {...p} />}
    </section>
  );
}
