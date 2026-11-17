import { CheckCircleIcon, GitMergeIcon } from '@primer/octicons-react';
import type { FollowKind } from '../shared/types';

export const CHIP_LABEL: Record<FollowKind, string> = {
  'auto-merge': 'Auto-merge on, waiting for checks',
  merging: 'Merging...',
  merged: 'Merged',
  approved: 'Approved',
};

const MODIFIER: Record<FollowKind, string> = {
  'auto-merge': 'pr-chip-wait',
  merging: 'pr-chip-wait',
  merged: 'pr-chip-merged',
  approved: 'pr-chip-approved',
};

function Glyph({ kind }: { kind: FollowKind }) {
  if (kind === 'auto-merge' || kind === 'merging') {
    return (
      <span className="pr-chip-icon" aria-hidden="true">
        <span className="spinner" />
      </span>
    );
  }
  return kind === 'approved' ? <CheckCircleIcon size={14} /> : <GitMergeIcon size={14} />;
}

/** Status of a followed PR. The text is its accessible name; announcements live in the follow status region. */
export function PrChip({ kind }: { kind: FollowKind }) {
  return (
    <span className={`ci pr-chip ${MODIFIER[kind]}`} title={CHIP_LABEL[kind]}>
      <Glyph kind={kind} />
      <span className="pr-chip-label">{CHIP_LABEL[kind]}</span>
    </span>
  );
}
