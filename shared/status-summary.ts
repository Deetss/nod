import { closedStatusLine } from './closed';
import { failingChecks, latestChecks } from './fix-checks';
import { bucketChecks, type Tone } from './status-box';
import type { PrDetail } from './types';

/** The status summary at the top of the PR detail pane (docs/design/pr-detail-spec.md). */

export type SegmentKey = 'checks' | 'threads' | 'approvals' | 'conflicts';
export type BarTone = 'success' | 'danger' | 'attention' | 'none';

export interface Segment {
  key: SegmentKey;
  label: string;
  value: string;
  /** Share of the bar to fill, 0 to 1. */
  fill: number;
  tone: BarTone;
}

export interface Verdict {
  tone: Tone;
  /** `ring` is the plain needs-review state. */
  glyph: 'ring' | 'check' | 'x' | 'alert' | 'merge' | 'clock';
  headline: string;
  sub: string;
}

export interface Summary {
  verdict: Verdict;
  /** Empty for a merged or closed PR. */
  segments: Segment[];
  /** The segment whose detail starts open: failing checks or conflicts. */
  openFirst?: SegmentKey;
}

type SummaryInput = Pick<
  PrDetail,
  'checks' | 'thread' | 'reviewDecision' | 'approvals' | 'changeRequests' | 'pendingReviews' | 'mergeable' | 'isOpen' | 'merged' | 'baseRef' | 'closedAt' | 'mergedBy'
>;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function openThreads(d: SummaryInput): { open: number; total: number } {
  const threads = (d.thread ?? []).filter((t) => t.kind === 'thread' && !t.pending);
  return { open: threads.filter((t) => t.kind === 'thread' && !t.resolved).length, total: threads.length };
}

export function buildSummary(d: SummaryInput, own: boolean): Summary {
  if (d.isOpen === false) {
    // The dated line reads `Merged on <date> by <login>`; older cached details have no date.
    const line = d.closedAt ? closedStatusLine({ merged: d.merged === true, closedAt: d.closedAt, mergedBy: d.mergedBy }) : undefined;
    return {
      verdict: d.merged
        ? { tone: 'done', glyph: 'merge', headline: line ?? 'Pull request merged', sub: line ? '' : `Merged into ${d.baseRef}` }
        : { tone: 'neutral', glyph: 'alert', headline: line ?? 'Pull request closed', sub: line ? '' : 'Closed without merging' },
      segments: [],
    };
  }

  const latest = latestChecks(d.checks);
  const b = bucketChecks(latest);
  const passed = b.successful + b.skipped;
  const { open, total } = openThreads(d);
  const approvals = d.approvals ?? 0;
  const approved = d.reviewDecision === 'APPROVED' || (!d.reviewDecision && approvals > 0);
  const conflicts = d.mergeable === 'CONFLICTING';
  const failingNames = failingChecks(latest).map((c) => c.name);

  const checks: Segment =
    b.total === 0
      ? { key: 'checks', label: 'Checks', value: 'none', fill: 0, tone: 'none' }
      : {
          key: 'checks',
          label: 'Checks',
          value: `${passed} / ${b.total}`,
          fill: passed / b.total,
          tone: b.failing + b.cancelled > 0 ? 'danger' : b.pending > 0 ? 'attention' : 'success',
        };
  const threads: Segment = {
    key: 'threads',
    label: 'Threads',
    value: `${open} open`,
    fill: total === 0 ? 1 : (total - open) / total,
    tone: open > 0 ? 'attention' : 'success',
  };
  const pending = d.pendingReviews ?? 0;
  const fourth: Segment = conflicts
    ? { key: 'conflicts', label: 'Conflicts', value: 'blocking', fill: 1, tone: 'danger' }
    : {
        key: 'approvals',
        label: 'Approvals',
        value: `${approvals}${pending > 0 ? ` · ${pending} pending` : ''}`,
        fill: approved ? 1 : 0,
        tone: d.reviewDecision === 'CHANGES_REQUESTED' ? 'danger' : approved ? 'success' : 'none',
      };
  const segments = [checks, threads, fourth];

  const checksText = b.total === 0 ? 'No checks' : b.failing > 0 ? plural(b.failing, 'check failing', 'checks failing') : b.pending > 0 ? plural(b.pending, 'check running', 'checks running') : 'All checks pass';
  const threadsText = open === 0 ? 'no open threads' : plural(open, 'open thread', 'open threads');

  let verdict: Verdict;
  let openFirst: SegmentKey | undefined;
  if (conflicts) {
    verdict = { tone: 'danger', glyph: 'x', headline: 'This branch has conflicts', sub: 'Resolve them with Orca or on GitHub, then refresh.' };
    openFirst = 'conflicts';
  } else if (b.failing + b.cancelled > 0) {
    const n = b.failing + b.cancelled;
    const names = failingNames.slice(0, 2).join(' · ');
    verdict = { tone: 'danger', glyph: 'x', headline: plural(n, 'check failing', 'checks failing'), sub: names ? `${names}. Fix before merging.` : 'Fix before merging.' };
    openFirst = 'checks';
  } else if (d.reviewDecision === 'CHANGES_REQUESTED') {
    const n = Math.max(d.changeRequests ?? 0, 1);
    verdict = { tone: 'attention', glyph: 'alert', headline: 'Changes requested', sub: `${plural(n, 'reviewer asked', 'reviewers asked')} for changes · ${threadsText}` };
  } else if (b.pending > 0) {
    verdict = { tone: 'neutral', glyph: 'clock', headline: plural(b.pending, 'check running', 'checks running'), sub: `${passed} of ${b.total} done · ${threadsText}` };
  } else if (approved) {
    verdict = { tone: 'success', glyph: 'check', headline: 'Ready to merge', sub: `${checksText} · ${plural(Math.max(approvals, 1), 'approval', 'approvals')}` };
  } else {
    verdict = {
      tone: 'neutral',
      glyph: 'ring',
      headline: own ? 'Waiting for review' : 'Needs your review',
      sub: `${checksText} · ${threadsText} · ${approvals === 0 ? 'no approvals yet' : plural(approvals, 'approval', 'approvals')}`,
    };
  }
  return { verdict, segments, ...(openFirst ? { openFirst } : {}) };
}
