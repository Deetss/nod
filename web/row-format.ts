import { repoLabel } from './repo-label';

/** Label chips a list row shows before collapsing the rest into `+N`. */
export const CHIPS_MAX = 3;

/** Phone rows are narrow, so they show fewer label chips than the desktop rule. */
export const PHONE_CHIPS_MAX = { comfortable: 2, compact: 1 } as const;

export interface ChipSplit<T> {
  shown: T[];
  /** Labels hidden behind the `+N` chip; 0 means no chip. */
  extra: number;
}

export function splitChips<T>(labels: readonly T[], max = CHIPS_MAX): ChipSplit<T> {
  return { shown: labels.slice(0, max), extra: Math.max(0, labels.length - max) };
}

export interface MetaParts {
  repo: string;
  number: number;
  author: string;
  /** Short age such as `2h`. */
  age: string;
  /** PR rows only. */
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

const num = (n: number): string => n.toLocaleString('en-US');

/** The one muted row line: `acme-api #412 · acme-dev · 2h`, plus `· +42 -8 · 4 files` for PRs. */
export function formatMeta(m: MetaParts): string {
  const parts = [`${repoLabel(m.repo)} #${m.number}`, m.author, m.age];
  if (m.additions !== undefined && m.deletions !== undefined) {
    parts.push(`+${num(m.additions)} -${num(m.deletions)}`);
  }
  if (m.changedFiles !== undefined) {
    parts.push(`${m.changedFiles} file${m.changedFiles === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}
