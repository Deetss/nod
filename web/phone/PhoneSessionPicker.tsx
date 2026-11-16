import { useState } from 'react';
import { STATE_WORD, type SessionView } from '../../shared/orca-sessions';
import { PhoneFitSheet } from './PhoneFitSheet';

interface Props {
  number: number;
  related: readonly SessionView[];
  possible: readonly SessionView[];
  /** Replaces the default heading, such as when sending a finding with nothing linked. */
  title?: string | undefined;
  /** A related session: remember it for this PR. */
  onChoose: (s: SessionView) => void;
  /** A possible session: send to it once, remembering nothing. */
  onSendOnce: (s: SessionView) => void;
  onClose: () => void;
}

type Kind = 'related' | 'possible';

function Row({ s, kind, on, onPick }: { s: SessionView; kind: Kind; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={`ph-pk-row ph-ses-row${on ? ' is-on' : ''}`}
      onClick={onPick}
    >
      <span className="ph-pk-radio" aria-hidden="true" />
      <span className="ph-ses-main">
        <span className="ph-ses-line">
          <span className="ph-ses-name ph-mono">{s.name}</span>
          <span className="ph-ses-state">{STATE_WORD[s.state]}</span>
        </span>
        <span className="ph-ses-line">
          <span className="ph-ses-reason">{s.reason}</span>
          {kind === 'possible' ? <span className="ph-ses-hint">Send once</span> : null}
        </span>
      </span>
    </button>
  );
}

/** Chooses a session for one PR in a bottom sheet. Related rows are remembered, possible rows are send-once. */
export function PhoneSessionPicker({ number, related, possible, title, onChoose, onSendOnce, onClose }: Props) {
  const rows = [...related.map((s) => ({ s, kind: 'related' as const })), ...possible.map((s) => ({ s, kind: 'possible' as const }))];
  const [id, setId] = useState(rows[0]?.s.id);
  const picked = rows.find((r) => r.s.id === id) ?? rows[0];
  const relatedRows = rows.filter((r) => r.kind === 'related');
  const possibleRows = rows.filter((r) => r.kind === 'possible');

  const go = () => {
    if (!picked) return;
    if (picked.kind === 'related') onChoose(picked.s);
    else onSendOnce(picked.s);
  };

  const group = (label: string, list: typeof rows, count?: string) =>
    list.length > 0 ? (
      <div role="group" aria-label={label}>
        <div className="ph-ses-group">
          <span>{label}</span>
          {count ? <span className="ph-ses-count">{count}</span> : null}
        </div>
        {list.map((r) => (
          <Row key={r.s.id} s={r.s} kind={r.kind} on={picked?.s.id === r.s.id} onPick={() => setId(r.s.id)} />
        ))}
      </div>
    ) : null;

  return (
    <PhoneFitSheet
      title={title ?? `Choose a session for #${number}`}
      sub={`${related.length} related, ${possible.length} possible`}
      onClose={onClose}
      bar={
        <>
          <button type="button" className="ph-btn ph-pk-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="ph-btn is-primary" disabled={!picked} onClick={go}>
            {picked?.kind === 'possible' ? 'Send once' : 'Remember and continue'}
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Sessions">
        {group('RELATED', relatedRows, `${relatedRows.length} match`)}
        {group('POSSIBLE', possibleRows)}
      </div>
    </PhoneFitSheet>
  );
}
