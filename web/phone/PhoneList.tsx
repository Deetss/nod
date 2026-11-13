import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import type { IssueSummary } from '../../shared/issue-types';
import type { PrSummary } from '../../shared/types';
import { commentsLabel } from '../issues/issue-utils';
import { LabelChip, StatusChip } from '../issues/parts';
import { useDensityValue } from '../density';
import { PHONE_CHIPS_MAX, splitChips } from '../row-format';
import { RowMeta } from '../RowMeta';
import { CiPill, formatAge } from '../ui';
import { statusOption } from '../org-settings';
import { ChevronIcon } from './PhoneIcons';
import { pullOffset, shouldRefresh } from './phone-logic';

function Badge({ seen }: { seen: 'new' | 'updated' | 'seen' }) {
  if (seen === 'seen') return null;
  return seen === 'new' ? (
    <span className="ph-badge ph-badge-new">NEW</span>
  ) : (
    <span className="ph-badge ph-badge-updated">UPDATED</span>
  );
}

export function PrRow({ pr, onOpen }: { pr: PrSummary; onOpen: (pr: PrSummary) => void }) {
  const unseen = pr.seen !== 'seen';
  const status = [pr.seen === 'updated' ? pr.updatedNote : undefined, pr.reviewStatus]
    .filter(Boolean)
    .join(' · ');
  return (
    <button type="button" className={`ph-row${unseen ? ' is-unseen' : ''}`} onClick={() => onOpen(pr)}>
      {unseen ? <span className="ph-dot" aria-hidden="true" /> : null}
      <span className="ph-titleline">
        <span className="ph-title">{pr.title}</span>
        {pr.isDraft ? <span className="draft-chip">Draft</span> : null}
        <Badge seen={pr.seen} />
      </span>
      <span className="ph-ci">
        <CiPill state={pr.ci} />
        <span className="ph-status">{status}</span>
      </span>
      <span className="ph-meta">
        <RowMeta
          repo={pr.repo}
          number={pr.number}
          author={pr.author}
          age={formatAge(pr.updatedAt)}
          additions={pr.additions}
          deletions={pr.deletions}
          changedFiles={pr.changedFiles}
        />
      </span>
    </button>
  );
}

export function IssueRow({
  issue,
  showStatus = false,
  onOpen,
}: {
  issue: IssueSummary;
  /** Show the project status chip (when the project resolved). */
  showStatus?: boolean;
  onOpen: (i: IssueSummary) => void;
}) {
  const unseen = issue.seen !== 'seen';
  const { shown, extra } = splitChips(issue.labels, PHONE_CHIPS_MAX[useDensityValue()]);
  const status = [issue.seen === 'updated' ? issue.updatedNote : undefined, commentsLabel(issue.commentCount)]
    .filter(Boolean)
    .join(' · ');
  return (
    <button type="button" className={`ph-row${unseen ? ' is-unseen' : ''}`} onClick={() => onOpen(issue)}>
      {unseen ? <span className="ph-dot" aria-hidden="true" /> : null}
      <span className="ph-titleline">
        <span className="ph-title">{issue.title}</span>
        <Badge seen={issue.seen} />
      </span>
      <span className="ph-ci">
        {showStatus && issue.status && issue.status !== statusOption('backlog') ? <StatusChip status={issue.status} /> : null}
        {shown.length > 0 ? (
          <span className="ph-row-chips">
            {shown.map((l) => (
              <LabelChip key={l.name} label={l} />
            ))}
            {extra > 0 ? (
              <span className="chip chip-more" title={`${extra} more labels`}>
                +{extra}
              </span>
            ) : null}
          </span>
        ) : null}
        <span className="ph-status">{status}</span>
      </span>
      <span className="ph-meta">
        <RowMeta
          repo={issue.repo}
          number={issue.number}
          author={issue.author}
          age={formatAge(issue.updatedAt)}
        />
      </span>
    </button>
  );
}

export function SectionHeader({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="ph-section" aria-expanded={open} onClick={onToggle}>
      <ChevronIcon open={open} size={16} />
      <span>{title}</span>
      <span className="ph-section-count">{count}</span>
    </button>
  );
}

interface PullListProps {
  /** Replaces the sync line while a refresh runs. */
  syncLine: ReactNode;
  refreshing: boolean;
  locked?: boolean;
  onRefresh: () => void;
  children: ReactNode;
}

/** The one vertical scroller on a tab. A touch drag from the top past 72px refreshes. */
export function PullList({ syncLine, refreshing, locked, onRefresh, children }: PullListProps) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | undefined>(undefined);
  const el = useRef<HTMLDivElement>(null);

  const onStart = (e: TouchEvent) => {
    const top = el.current?.scrollTop ?? 1;
    start.current = top <= 0 ? e.touches[0]?.clientY : undefined;
  };
  const onMove = (e: TouchEvent) => {
    if (start.current === undefined) return;
    setDy((e.touches[0]?.clientY ?? start.current) - start.current);
  };
  const onEnd = () => {
    if (start.current !== undefined && shouldRefresh(dy)) onRefresh();
    start.current = undefined;
    setDy(0);
  };

  return (
    <div
      ref={el}
      className={`ph-list${locked ? ' is-locked' : ''}`}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
    >
      <div className="ph-syncline" style={{ marginTop: pullOffset(dy) }} role="status">
        {refreshing ? <span className="ph-spinner" aria-hidden="true" /> : null}
        {refreshing ? 'Refreshing…' : dy > 0 && shouldRefresh(dy) ? 'Release to refresh' : syncLine}
      </div>
      {children}
    </div>
  );
}
