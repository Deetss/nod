import { useEffect, useRef, useState } from 'react';
import { firstPrefill, type PrefillOption } from '../../shared/orca-message';
import { SEND_MAX, type SessionView } from '../../shared/orca-sessions';
import { PhoneFitSheet, PhoneSheetBar, PhoneSheetError } from './PhoneFitSheet';

interface Props {
  session: SessionView;
  options: readonly PrefillOption[];
  /** `file.rb:12` for a finding, or the PR. Shown under the title. */
  sub: string;
  /** Text to start from. Wins over the prefill. */
  initialText?: string | undefined;
  /** A possible session picked for this one send. */
  once?: boolean;
  busy: boolean;
  /** Why the last send did not land. The text is kept. */
  error: string | undefined;
  onSend: (text: string) => void;
  onCancel: () => void;
}

/** Free-form message to one session in a bottom sheet. Nothing is sent until Send is pressed. */
export function PhoneSendSheet(p: Props) {
  const [text, setText] = useState(p.initialText ?? firstPrefill(p.options)?.text ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const a = area.current;
    a?.focus();
    a?.setSelectionRange(a.value.length, a.value.length);
  }, []);

  const over = text.length > SEND_MAX;
  const failed = p.error !== undefined && !p.busy;

  return (
    <PhoneFitSheet
      title="Send to Orca session"
      sub={p.sub}
      busy={p.busy}
      onClose={p.onCancel}
      bar={
        <PhoneSheetBar
          busy={p.busy}
          primary={failed ? 'Retry' : 'Send'}
          busyLabel="Sending..."
          disabled={over || text.trim() === ''}
          onCancel={p.onCancel}
          onPrimary={() => p.onSend(text)}
        />
      }
    >
      <div className={`ph-fit-form${p.busy ? ' is-locked' : ''}`}>
        <span className="ph-fix-label">Session</span>
        <div className="ph-fit-session" aria-label={`Session ${p.session.name}`}>
          <span className="ph-fit-dot" aria-hidden="true" />
          <span className="ph-fit-session-name ph-mono">{p.session.name}</span>
          <span className="ph-fit-pill">{p.once ? 'Possible' : 'Linked'}</span>
        </div>
        <label className="ph-fix-label" htmlFor="ph-send-text">
          Message
        </label>
        <textarea
          id="ph-send-text"
          ref={area}
          className="ph-fix-field ph-mono ph-fit-area"
          value={text}
          readOnly={p.busy}
          aria-invalid={over}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="ph-fit-counter">
          <span>{p.busy ? `Sending to ${p.session.name}. Fields are locked.` : 'Nothing is sent until you press Send.'}</span>
          <span className={over ? 'is-over' : undefined}>
            {text.length} / {SEND_MAX}
            {over ? ' too long' : ''}
          </span>
        </div>
        {failed ? <PhoneSheetError>{p.error}</PhoneSheetError> : null}
      </div>
    </PhoneFitSheet>
  );
}
