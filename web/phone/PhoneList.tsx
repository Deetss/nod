import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { IssueSummary } from '../../shared/issue-types';
import type { PrSummary, SeenState } from '../../shared/types';
import { repoLabel } from '../repo-label';
import { issueGlyph, issueSentence, prGlyph, prSentence, StatusGlyph } from '../status-glyphs';
import { ageWords, formatAge } from '../ui';
import { ChevronIcon } from './PhoneIcons';
import { ListRow } from './ListRow';
import { usePullToRefresh } from './PullDisc';
import { squeezeAll } from './row-squeeze';

const SEEN_WORD: Record<SeenState, string | undefined> = { new: 'New', updated: 'Updated', seen: undefined };

/** Spoken form of a row sentence: the dots become commas. */
const spoken = (s: string): string => s.replace(/ · /g, ', ');

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function prRowLabel(pr: PrSummary, now = Date.now()): string {
  return [
    pr.title,
    SEEN_WORD[pr.seen],
    spoken(prSentence(pr)),
    `${repoLabel(pr.repo)} number ${pr.number} by ${pr.author}`,
    plural(pr.changedFiles, 'file'),
    `plus ${pr.additions} minus ${pr.deletions}`,
    pr.commentCount ? plural(pr.commentCount, 'comment') : undefined,
    ageWords(pr.updatedAt, now),
  ]
    .filter(Boolean)
    .join(', ');
}

export function issueRowLabel(issue: IssueSummary, showStatus: boolean, now = Date.now()): string {
  return [
    issue.title,
    SEEN_WORD[issue.seen],
    showStatus ? spoken(issueSentence(issue)) : issue.seen === 'updated' ? issue.updatedNote : undefined,
    issue.labels.length > 0 ? `labels ${issue.labels.map((l) => l.name).join(', ')}` : undefined,
    `${repoLabel(issue.repo)} number ${issue.number} by ${issue.author}`,
    issue.commentCount ? plural(issue.commentCount, 'comment') : undefined,
    ageWords(issue.updatedAt, now),
  ]
    .filter(Boolean)
    .join(', ');
}

export function PrRow({ pr, onOpen }: { pr: PrSummary; onOpen: (pr: PrSummary) => void }) {
  const kind = prGlyph(pr);
  return (
    <ListRow
      title={pr.title}
      unread={pr.seen !== 'seen'}
      seen={pr.seen}
      time={formatAge(pr.updatedAt)}
      glyph={<StatusGlyph kind={kind} />}
      glyphClass={`is-${kind}`}
      sentence={prSentence(pr)}
      repo={pr.repo}
      number={pr.number}
      author={pr.author}
      files={pr.changedFiles}
      diff={{ add: pr.additions, del: pr.deletions }}
      comments={pr.commentCount}
      label={prRowLabel(pr)}
      onClick={() => onOpen(pr)}
    />
  );
}

export function IssueRow({
  issue,
  showStatus = false,
  onOpen,
}: {
  issue: IssueSummary;
  /** The org project resolved. Without one the row has no status line. */
  showStatus?: boolean;
  onOpen: (i: IssueSummary) => void;
}) {
  const kind = issueGlyph(issue.status);
  return (
    <ListRow
      title={issue.title}
      unread={issue.seen !== 'seen'}
      seen={issue.seen}
      time={formatAge(issue.updatedAt)}
      glyph={<StatusGlyph kind={kind} />}
      glyphClass={`is-${kind}`}
      sentence={showStatus ? issueSentence(issue) : undefined}
      labels={issue.labels}
      repo={issue.repo}
      number={issue.number}
      author={issue.author}
      comments={issue.commentCount}
      label={issueRowLabel(issue, showStatus)}
      onClick={() => onOpen(issue)}
    />
  );
}

export function SectionHeader({
  title,
  count,
  noun,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  /** Singular, as in `pull request`. */
  noun: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="ph-section"
      aria-expanded={open}
      aria-label={`${title}, ${count} ${count === 1 ? noun : `${noun}s`}`}
      onClick={onToggle}
    >
      <span className="ph-section-chev">
        <ChevronIcon open size={16} />
      </span>
      <span className="ph-section-title">{title}</span>
      <span className="ph-section-count">{count}</span>
      <span className="ph-section-rule" aria-hidden="true" />
    </button>
  );
}

interface PullListProps {
  /** The pull pill short of the line, `Synced 2m ago`. */
  synced: string;
  locked?: boolean;
  /** The header stays expanded: no spare scroll distance for the collapse. */
  short?: boolean;
  /** The chip row, the first thing in the scroll. */
  chips?: ReactNode;
  /** Sits between the chip row and the rows. */
  banner?: ReactNode;
  /** Resolves false when the sync failed. */
  onRefresh: () => Promise<boolean>;
  /** GitHub's rate limit holds, so a pull sends no request. */
  limited?: boolean;
  children: ReactNode;
}

/** The one vertical scroller on a tab. A touch drag from the top past 72px refreshes. */
export function PullList({ synced, locked, short, chips, banner, onRefresh, limited, children }: PullListProps) {
  const el = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh({ scroller: el, onRefresh, limited, synced });
  const heldBanner = useRef(banner);
  if (!pull.holding) heldBanner.current = banner;

  useEffect(() => {
    const list = el.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    let width = list.clientWidth;
    const ro = new ResizeObserver(() => {
      if (list.clientWidth === width) return;
      width = list.clientWidth;
      squeezeAll(list);
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      {pull.disc}
      <div
        ref={el}
        className={`ph-list${locked ? ' is-locked' : ''}${locked || short ? ' is-short' : ''}`}
        {...pull.handlers}
      >
        <div className="ph-list-body">
          {chips}
          {heldBanner.current}
          {children}
        </div>
      </div>
    </>
  );
}
