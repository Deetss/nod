import type { ReactNode } from 'react';
import { PullList, SectionHeader } from './PhoneList';
import { EmptyBlock, LoadingLine, ReachBanner, SkeletonSections } from './PhoneStates';
import type { PhoneStatus } from './phone-logic';

export interface InboxSectionView {
  key: string;
  title: string;
  count: number;
  open: boolean;
  /** No rows after search and filters. Opening it shows `emptyLine` and is not saved. */
  empty: boolean;
  rows: ReactNode;
}

interface PhoneInboxProps {
  /** Search results, which replace the list while a query is typed. */
  results?: ReactNode;
  sections: InboxSectionView[];
  status: PhoneStatus;
  /** Section titles the skeleton shows while loading. */
  skeletonTitles: string[];
  syncLine: string;
  cachedLine: string;
  errorDetail: string;
  /** The error-state banner: a token state or a sync failure. Without one, Can't reach Nod. */
  banner?: ReactNode;
  /** A quiet notice above the rows while nothing is wrong. */
  notice?: ReactNode;
  refreshing: boolean;
  emptyTitle: string;
  emptyBody: string;
  /** The line an empty section shows when tapped open. */
  emptyLine: string;
  /** Singular item noun for the header's accessible count. */
  noun: string;
  onToggle: (s: InboxSectionView) => void;
  /** Resolves false when the sync failed. */
  onRefresh: () => Promise<boolean>;
  /** GitHub's rate limit holds, so a pull sends no request. */
  limited?: boolean;
}

/** B1 for one list tab, with the S1 empty, S2 loading and S3 error states. */
export function PhoneInbox(p: PhoneInboxProps) {
  const loading = p.status === 'loading';
  if (p.results) return p.results;
  if (p.status === 'empty') {
    return (
      <div className="ph-list is-short">
        <EmptyBlock
          title={p.emptyTitle}
          body={p.emptyBody}
          syncLine={p.syncLine}
          refreshing={p.refreshing}
          onRefresh={p.onRefresh}
        />
      </div>
    );
  }
  return (
    <PullList
      locked={loading}
      short={p.status === 'error'}
      banner={p.status === 'error' ? (p.banner ?? <ReachBanner detail={p.errorDetail} onRetry={p.onRefresh} />) : (p.notice ?? null)}
      refreshing={p.refreshing && !loading}
      onRefresh={p.onRefresh}
      limited={p.limited}
      syncLine={loading ? <LoadingLine /> : p.status === 'error' ? p.cachedLine : p.syncLine}
    >
      {loading ? (
        <SkeletonSections titles={p.skeletonTitles} />
      ) : (
        p.sections.map((s) => (
          <div key={s.key} className="ph-section-group">
            <SectionHeader title={s.title} count={s.count} noun={p.noun} open={s.open} onToggle={() => p.onToggle(s)} />
            {!s.open ? null : s.empty ? <div className="ph-section-empty">{p.emptyLine}</div> : s.rows}
          </div>
        ))
      )}
    </PullList>
  );
}
