import { COLLAPSE_PX } from './phone-logic';

/** Filter set per list tab. Empty is today's `All`. */
export type FilterSet = ReadonlySet<string>;

export function toggleFilter(set: FilterSet, key: string): FilterSet {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

/** A section shows when nothing is ticked or it is ticked. */
export function sectionShown(set: FilterSet, key: string): boolean {
  return set.size === 0 || set.has(key);
}

/** Badge text on the filter button, or undefined with no filters on. */
export function filterBadge(on: number): string | undefined {
  if (on <= 0) return undefined;
  return on > 9 ? '9+' : String(on);
}

export function filterButtonLabel(on: number): string {
  return on > 0 ? `Filters, ${on} on` : 'Filters';
}

export function filterCountText(on: number): string {
  return `${on} filter${on === 1 ? '' : 's'}`;
}

export function doneText(on: number): string {
  return on > 0 ? `Done · ${filterCountText(on)}` : 'Done';
}

/** `6 results for “webhook”`, with the ticked filter labels after a dot. */
export function resultsLine(count: number, query: string, filterLabels: readonly string[]): string {
  const q = `“${query.trim()}”`;
  const head = count === 0 ? `No results for ${q}` : `${count} result${count === 1 ? '' : 's'} for ${q}`;
  return filterLabels.length > 0 ? `${head} · ${filterLabels.join(', ')}` : head;
}

/** Each item once, in section order. */
export function flatResults<T extends { id: string }>(sections: readonly { items: readonly T[] }[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of sections) {
    for (const item of s.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** Distinct items across the shown sections, for the list status. */
export function shownTotal(sections: readonly { items: readonly { id: string }[] }[]): number {
  return flatResults(sections).length;
}

export const BAR_HIDE_PX = 24;
export const BAR_SHOW_PX = 8;

export interface BarScroll {
  hidden: boolean;
  /** Scroll position where the current direction began. */
  anchor: number;
  last: number;
}

export const BAR_SHOWN: BarScroll = { hidden: false, anchor: 0, last: 0 };

/**
 * One scroll step of the bottom bar. It hides after 24px down in one direction past the header
 * collapse, and shows again on 8px up or back inside the collapse range.
 */
export function barStep(s: BarScroll, top: number): BarScroll {
  if (top <= COLLAPSE_PX) return { hidden: false, anchor: top, last: top };
  if (top === s.last) return s;
  const down = top > s.last;
  const wasDown = s.last >= s.anchor;
  const anchor = down === wasDown ? s.anchor : s.last;
  let hidden = s.hidden;
  if (down && top - anchor >= BAR_HIDE_PX) hidden = true;
  if (!down && anchor - top >= BAR_SHOW_PX) hidden = false;
  return { hidden, anchor, last: top };
}
