import { useEffect, useState } from 'react';
import { STATE_WORD, type SessionView } from '../../shared/orca-sessions';
import { useFocusTrap } from '../useFocusTrap';
import { StateGlyph } from './orca-ui';

interface Props {
  number: number;
  related: readonly SessionView[];
  possible: readonly SessionView[];
  /** A related session: remember it for this PR. */
  onChoose: (s: SessionView) => void;
  /** A possible session: open the Send message dialog to it, remembering nothing. */
  onSendOnce: (s: SessionView) => void;
  onClose: () => void;
}

function Row({ s, focused, hint, onHover, onPick }: { s: SessionView; focused: boolean; hint: string; onHover: () => void; onPick: () => void }) {
  return (
    <div
      role="option"
      aria-selected={focused}
      className={`picker-row picker-row-2${focused ? ' is-focus' : ''}`}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      <span className="picker-row-line1">
        <span className={`orca-state-glyph orca-state-${s.state}`}>
          <StateGlyph state={s.state} size={14} />
        </span>
        <span className="mono orca-picker-name">{s.name}</span>
        <span className={`orca-word orca-state-${s.state}`}>{STATE_WORD[s.state]}</span>
      </span>
      <span className="picker-row-line2 muted">
        <span className="orca-reason">{s.reason}</span>
        {focused || hint === 'Send once' ? <span className="picker-act">{hint}</span> : null}
      </span>
    </div>
  );
}

/** Chooses a session for one PR. Up, Down, Enter, Esc. Related rows are remembered; possible rows are send-once. */
export function SessionPicker({ number, related, possible, onChoose, onSendOnce, onClose }: Props) {
  const rows = [...related.map((s) => ({ s, kind: 'related' as const })), ...possible.map((s) => ({ s, kind: 'possible' as const }))];
  const [focus, setFocus] = useState(0);
  const trap = useFocusTrap();
  useEffect(() => trap.current?.focus(), [trap]);

  const pick = (i: number) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === 'related') onChoose(row.s);
    else onSendOnce(row.s);
  };

  const hintFor = (kind: 'related' | 'possible') => (kind === 'possible' ? 'Send once' : 'Enter');
  const relatedRows = rows.filter((r) => r.kind === 'related');
  const possibleRows = rows.filter((r) => r.kind === 'possible');

  return (
    <div className="scrim picker-scrim" onMouseDown={onClose}>
      <div
        ref={trap}
        tabIndex={-1}
        className="picker picker-sidebar orca-picker"
        role="dialog"
        aria-modal="true"
        aria-label={`Choose a session for #${number}`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocus((f) => Math.min(rows.length - 1, f + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocus((f) => Math.max(0, f - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            pick(focus);
          }
        }}
      >
        <h2 className="picker-title">Choose a session for #{number}</h2>
        <div className="picker-list orca-picker-list" role="listbox">
          {relatedRows.length > 0 ? (
            <>
              <div className="orca-group">
                <span>RELATED</span>
                <span className="orca-group-count">{relatedRows.length} match</span>
              </div>
              {relatedRows.map((r) => {
                const i = rows.indexOf(r);
                return <Row key={r.s.id} s={r.s} focused={focus === i} hint={hintFor(r.kind)} onHover={() => setFocus(i)} onPick={() => pick(i)} />;
              })}
            </>
          ) : null}
          {possibleRows.length > 0 ? (
            <>
              <div className={`orca-group${relatedRows.length > 0 ? ' orca-group-split' : ''}`}>
                <span>POSSIBLE</span>
              </div>
              {possibleRows.map((r) => {
                const i = rows.indexOf(r);
                return <Row key={r.s.id} s={r.s} focused={focus === i} hint={hintFor(r.kind)} onHover={() => setFocus(i)} onPick={() => pick(i)} />;
              })}
            </>
          ) : null}
        </div>
        <p className="muted small picker-note">
          Your choice is remembered for this PR and gets its automatic messages. A possible match only gets a message you send yourself.
        </p>
      </div>
    </div>
  );
}
