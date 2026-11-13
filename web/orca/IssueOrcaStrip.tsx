import { STATE_WORD, type SessionView } from '../../shared/orca-sessions';
import { Btn } from '../ui';
import { outputAgo, StateGlyph } from './orca-ui';

/** What the strip shows for one issue (docs/design/issue-orca-spec.md §4). */
export type StripView =
  | { kind: 'one'; session: SessionView }
  | { kind: 'many'; count: number }
  | { kind: 'pending'; name: string; at: number };

export interface IssueOrcaStripProps {
  view: StripView;
  number: number;
  /** Three-pane width (1100px and up): Send message and the detail text show. */
  wide: boolean;
  now?: number;
  onOpen: () => void;
  onSend: () => void;
  onChoose: () => void;
}

function agoSince(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

function detailFor(s: SessionView, now: number): string | undefined {
  const ago = outputAgo(s.lastOutputAt, now);
  if (s.state === 'done') return ago?.replace('output', 'finished');
  if (s.state === 'waiting') return ago ? `needs you · ${ago}` : 'needs you';
  return ago;
}

/** Pinned between the issue header and the thread. Renders nothing for S6; the caller skips it. */
export function IssueOrcaStrip({ view, number, wide, now = Date.now(), onOpen, onSend, onChoose }: IssueOrcaStripProps) {
  if (view.kind === 'many') {
    return (
      <div className="iorca iorca-many" role="status" aria-label="Orca session">
        <span className="iorca-cap">ORCA</span>
        <span className="iorca-glyph"><StateGlyph state="many" size={12} /></span>
        <span className="iorca-mid iorca-many-text">{`${view.count} sessions linked to #${number}`}</span>
        <span className="iorca-buttons">
          <Btn onClick={onChoose}>Choose...</Btn>
        </span>
      </div>
    );
  }

  if (view.kind === 'pending') {
    return (
      <div className="iorca iorca-pending" role="status" aria-label="Orca session">
        <span className="iorca-cap">ORCA</span>
        <span className="iorca-glyph orca-state-unknown"><StateGlyph state="unknown" size={12} /></span>
        <span className="iorca-mid">
          <span className="iorca-name mono" title={view.name}>{view.name}</span>
          <span className="iorca-detail">{`· dispatched ${agoSince(view.at, now)} · waiting for Orca`}</span>
        </span>
      </div>
    );
  }

  const s = view.session;
  const detail = wide ? detailFor(s, now) : undefined;
  return (
    <div className={`iorca iorca-${s.state}`} role="status" aria-label="Orca session">
      <span className="iorca-cap">ORCA</span>
      <span className={`iorca-glyph orca-state-${s.state}`}><StateGlyph state={s.state} size={12} /></span>
      <span className="iorca-mid">
        <span className="iorca-name mono" title={`${s.name}\n${s.branch}`}>{s.name}</span>
        <span className={`iorca-word orca-state-${s.state}`}>{STATE_WORD[s.state]}</span>
        {detail ? <span className="iorca-detail">{`· ${detail}`}</span> : null}
      </span>
      <span className="iorca-buttons">
        {wide ? (
          <Btn keyHint="g s" onClick={onSend}>Send message...</Btn>
        ) : null}
        <Btn keyHint="g o" onClick={onOpen}>Open in Orca</Btn>
      </span>
    </div>
  );
}
