import { useContext } from 'react';
import type { WorktreeView } from '../../shared/orca-sessions';
import { HostFallback, HostTag, NewWorktreeRow, type WorktreeHost } from './HostPicker';
import { agoShort } from './hosts';
import { OrcaSessionsContext } from './OrcaContext';

/** The PR's existing worktree with no live agent, which a dispatch reuses unless told otherwise. */
export function useIdleWorktree(prId: string | undefined): WorktreeView | undefined {
  const { available, byPr } = useContext(OrcaSessionsContext);
  return available && prId ? byPr[prId]?.idle?.[0] : undefined;
}

interface ReuseRowProps {
  w: WorktreeView;
  on: boolean;
  busy?: boolean;
  onSelect: () => void;
}

/** A picker row for an idle worktree, laid out like a session row. */
export function ReuseRow({ w, on, busy, onSelect }: ReuseRowProps) {
  const last = w.lastOutputAt ? ` · last output ${agoShort(w.lastOutputAt)} ago` : '';
  return (
    <div role="option" aria-selected={on} className={`picker-row picker-row-2${on ? ' is-focus' : ''}`} onClick={() => !busy && onSelect()}>
      <span className="picker-row-line1">
        <span className={`picker-radio${on ? ' is-on' : ''}`} aria-hidden="true" />
        <span className="mono orca-picker-name">{w.name}</span>
        <HostTag host={w.host} />
        <span className="orca-word muted">No agent</span>
      </span>
      <span className="picker-row-line2 muted">
        <span className="orca-reason">{`${w.reason}${last}`}</span>
        {on ? <span className="picker-act">Reuse</span> : null}
      </span>
    </div>
  );
}

export const REUSE_NOTE = 'The agent starts in the worktree this PR already has. Pick New worktree to work on a separate copy.';
export const SECOND_NOTE = 'A second worktree for this PR. The first one stays as it is.';

interface Props {
  idle: WorktreeView;
  reuse: boolean;
  onReuse: (reuse: boolean) => void;
  wh: WorktreeHost;
  busy?: boolean;
}

/** Reuse the PR's worktree or start a new one. Up and Down move the choice. */
export function ReuseChoice({ idle, reuse, onReuse, wh, busy }: Props) {
  return (
    <>
      <div
        className="picker-list orca-picker-list dispatch-all-pick"
        role="listbox"
        tabIndex={0}
        aria-label="Where the agent runs"
        onKeyDown={(e) => {
          if (busy || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
          e.preventDefault();
          onReuse(e.key === 'ArrowUp');
        }}
      >
        <ReuseRow w={idle} on={reuse} busy={busy} onSelect={() => onReuse(true)} />
        <NewWorktreeRow hosts={wh.hosts} host={wh.host} on={!reuse} busy={busy} radio onSelect={() => onReuse(false)} onPick={wh.pick} />
      </div>
      {reuse ? null : <HostFallback fallback={wh.fallback} />}
      <span className="muted small">{reuse ? REUSE_NOTE : SECOND_NOTE}</span>
    </>
  );
}
