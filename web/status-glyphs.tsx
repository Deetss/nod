import { useId, type ReactNode } from 'react';
import type { CiState, PrSummary } from '../shared/types';
import { statusOption } from './org-settings';
import { RingIcon } from './ui';

/** 16 grid, stroke 1.6, round caps and joins, as `glyph` in `ui.tsx`. */
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Svg({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Filled shape with its mark cut out, so the row fill (pressed too) shows through. */
function Cut({ size, shape, cut }: { size: number; shape: ReactNode; cut: ReactNode }) {
  const id = `cut${useId().replace(/[^\w-]/g, '')}`;
  return (
    <Svg size={size}>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
        <rect width="16" height="16" fill="#fff" />
        <g stroke="#000" fill="#000" strokeLinecap="round" strokeLinejoin="round">
          {cut}
        </g>
      </mask>
      <g mask={`url(#${id})`} fill="currentColor">
        {shape}
      </g>
    </Svg>
  );
}

interface IconProps {
  size?: number;
}

export function CiFailGlyph({ size = 16 }: IconProps) {
  return (
    <Cut
      size={size}
      shape={<path d="M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2Z" />}
      cut={<path d="M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6" fill="none" strokeWidth="1.8" />}
    />
  );
}

export function ChangesGlyph({ size = 16 }: IconProps) {
  return (
    <Cut
      size={size}
      shape={<path d="M8 1.6 14.9 13.9H1.1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />}
      cut={
        <>
          <path d="M8 6v3.4" fill="none" strokeWidth="1.8" />
          <circle cx="8" cy="11.7" r="1" stroke="none" />
        </>
      }
    />
  );
}

export function RunningGlyph({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 2a6 6 0 1 1-6 6" {...stroke} />
    </Svg>
  );
}

export function ReviewGlyph({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" {...stroke} />
      <circle cx="8" cy="8" r="1.9" fill="currentColor" />
    </Svg>
  );
}

export function ApprovedGlyph({ size = 16 }: IconProps) {
  return (
    <Cut
      size={size}
      shape={<circle cx="8" cy="8" r="7" />}
      cut={<path d="M4.9 8.2l2.1 2.1 4.1-4.5" fill="none" strokeWidth="1.8" />}
    />
  );
}

export function DashGlyph({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M4 8h8" {...stroke} strokeWidth="1.8" />
    </Svg>
  );
}

export function ReadyGlyph({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8" r="6" {...stroke} />
    </Svg>
  );
}

export function ProgressGlyph({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8" r="6" {...stroke} />
      <path d="M8 4.4a3.6 3.6 0 0 1 0 7.2Z" fill="currentColor" />
    </Svg>
  );
}

export function InReviewGlyph({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="8" r="6" {...stroke} />
      <path d="M8 8V4.4a3.6 3.6 0 1 1-3.6 3.6Z" fill="currentColor" />
    </Svg>
  );
}

export function PersonIcon({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="8" cy="5.4" r="2.6" {...stroke} strokeWidth="1.4" />
      <path d="M2.9 13.8c0-2.9 2.3-4.6 5.1-4.6s5.1 1.7 5.1 4.6" {...stroke} strokeWidth="1.4" />
    </Svg>
  );
}

export function FileIcon({ size = 14 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M4 1.8h5l3.5 3.5v8.9H4Z" {...stroke} strokeWidth="1.4" />
      <path d="M9 1.8v3.5h3.5" {...stroke} strokeWidth="1.4" />
    </Svg>
  );
}

/** PR states, worst first. The kind is also the glyph's colour class. */
export type PrGlyphKind = 'ci-fail' | 'changes' | 'running' | 'review' | 'approved';

export type IssueGlyphKind = 'backlog' | 'ready' | 'progress' | 'in-review' | 'done' | 'none';

export function prGlyph(pr: Pick<PrSummary, 'ci' | 'reviewStatus'>): PrGlyphKind {
  if (pr.ci === 'fail') return 'ci-fail';
  if (pr.reviewStatus === 'changes requested') return 'changes';
  if (pr.ci === 'running') return 'running';
  if (pr.reviewStatus === 'needs review' || pr.reviewStatus === 'no reviews yet') return 'review';
  return 'approved';
}

const CI_WORDS: Record<CiState, string> = {
  fail: 'CI failing',
  running: 'CI running',
  pass: 'CI passing',
  none: 'No CI',
};

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** `[Draft ·] lead · other [· updatedNote]`. CI leads when the glyph shows CI. */
export function prSentence(pr: Pick<PrSummary, 'ci' | 'reviewStatus' | 'isDraft' | 'seen' | 'updatedNote'>): string {
  const kind = prGlyph(pr);
  const ci = CI_WORDS[pr.ci];
  const pair = kind === 'ci-fail' || kind === 'running' ? [ci, pr.reviewStatus] : [pr.reviewStatus, ci];
  const note = pr.seen === 'updated' ? pr.updatedNote : undefined;
  return capitalise([pr.isDraft ? 'Draft' : undefined, ...pair, note].filter(Boolean).join(' · '));
}

export const NO_STATUS = 'No project status';

/** The project status option a name matches, by the configured option names. */
export function issueGlyph(status: string | undefined): IssueGlyphKind {
  if (!status) return 'none';
  if (status === statusOption('backlog')) return 'backlog';
  if (status === statusOption('ready')) return 'ready';
  if (status === statusOption('inProgress')) return 'progress';
  if (status === statusOption('inReview')) return 'in-review';
  if (status === statusOption('done')) return 'done';
  return 'none';
}

export function issueSentence(issue: { status?: string; seen: string; updatedNote?: string }): string {
  const note = issue.seen === 'updated' ? issue.updatedNote : undefined;
  return [issue.status || NO_STATUS, note].filter(Boolean).join(' · ');
}

const GLYPHS: Record<PrGlyphKind | IssueGlyphKind, (p: IconProps) => ReactNode> = {
  'ci-fail': CiFailGlyph,
  changes: ChangesGlyph,
  running: RunningGlyph,
  review: ReviewGlyph,
  approved: ApprovedGlyph,
  backlog: ({ size }) => <RingIcon size={size} />,
  ready: ReadyGlyph,
  progress: ProgressGlyph,
  'in-review': InReviewGlyph,
  done: ApprovedGlyph,
  none: DashGlyph,
};

export function StatusGlyph({ kind }: { kind: PrGlyphKind | IssueGlyphKind }) {
  const Glyph = GLYPHS[kind];
  return <Glyph size={16} />;
}
