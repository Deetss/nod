import { Fragment } from 'react';
import type { IssueSummary } from '../../shared/issue-types';
import { useDensityValue } from '../density';
import { splitChips } from '../row-format';
import { RowMeta } from '../RowMeta';
import { BubbleIcon, formatAge } from '../ui';
import { statusOption } from '../org-settings';
import { chipInputFor, useIssueSessions } from '../orca/OrcaContext';
import { OrcaChip } from '../orca/orca-ui';
import { commentsLabel } from './issue-utils';
import { LabelChip, StatusChip, SubIssueChip } from './parts';
import { repoLabel } from '../repo-label';

interface IssueRowProps {
  issue: IssueSummary;
  selected: boolean;
  /** Checkbox state, or undefined when bulk mode is off. */
  checked: boolean | undefined;
  stale: boolean;
  /** Show the project status chip (when the project resolved). */
  showStatus: boolean;
  /** Dispatched to Orca this session and unchanged since. Covers the gap until Orca reports the live session. */
  orca?: boolean;
  onSelect: (issue: IssueSummary) => void;
  onOpen: (issue: IssueSummary) => void;
  onCheck: (issue: IssueSummary) => void;
}

export function IssueRow({ issue, selected, checked, stale, showStatus, orca, onSelect, onOpen, onCheck }: IssueRowProps) {
  const statusChip =
    showStatus && issue.status && issue.status !== statusOption('backlog') ? <StatusChip status={issue.status} /> : null;
  const live = chipInputFor({ related: useIssueSessions(issue.id), possible: [] });
  const parent = issue.parent;
  const subNote = parent ? (
    <span className="irow-note irow-sub">
      sub-issue of {parent.repo === issue.repo ? '' : `${repoLabel(parent.repo)} `}#{parent.number}
    </span>
  ) : null;
  const chip = (
    <>
      {statusChip}
      {issue.subIssues ? <SubIssueChip {...issue.subIssues} /> : null}
      {live ? (
        <OrcaChip input={live} />
      ) : orca ? (
        <span className="chip chip-accent orca-chip" title="Dispatched to Orca">
          Orca
        </span>
      ) : null}
    </>
  );
  const comfortable = useDensityValue() === 'comfortable';
  const unseen = issue.seen !== 'seen';
  const bulk = checked !== undefined;
  const badge =
    issue.seen === 'new' ? (
      <span className="badge badge-new">NEW</span>
    ) : issue.seen === 'updated' ? (
      <span className="badge badge-updated">UPDATED</span>
    ) : null;
  const title = (
    <div className={`row-title clamp2${stale ? ' muted' : ''}`} title={issue.title}>
      {issue.title.split(' ').map((word, i) => (
        <Fragment key={i}>
          <span className="word">{word}</span>{' '}
        </Fragment>
      ))}
    </div>
  );
  const lead = bulk ? (
    <input
      type="checkbox"
      className="irow-check"
      checked={checked}
      aria-label={`Select ${repoLabel(issue.repo)} #${issue.number}`}
      onClick={(e) => e.stopPropagation()}
      onChange={() => onCheck(issue)}
    />
  ) : unseen ? (
    <span className="dot" aria-hidden="true" />
  ) : null;
  const rowProps = {
    id: `row-${issue.id}`,
    role: 'option',
    'aria-selected': selected,
    className: `row irow${selected ? ' is-selected' : ''}${unseen ? ' is-unseen' : ''}${bulk ? ' is-bulk' : ''}`,
    onClick: () => onSelect(issue),
    onDoubleClick: () => onOpen(issue),
  };

  if (comfortable) {
    const { shown, extra } = splitChips(issue.labels);
    return (
      <div {...rowProps}>
        {lead}
        <div className="row-titleline">
          {title}
          {chip}
          {badge}
        </div>
        {shown.length > 0 ? (
          <div className="row-chips">
            {shown.map((l) => (
              <LabelChip key={l.name} label={l} />
            ))}
            {extra > 0 ? (
              <span className="chip chip-more" title={`${extra} more labels`}>
                +{extra}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="row-meta muted">
          <span className="ellipsis">
            <RowMeta
              repo={issue.repo}
              number={issue.number}
              author={issue.author}
              age={formatAge(issue.updatedAt)}
            />
          </span>
          {issue.commentCount > 0 ? (
            <span className="row-bubble" title={commentsLabel(issue.commentCount)}>
              <BubbleIcon size={14} />
              {issue.commentCount}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div {...rowProps}>
      {lead}
      <div className="row-l1 muted">
        <span className="ellipsis">
          {repoLabel(issue.repo)} <span className="row-num">#{issue.number}</span>
        </span>
        {subNote}
        {chip}
        {badge}
        {issue.seen === 'updated' && issue.updatedNote ? (
          <span className="irow-note ellipsis">{issue.updatedNote}</span>
        ) : null}
        <span className="row-age">{formatAge(issue.updatedAt)}</span>
      </div>
      {title}
      <div className="row-l3 muted">
        <span className="ellipsis row-author">{issue.author}</span>
        {issue.labels.length === 0 ? (
          <em className="irow-none">no labels</em>
        ) : (
          <span className="irow-chips">
            {issue.labels.map((l) => (
              <LabelChip key={l.name} label={l} />
            ))}
          </span>
        )}
        <span className="irow-comments">{commentsLabel(issue.commentCount)}</span>
      </div>
    </div>
  );
}
