import { isConflicting } from '../../shared/conflicts';
import type { PrefillFacts } from '../../shared/orca-message';
import type { PrDetail } from '../../shared/types';

/** Counts, names and refs for the Send message prefills. Never comment or PR body text. */
export function prefillFactsOf(d: PrDetail): PrefillFacts {
  const thread = d.thread ?? [];
  const reviews = thread.filter((t) => t.kind === 'review' && t.verdict === 'changes');
  const latest = reviews.at(-1);
  const failing = d.checks.filter((c) => c.status === 'fail').map((c) => c.name);
  return {
    repo: d.summary.repo,
    number: d.summary.number,
    headRef: d.headRef,
    baseRef: d.baseRef,
    conflicting: d.isOpen !== false && isConflicting(d),
    ci: d.summary.ci,
    failing,
    checkTotal: d.checks.length,
    changesBy: latest?.kind === 'review' ? latest.actor : undefined,
    changesRequested: d.reviewDecision === 'CHANGES_REQUESTED' || (d.changeRequests ?? 0) > 0,
    openThreads: thread.filter((t) => t.kind === 'thread' && !t.resolved).length,
  };
}
