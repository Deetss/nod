import { latestChecks } from './fix-checks';
import type { CheckItem, PrDetail } from './types';

/** Pure logic behind the merge status box: which rows show, their copy, and the checks ring. */

export type Tone = 'danger' | 'success' | 'attention' | 'neutral' | 'done';
export type RowGlyph = 'diff' | 'check' | 'clock' | 'alert' | 'merge' | 'x';

export interface StatusRow {
  key: 'review' | 'checks' | 'mergeability' | 'final';
  tone: Tone;
  glyph: RowGlyph;
  headline: string;
  sub: string;
}

export interface DetailRow {
  key: 'changes' | 'pending';
  label: string;
}

export interface CheckBuckets {
  failing: number;
  cancelled: number;
  pending: number;
  skipped: number;
  successful: number;
  total: number;
}

export type RingKey = 'failing' | 'cancelled' | 'pending' | 'skipped' | 'successful';

export interface RingSegment {
  key: RingKey;
  /** Length of the painted arc, in the same units as the circumference. */
  length: number;
  /** Distance from 12 o'clock, clockwise. */
  start: number;
}

export interface ChecksRow extends StatusRow {
  key: 'checks';
  counts: CheckBuckets;
  /** Centre glyph of the ring. */
  centre: 'x' | 'spinner' | 'check';
  /** The checks list starts open. */
  openByDefault: boolean;
}

export interface StatusBox {
  review?: StatusRow;
  details: DetailRow[];
  checks?: ChecksRow;
  mergeability?: StatusRow;
  /** Replaces every other row on a closed or merged PR. */
  final?: StatusRow;
  /** Open PRs show the action bar. */
  showActions: boolean;
}

export const CHECKS_SHOWN = 5;
export const RING_RADIUS = 13.5;
export const RING_GAP = 2;
export const RING_ORDER: readonly RingKey[] = ['failing', 'cancelled', 'pending', 'skipped', 'successful'];

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function bucketChecks(checks: readonly Pick<CheckItem, 'status'>[]): CheckBuckets {
  const n = (...s: CheckItem['status'][]) => checks.filter((c) => s.includes(c.status)).length;
  return {
    failing: n('fail'),
    cancelled: n('cancelled'),
    pending: n('running', 'queued'),
    skipped: n('skipped'),
    successful: n('pass'),
    total: checks.length,
  };
}

/** "1 failing, 1 cancelled, 1 skipped, 14 successful checks"; zero counts are left out. */
export function countsLine(b: CheckBuckets): string {
  const parts = RING_ORDER.filter((k) => b[k] > 0).map((k) => `${b[k]} ${k}`);
  return `${parts.join(', ')} ${plural(b.total, 'check', 'checks')}`;
}

/** Ring arcs clockwise from 12 o'clock in counts order, each sized by its share, with a gap between them. */
export function ringSegments(b: CheckBuckets, radius = RING_RADIUS, gap = RING_GAP): RingSegment[] {
  if (b.total === 0) return [];
  const circumference = 2 * Math.PI * radius;
  const present = RING_ORDER.filter((k) => b[k] > 0);
  const gaps = present.length > 1 ? gap : 0;
  let start = 0;
  return present.map((key) => {
    const share = (b[key] / b.total) * circumference;
    const seg = { key, length: Math.max(share - gaps, 0.01), start };
    start += share;
    return seg;
  });
}

function checksRow(checks: readonly CheckItem[]): ChecksRow {
  const counts = bucketChecks(checks);
  const bad = counts.failing > 0 || counts.cancelled > 0;
  const headline = bad
    ? 'Some checks were not successful'
    : counts.pending > 0
      ? "Some checks haven't completed yet"
      : 'All checks have passed';
  return {
    key: 'checks',
    tone: bad ? 'danger' : counts.pending > 0 ? 'attention' : 'success',
    glyph: bad ? 'x' : counts.pending > 0 ? 'clock' : 'check',
    headline,
    sub: countsLine(counts),
    counts,
    centre: bad ? 'x' : counts.pending > 0 ? 'spinner' : 'check',
    openByDefault: counts.failing > 0 || counts.pending > 0,
  };
}

type ReviewInput = Pick<PrDetail, 'reviewDecision' | 'changeRequests' | 'approvals'>;

function reviewRow(d: ReviewInput): StatusRow | undefined {
  if (d.reviewDecision === 'CHANGES_REQUESTED') {
    const n = Math.max(d.changeRequests ?? 0, 1);
    return {
      key: 'review',
      tone: 'danger',
      glyph: 'diff',
      headline: 'Changes requested',
      sub: `${n} ${plural(n, 'change', 'changes')} requested by reviewers with write access`,
    };
  }
  if (d.reviewDecision === 'APPROVED') {
    const n = Math.max(d.approvals ?? 0, 1);
    return {
      key: 'review',
      tone: 'success',
      glyph: 'check',
      headline: 'Changes approved',
      sub: `${n} approving ${plural(n, 'review', 'reviews')} by reviewers with write access`,
    };
  }
  if (d.reviewDecision === 'REVIEW_REQUIRED') {
    return {
      key: 'review',
      tone: 'attention',
      glyph: 'clock',
      headline: 'Review required',
      sub: 'At least 1 approving review is required by reviewers with write access',
    };
  }
  return undefined;
}

