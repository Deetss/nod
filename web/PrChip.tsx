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
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'approved' ? (
        <>
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5.3 8.3l1.9 1.9 3.5-4.2" />
        </>
      ) : (
        <>
          <circle cx="4.5" cy="3.5" r="1.6" />
          <circle cx="4.5" cy="12.5" r="1.6" />
          <circle cx="11.5" cy="8.5" r="1.6" />
          <path d="M4.5 5.1v5.8M4.5 5.5c0 2.2 2.6 3 5.4 3" />
        </>
      )}
    </svg>
  );
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
