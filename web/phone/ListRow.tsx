import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { IssueLabel } from '../../shared/issue-types';
import type { SeenState } from '../../shared/types';
import { useDensityValue } from '../density';
import { LabelChip } from '../issues/parts';
import { repoLabel } from '../repo-label';
import { PHONE_CHIPS_MAX, splitChips } from '../row-format';
import { FileIcon, PersonIcon } from '../status-glyphs';
import { BubbleIcon, formatNum } from '../ui';
import { squeezeMeta } from './row-squeeze';

export interface ListRowProps {
  title: string;
  unread: boolean;
  seen?: SeenState;
  time: string;
  /** The status mark, coloured by `glyphClass`. */
  glyph: ReactNode;
  glyphClass: string;
  sentence: string;
  labels?: readonly IssueLabel[];
  repo: string;
  number: number;
  author?: string;
  files?: number;
  diff?: { add: number; del: number };
  comments?: number;
  /** The full status, read in place of the row's text. */
  label: string;
  expanded?: boolean;
  onClick: () => void;
}

function Badge({ seen }: { seen: SeenState | undefined }) {
  if (seen === 'new') return <span className="ph-badge ph-badge-new">NEW</span>;
  if (seen === 'updated') return <span className="ph-badge ph-badge-updated">UPDATED</span>;
  return null;
}

/**
 * Label chips with every `+N` the squeeze can fold to. `data-k` is how many shown
 * labels that variant folds; only k 0 is visible until `squeezeMeta` picks another.
 */
function Chips({ labels }: { labels: readonly IssueLabel[] }) {
  const { shown, extra } = splitChips(labels, PHONE_CHIPS_MAX[useDensityValue()]);
  if (labels.length === 0) return null;
  const folds = Array.from({ length: shown.length + 1 }, (_, k) => k).filter((k) => extra + k > 0);
  return (
    <span className="ph-lrow-chips">
      {shown.map((l) => (
        <LabelChip key={l.name} label={l} />
      ))}
      {folds.map((k) => (
        <span key={k} className="chip chip-more" data-k={k} hidden={k !== 0} title={`${extra + k} more labels`}>
          +{extra + k}
        </span>
      ))}
    </span>
  );
}

/** One phone list row for PRs, issues and Activity: title, status sentence, then chips and counts. */
export function ListRow(p: ListRowProps) {
  const meta = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (meta.current) squeezeMeta(meta.current);
  });

  return (
    <button
      type="button"
      className={`ph-lrow${p.unread ? ' is-unread' : ''}`}
      aria-label={p.label}
      aria-expanded={p.expanded}
      onClick={p.onClick}
    >
      {p.unread ? <span className="ph-dot" aria-hidden="true" /> : null}
      <span className="ph-lrow-top">
        <span className="ph-lrow-title">{p.title}</span>
        <Badge seen={p.seen} />
        <span className="ph-lrow-time">{p.time}</span>
      </span>
      <span className="ph-lrow-status">
        <span className={`ph-lrow-glyph ${p.glyphClass}`} aria-hidden="true">
          {p.glyph}
        </span>
        <span className="ph-lrow-sentence">{p.sentence}</span>
      </span>
      <span className="ph-lrow-meta" ref={meta}>
        {p.labels ? <Chips labels={p.labels} /> : null}
        <span className="ph-lrow-repo-name">{repoLabel(p.repo)}</span>
        <span className="row-num">#{p.number}</span>
        {p.author !== undefined ? (
          <span className="ph-lrow-author">
            <PersonIcon />
            {p.author}
          </span>
        ) : null}
        {p.files !== undefined ? (
          <span className="ph-lrow-files">
            <FileIcon />
            {formatNum(p.files)}
          </span>
        ) : null}
        <span className="ph-lrow-end">
          {p.diff ? <span>{`+${formatNum(p.diff.add)} -${formatNum(p.diff.del)}`}</span> : null}
          {p.comments ? (
            <span className="ph-lrow-comments">
              <BubbleIcon />
              {formatNum(p.comments)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