function detailRows(d: ReviewInput & Pick<PrDetail, 'pendingReviews'>, review: StatusRow | undefined): DetailRow[] {
  if (!review) return [];
  const rows: DetailRow[] = [];
  const changes = d.reviewDecision === 'CHANGES_REQUESTED' ? Math.max(d.changeRequests ?? 0, 1) : (d.changeRequests ?? 0);
  if (changes >= 1) rows.push({ key: 'changes', label: `${changes} requested ${plural(changes, 'change', 'changes')}` });
  const pending = d.pendingReviews ?? 0;
  if (pending >= 1) rows.push({ key: 'pending', label: `${pending} pending ${plural(pending, 'review', 'reviews')}` });
  return rows;
}

type MergeInput = Pick<PrDetail, 'mergeable' | 'mergeStateStatus' | 'reviewDecision'>;

function mergeabilityRow(d: MergeInput): StatusRow {
  const base = { key: 'mergeability' as const };
  if (d.mergeable === 'CONFLICTING' || d.mergeStateStatus === 'DIRTY') {
    return {
      ...base,
      tone: 'danger',
      glyph: 'alert',
      headline: 'This branch has conflicts that must be resolved',
      sub: 'Resolve the conflicts with Orca, or on GitHub, then refresh.',
    };
  }
  if (d.mergeable !== 'MERGEABLE') {
    return {
      ...base,
      tone: 'neutral',
      glyph: 'clock',
      headline: 'Checking for conflicts',
      sub: 'GitHub is still computing mergeability.',
    };
  }
  if (d.mergeStateStatus === 'BEHIND') {
    return {
      ...base,
      tone: 'attention',
      glyph: 'alert',
      headline: 'This branch is out of date with the base branch',
      sub: 'Update the branch on GitHub to merge.',
    };
  }
  const blocked =
    d.mergeStateStatus === 'BLOCKED' ||
    d.mergeStateStatus === 'DRAFT' ||
    d.reviewDecision === 'CHANGES_REQUESTED' ||
    d.reviewDecision === 'REVIEW_REQUIRED';
  return {
    ...base,
    tone: 'success',
    glyph: 'check',
    headline: 'This branch has no conflicts with the base branch',
    sub: blocked ? 'Merging is blocked by the requirements above.' : 'Merging can be performed automatically.',
  };
}

type StatusInput = ReviewInput &
  MergeInput &
  Pick<PrDetail, 'pendingReviews' | 'checks' | 'isOpen' | 'merged'>;

/** Rows in the fixed order: review, checks, mergeability, action bar. A row with nothing to say is left out. */
export function buildStatusBox(d: StatusInput): StatusBox {
  if (d.isOpen === false) {
    const final: StatusRow = d.merged
      ? { key: 'final', tone: 'done', glyph: 'merge', headline: 'Pull request merged', sub: '' }
      : { key: 'final', tone: 'neutral', glyph: 'alert', headline: 'Pull request closed', sub: '' };
    return { details: [], final, showActions: false };
  }
  const review = reviewRow(d);
  return {
    review,
    details: detailRows(d, review),
    checks: d.checks.length > 0 ? checksRow(latestChecks(d.checks)) : undefined,
    mergeability: mergeabilityRow(d),
    showActions: true,
  };
}

const rank = (s: CheckItem['status']): number =>
  ({ fail: 0, cancelled: 1, running: 2, queued: 3, skipped: 4, pass: 5 })[s];

/** Failing, cancelled, running, queued, skipped, then passed. Stable within a group. */
export function orderChecks<T extends Pick<CheckItem, 'status'>>(checks: readonly T[]): T[] {
  return checks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c.status) - rank(b.c.status) || a.i - b.i)
    .map((x) => x.c);
}

/** What the list shows: the first five, or all of them once expanded. */
export function visibleChecks<T extends Pick<CheckItem, 'status'>>(ordered: readonly T[], all: boolean): T[] {
  return all ? [...ordered] : ordered.slice(0, CHECKS_SHOWN);
}

export function checksStripText(shown: number, total: number): string {
  return `Problems first. Showing ${shown} of ${total}.`;
}

/** The tail button label, or undefined when nothing is hidden. */
export function checksTailLabel(ordered: readonly Pick<CheckItem, 'status'>[], all: boolean): string | undefined {
  if (all) return 'Show fewer';
  const rest = ordered.slice(CHECKS_SHOWN);
  if (rest.length === 0) return undefined;
  const allPass = rest.every((c) => c.status === 'pass');
  return `Show ${rest.length} more ${allPass ? 'successful ' : ''}${plural(rest.length, 'check', 'checks')}`;
}
