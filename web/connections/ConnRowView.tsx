import { useState } from 'react';
import { ConnMark } from './ConnMark';
import type { ConnRow, RowAction } from './model';

const ACTION_LABELS: Record<RowAction, string> = {
  details: 'Details',
  fix: 'Fix',
  copy: 'Copy',
  setup: 'Set up a hub',
  rename: 'Rename',
};

interface ConnRowViewProps {
  row: ConnRow;
  onAction: (row: ConnRow) => void;
  /** Saves a new device name. Present while this row is being renamed. */
  rename?: { save: (name: string) => Promise<void>; cancel: () => void } | undefined;
}

/** Inline rename, as in the Pair phone dialog: Enter saves, Esc cancels and keeps the popover open. */
function RenameField({ row, rename }: { row: ConnRow; rename: NonNullable<ConnRowViewProps['rename']> }) {
  const [name, setName] = useState(row.name);
  const [busy, setBusy] = useState(false);
  const save = () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    void rename.save(name).finally(() => setBusy(false));
  };
  return (
    <>
      <input
        type="text"
        className="cx-rename"
        value={name}
        maxLength={60}
        aria-label={`Name for ${row.name}`}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            e.stopPropagation();
            rename.cancel();
          }
        }}
      />
      <button type="button" className="cx-action" disabled={busy} onClick={save}>
        Save
      </button>
    </>
  );
}

export function ConnRowView({ row, onAction, rename }: ConnRowViewProps) {
  return (
    <li className={`cx-row is-${row.mark}`}>
      <ConnMark mark={row.mark} />
      {rename ? (
        <RenameField row={row} rename={rename} />
      ) : (
        <>
          <span className="cx-row-name">{row.name}</span>
          <span className={`cx-row-detail${row.mono ? ' is-mono' : ''}`} title={row.detail}>
            {row.detail}
          </span>
          {row.action ? (
            <button type="button" className="cx-action" onClick={() => onAction(row)}>
              {ACTION_LABELS[row.action]}
              {row.action === 'rename' ? <span className="sr-only"> {row.name}</span> : null}
            </button>
          ) : null}
        </>
      )}
    </li>
  );
}
