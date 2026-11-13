import { useEffect, useMemo, useRef, useState } from 'react';
import { firstPrefill, type PrefillOption } from '../../shared/orca-message';
import { SEND_MAX, STATE_WORD, type SessionView } from '../../shared/orca-sessions';
import { Btn, KeyCap } from '../ui';
import { useFocusTrap } from '../useFocusTrap';
import { StateGlyph } from './orca-ui';

interface Props {
  session: SessionView;
  options: readonly PrefillOption[];
  /** Text to start from, when retrying a failed send. Wins over the prefill. */
  initialText?: string;
  busy: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}

const EXTRA: Partial<Record<SessionView['state'], string>> = {
  waiting: 'Orca may refuse text while a permission menu is open.',
  done: 'Sending starts a new turn in an idle agent.',
};

/**
 * Free-form message to one session. Nothing is sent until Send is pressed (Ctrl+Enter also sends).
 * The box is prefilled from counts and links only, and capped at 600 characters.
 */
export function SendDialog({ session, options, initialText, busy, onSend, onCancel }: Props) {
  const start = useMemo(() => firstPrefill(options), [options]);
  const [active, setActive] = useState(initialText === undefined ? start?.chip : undefined);
  const [text, setText] = useState(initialText ?? start?.text ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  const trap = useFocusTrap();
  useEffect(() => {
    const a = area.current;
    a?.focus();
    a?.setSelectionRange(a.value.length, a.value.length);
  }, []);

  const over = text.length > SEND_MAX;
  const blocked = busy || over || text.trim() === '';
  const go = () => {
    if (!blocked) onSend(text);
  };
  const from = options.find((o) => o.chip === active)?.from;
  const off = options.filter((o) => o.text === undefined && o.why).map((o) => o.why);
  const fromLine = [from ? `Filled from: ${from}.` : '', ...off.slice(0, 1)].filter(Boolean).join(' ');
  const title = `Send message to ${session.name}`;

  return (
    <div className="scrim" onMouseDown={() => !busy && onCancel()}>
      <div
        ref={trap}
        className="dialog dispatch-dialog orca-send"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) {
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && e.ctrlKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            go();
          }
        }}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <span className={`orca-state orca-state-${session.state}`}>
            <StateGlyph state={session.state} />
            {STATE_WORD[session.state]}
          </span>
        </div>
        <div className="orca-startfrom">
          <span className="orca-label">Start from</span>
          {options.map((o) => {
            const off = o.text === undefined;
            return (
              <button
                key={o.chip}
                type="button"
                className={`act-chip${active === o.chip ? ' is-active' : ''}${off ? ' is-off' : ''}`}
                aria-disabled={off || undefined}
                aria-pressed={active === o.chip}
                title={off ? o.why : undefined}
                onClick={() => {
                  if (off || o.text === undefined) return;
                  setActive(o.chip);
                  setText(o.text);
                  area.current?.focus();
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="muted small orca-fill">{fromLine || 'Type a message.'}</p>
        {EXTRA[session.state] ? <p className="muted small orca-fill">{EXTRA[session.state]}</p> : null}
        <textarea
          ref={area}
          className="mono"
          rows={5}
          value={text}
          readOnly={busy}
          aria-label="Message"
          aria-invalid={over}
          onChange={(e) => {
            setText(e.target.value);
            setActive(undefined);
          }}
        />
        <div className="orca-counter small">
          <span className="muted">Counts and links only. No comment or PR body text.</span>
          <span className={over ? 'orca-over' : 'muted'}>
            {text.length} / {SEND_MAX}
            {over ? ' too long' : ''}
          </span>
        </div>
        <div className="dialog-actions orca-actions">
          <span className="muted small orca-nothing">Nothing is sent until you press Send.</span>
          <Btn disabled={busy} onClick={onCancel}>
            Cancel
          </Btn>
          <button
            type="button"
            className={`btn btn-primary${busy ? ' is-busy' : ''}`}
            disabled={!busy && blocked}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            onClick={go}
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            Send
            <KeyCap>Ctrl+Enter</KeyCap>
          </button>
        </div>
        <span className="sr-only" role="status">
          {busy ? `Sending to ${session.name}` : ''}
        </span>
      </div>
    </div>
  );
}
