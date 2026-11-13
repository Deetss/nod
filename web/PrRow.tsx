import { Fragment } from 'react';
import type { PrSummary } from '../shared/types';
import { useDensityValue } from './density';
import { useFollow } from './follow';
import { RowOrcaChip } from './orca/OrcaContext';
import { PrChip } from './PrChip';
import { RowMeta } from './RowMeta';
import { CiPill, ConflictChip, ExtLink, formatAge, formatNum } from './ui';
import { repoLabel } from './repo-label';

interface PrRowProps {
  pr: PrSummary;
  selected: boolean;
  onSelect: (pr: PrSummary) => void;
  onOpen: (pr: PrSummary) => void;
}

function Title({ pr }: { pr: PrSummary }) {
  return (
    <div className="row-title clamp2" title={pr.title}>
      {pr.title.split(' ').map((word, i) => (
        <Fragment key={i}>
          <span className="word">{word}</span>{' '}
        </Fragment>
      ))}
    </div>
  );
}

export function PrRow({ pr, selected, onSelect, onOpen }: PrRowProps) {
  const comfortable = useDensityValue() === 'comfortable';
  const follow = useFollow(pr.id, pr.autoMerge);
  const unseen = pr.seen !== 'seen';
  const size = `+${formatNum(pr.additions)} -${formatNum(pr.deletions)}, ${pr.changedFiles} file${pr.changedFiles === 1 ? '' : 's'}`;
  const badge =
    pr.seen === 'new' ? (
      <span className="badge badge-new">NEW</span>
    ) : pr.seen === 'updated' ? (
      <span className="badge badge-updated">UPDATED</span>
    ) : null;
  const rowProps = {
    id: `row-${pr.id}`,
    role: 'option',
    'aria-selected': selected,
    className: `row${selected ? ' is-selected' : ''}${unseen ? ' is-unseen' : ''}${follow.fading ? ' is-exiting' : ''}`,
    onClick: () => onSelect(pr),
    onDoubleClick: () => onOpen(pr),
  };

  const link = <ExtLink className="row-ext" href={pr.url} label="Open on GitHub" />;
  const draft = pr.isDraft ? <span className="draft-chip">Draft</span> : null;

  if (comfortable) {
    const status = [pr.seen === 'updated' ? pr.updatedNote : undefined, pr.reviewStatus].filter(Boolean).join(' · ');
    return (
      <div {...rowProps}>
        {unseen ? <span className="dot" aria-hidden="true" /> : null}
        {link}
        <div className="row-titleline">
          <Title pr={pr} />
          {draft}
          {badge}
        </div>
        <div className="row-ci">
          <CiPill state={pr.ci} />
          {pr.conflicting ? <ConflictChip /> : null}
          <RowOrcaChip prId={pr.id} />
          {follow.kind ? <PrChip kind={follow.kind} /> : <span className="row-status ellipsis">{status}</span>}
        </div>
        <div className="row-meta muted">
          <span className="ellipsis">
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
        </div>
      </div>
    );
  }

  return (
    <div {...rowProps}>
      {unseen ? <span className="dot" aria-hidden="true" /> : null}
      {link}
      <div className="row-l1 muted">
        <span className="ellipsis">
          {repoLabel(pr.repo)} <span className="row-num">#{pr.number}</span>
        </span>
        {draft}
        {badge}
        {pr.seen === 'updated' && pr.updatedNote ? (
          <span className="row-note ellipsis">{pr.updatedNote}</span>
        ) : null}
        <span className="row-age">{formatAge(pr.updatedAt)}</span>
      </div>
      <Title pr={pr} />
      <div className="row-l3 muted">
        <span className="ellipsis row-author">{pr.author}</span>
        <CiPill state={pr.ci} />
        {pr.conflicting ? <ConflictChip /> : null}
        <RowOrcaChip prId={pr.id} />
        <span className="row-size">{size}</span>
        <span className="row-review">{pr.reviewStatus}</span>
      </div>
      <div className="row-l4 muted">
        <span>{size}</span>
        <span>{pr.reviewStatus}</span>
      </div>
    </div>
  );
}
