import { useEffect, useRef, useState } from 'react';
import type { FollowKind, PrSummary } from '../shared/types';
import { repoLabel } from './repo-label';

const SPOKEN: Record<FollowKind, string> = {
  'auto-merge': ': auto-merge is on, waiting for checks',
  merging: ' is merging',
  merged: ' merged',
  approved: ' approved',
};

/** The announcement for the first PR whose chip state differs from `prev`, or undefined. */
export function followAnnouncement(
  prev: Record<string, FollowKind>,
  next: Record<string, FollowKind>,
  prs: ReadonlyMap<string, Pick<PrSummary, 'repo' | 'number'>>,
): string | undefined {
  for (const [id, kind] of Object.entries(next)) {
    if (prev[id] === kind) continue;
    const pr = prs.get(id);
    if (pr) return `${repoLabel(pr.repo)} #${pr.number}${SPOKEN[kind]}`;
  }
  return undefined;
}

interface FollowStatusProps {
  chips: Record<string, FollowKind>;
  prs: ReadonlyMap<string, Pick<PrSummary, 'repo' | 'number'>>;
}

/** One polite live region for chip changes. Row chips have none, so a long list stays quiet. */
export function FollowStatus({ chips, prs }: FollowStatusProps) {
  const prev = useRef<Record<string, FollowKind>>({});
  const [text, setText] = useState('');

  useEffect(() => {
    const said = followAnnouncement(prev.current, chips, prs);
    prev.current = chips;
    if (said) setText(said);
  }, [chips, prs]);

  return (
    <span className="sr-only" role="status">
      {text}
    </span>
  );
}
