import type { PrSummary, Section, SectionKey } from '../shared/types';
import type { InboxView } from './useInbox';
import { formatClock, type ClockFormat } from './time-format';
import { exactFirst, matchesQuery } from '../shared/number-query';

export interface ResetLabel {
  /** Local clock time, e.g. "3:41 PM" or "15:41". */
  at: string;
  /** Time left: "12m", "<1m", or "now" once passed. */
  left: string;
}

/** Formats a rate-limit resetAt for the top bar. */
export function formatReset(resetAt: string, now: number, format: ClockFormat = 'system'): ResetLabel {
  const t = new Date(resetAt);
  const at = formatClock(t, format);
  const ms = t.getTime() - now;
  if (ms <= 0) return { at, left: 'now' };
  if (ms < 60_000) return { at, left: '<1m' };
  return { at, left: `${Math.ceil(ms / 60_000)}m` };
}

/** Repo, author or title text, or the PR number. Exact number matches come first. */
export function filterPrs<T extends PrSummary>(prs: readonly T[], filter: string): T[] {
  const hits = prs.filter((p) => matchesQuery(p, filter, `${p.repo} ${p.author} ${p.title}`));
  return exactFirst(hits, filter);
}

export interface VisibleSection {
  section: Section;
  prs: PrSummary[];
  open: boolean;
}

export function visibleSections(
  data: InboxView | undefined,
  filter: string,
  collapsed: ReadonlySet<SectionKey>,
): VisibleSection[] {
  if (!data) return [];
  return data.sections.map((section) => ({
    section,
    prs: filterPrs(section.prs, filter),
    open: !collapsed.has(section.key),
  }));
}

/** PRs in the order j / k walks them: open sections only. */
export function walkOrder(sections: VisibleSection[]): PrSummary[] {
  return sections.filter((s) => s.open).flatMap((s) => s.prs);
}

export function allPrs(data: InboxView | undefined): PrSummary[] {
  return data ? data.sections.flatMap((s) => s.prs) : [];
}

export const DEFAULT_COLLAPSED: SectionKey[] = ['org'];
