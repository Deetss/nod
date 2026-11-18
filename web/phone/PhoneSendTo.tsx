import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from '@primer/octicons-react';
import { STATE_WORD, type SessionView } from '../../shared/orca-sessions';
import { HostFallback, HostTag, OfflineNote, offlineRight, type WorktreeHost } from '../orca/HostPicker';
import { hostLabel, hostMenu } from '../orca/hosts';
import { StateGlyph } from '../orca/orca-ui';
import { PhonePicker } from './PhonePicker';

export type SendToCandidate = { s: SessionView; kind: 'related' | 'possible' };

interface Props {
  candidates: readonly SendToCandidate[];
  /** Index into `candidates`; `candidates.length` is the New worktree card. */
  pick: number;
  busy: boolean;
  /** The repo, for the host sheet's sub line. */
  repo: string;
  wh: WorktreeHost;
  onPick: (i: number) => void;
}

/** The phone Send to list with paired hosts: session cards, then a New worktree card with its host. */
export function PhoneSendTo({ candidates, pick, busy, repo, wh, onPick }: Props) {
  const [hostSheet, setHostSheet] = useState(false);
  const newOn = pick === candidates.length;
  const { online, offline } = hostMenu(wh.hosts);

  return (
    <>
      <span className="ph-fix-label">Send to</span>
      <div className="ph-send-list" role="radiogroup" aria-label="Send to">
        {candidates.map((c, i) => (
          <button
            key={`${c.s.host}|${c.s.id}`}
            type="button"
            role="radio"
            aria-checked={pick === i}
            disabled={busy}
            className={`ph-send-row${pick === i ? ' is-on' : ''}`}
            onClick={() => onPick(i)}
          >
            <span className="ph-pk-radio" aria-hidden="true" />
            <span className="ph-send-main">
              <span className="ph-send-line">
                <span className="ph-send-name ph-mono">{c.s.name}</span>
                <HostTag host={c.s.host} className="ph-host-tag" />
              </span>
              <span className="ph-send-sub">{`${c.kind === 'possible' ? 'possible' : c.s.reason} · ${STATE_WORD[c.s.state]}`}</span>
            </span>
          </button>
        ))}
        <div className={`ph-send-row ph-send-new${newOn ? ' is-on' : ''}`}>
          <button type="button" role="radio" aria-checked={newOn} disabled={busy} className="ph-send-new-head" onClick={() => onPick(candidates.length)}>
            <span className="ph-pk-radio" aria-hidden="true" />
            <span className="ph-send-name ph-mono">New worktree</span>
          </button>
          <button
            type="button"
            className="ph-host-field"
            disabled={busy}
            aria-label={`Run the new worktree on ${hostLabel(wh.host, wh.hosts)}`}
            onClick={() => {
              onPick(candidates.length);
              setHostSheet(true);
            }}
          >
            <span className="ph-host-field-cap">Run on</span>
            <span className="ph-host-field-value">{hostLabel(wh.host, wh.hosts)}</span>
            <ChevronDownIcon size={16} />
          </button>
        </div>
      </div>
      <HostFallback fallback={wh.fallback} />
      <OfflineNote hosts={wh.hosts} className="ph-offline-note" />
      {hostSheet
        ? createPortal(
            <PhonePicker
              title="Run on"
              sub={repo}
              filterPlaceholder="Filter hosts"
              single
              depth={60}
              covered={false}
              initial={new Set([wh.host])}
              items={[
                ...online.map((h) => ({ value: h.name, text: hostLabel(h.name, wh.hosts), node: hostLabel(h.name, wh.hosts) })),
                ...offline.map((h) => ({
                  value: h.name,
                  text: `${h.name}, ${offlineRight(h)}`,
                  disabled: true,
                  node: (
                    <span className="ph-host-off">
                      <StateGlyph state="unknown" />
                      <span>{h.name}</span>
                      <span className="ph-host-off-right">{offlineRight(h)}</span>
                    </span>
                  ),
                })),
              ]}
              note={offline.length > 0 ? 'Offline hosts cannot be picked.' : undefined}
              onApply={(picked) => {
                const [h] = [...picked];
                if (h) wh.pick(h);
                setHostSheet(false);
              }}
              onClose={() => setHostSheet(false)}
            />,
            document.querySelector('.phone') ?? document.body,
          )
        : null}
    </>
  );
}
