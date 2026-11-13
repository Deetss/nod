import type { ReactNode } from 'react';
import { Chips } from './PhoneBars';
import { PullList, SectionHeader } from './PhoneList';
import { EmptyBlock, ErrorBanner, LoadingLine, SkeletonSections } from './PhoneStates';
import type { ChipCount, PhoneStatus } from './phone-logic';

export interface InboxSectionView {
  key: string;
  title: string;
  count: number;
  open: boolean;
  rows: ReactNode;
}

interface PhoneInboxProps {
  chips: ChipCount<string>[];
  chip: string;
  onChip: (k: string) => void;
  sections: InboxSectionView[];
  status: PhoneStatus;
  /** Section titles the skeleton shows while loading. */
  skeletonTitles: string[];
  syncLine: string;
  cachedLine: string;
  errorDetail: string;
  refreshing: boolean;
  emptyTitle: string;
  emptyBody: string;
  onToggle: (key: string) => void;
  onRefresh: () => void;
}

/** B1 for one list tab, with the S1 empty, S2 loading and S3 error states. */
export function PhoneInbox(p: PhoneInboxProps) {
  const loading = p.status === 'loading';
  return (
    <>
      <Chips chips={p.chips} value={p.chip} onChange={p.onChip} showCounts={!loading} />
      {p.status === 'error' ? <ErrorBanner detail={p.errorDetail} onRetry={p.onRefresh} /> : null}
      {p.status === 'empty' ? (
        <div className="ph-list">
          <EmptyBlock
            title={p.emptyTitle}
            body={p.emptyBody}
            syncLine={p.syncLine}
            refreshing={p.refreshing}
            onRefresh={p.onRefresh}
          />
        </div>
      ) : (
        <PullList
          locked={loading}
          refreshing={p.refreshing && !loading}
          onRefresh={p.onRefresh}
          syncLine={
            loading ? <LoadingLine /> : p.status === 'error' ? p.cachedLine : p.syncLine
          }
        >
          {loading ? (
            <SkeletonSections titles={p.skeletonTitles} />
          ) : (
            p.sections.map((s) => (
              <div key={s.key}>
                <SectionHeader
                  title={s.title}
                  count={s.count}
                  open={s.open}
                  onToggle={() => p.onToggle(s.key)}
                />
                {s.open ? s.rows : null}
              </div>
            ))
          )}
        </PullList>
      )}
    </>
  );
}
