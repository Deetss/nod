import type { DiffLine } from '../shared/types';

/** A changed stretch of one line, as `[start, end)` character offsets. */
export type Range = readonly [number, number];

/** A line pair is word-diffed only when at least this share of its characters is unchanged. */
const MIN_SAME = 0.5;
/** Longer lines skip the word diff; the token LCS is quadratic. */
const MAX_TOKENS = 400;

const TOKEN_RE = /\w+|\s+|[^\w\s]/g;

const tokens = (s: string): string[] => s.match(TOKEN_RE) ?? [];

/** Token indexes of each side that are not in the longest common subsequence. */
function changedTokens(a: readonly string[], b: readonly string[]): [Set<number>, Set<number>] {
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const keepA = new Set<number>();
  const keepB = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keepA.add(i);
      keepB.add(j);
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i += 1;
    else j += 1;
  }
  const drop = (len: number, keep: Set<number>) => new Set([...Array(len).keys()].filter((k) => !keep.has(k)));
  return [drop(n, keepA), drop(m, keepB)];
}

/** Character ranges of the changed tokens, with neighbours merged. */
function rangesOf(toks: readonly string[], changed: Set<number>): Range[] {
  const out: [number, number][] = [];
  let at = 0;
  toks.forEach((t, k) => {
    const end = at + t.length;
    if (changed.has(k)) {
      const last = out[out.length - 1];
      if (last && last[1] === at) last[1] = end;
      else out.push([at, end]);
    }
    at = end;
  });
  return out;
}

/** Drops whitespace at the ends of each range, and ranges that are only whitespace. */
function trimmed(text: string, ranges: readonly Range[]): Range[] {
  const out: Range[] = [];
  for (const [s0, e0] of ranges) {
    let s = s0;
    let e = e0;
    while (s < e && /\s/.test(text[s]!)) s += 1;
    while (e > s && /\s/.test(text[e - 1]!)) e -= 1;
    if (e > s) out.push([s, e]);
  }
  return out;
}

/**
 * Word-level changes between an old and a new version of one line. Undefined when most of the
 * line changed, so a rewritten line keeps plain line colouring.
 */
export function wordDiff(oldText: string, newText: string): [Range[], Range[]] | undefined {
  const a = tokens(oldText);
  const b = tokens(newText);
  if (a.length === 0 || b.length === 0 || a.length > MAX_TOKENS || b.length > MAX_TOKENS) return undefined;
  const [ca, cb] = changedTokens(a, b);
  if (ca.size === 0 && cb.size === 0) return undefined;
  const changedChars = (toks: readonly string[], c: Set<number>) => [...c].reduce((sum, k) => sum + toks[k]!.length, 0);
  const longer = Math.max(oldText.length, newText.length);
  const same = longer - Math.max(changedChars(a, ca), changedChars(b, cb));
  if (same / longer < MIN_SAME) return undefined;
  return [trimmed(oldText, rangesOf(a, ca)), trimmed(newText, rangesOf(b, cb))];
}

/**
 * Word marks for each line of a hunk. A run of deleted lines followed by a run of added lines is
 * paired line by line; unpaired and context lines get none.
 */
export function hunkMarks(lines: readonly DiffLine[]): (Range[] | undefined)[] {
  const marks: (Range[] | undefined)[] = lines.map(() => undefined);
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.kind !== 'del') {
      i += 1;
      continue;
    }
    const delStart = i;
    while (i < lines.length && lines[i]!.kind === 'del') i += 1;
    const addStart = i;
    while (i < lines.length && lines[i]!.kind === 'add') i += 1;
    const pairs = Math.min(addStart - delStart, i - addStart);
    for (let k = 0; k < pairs; k += 1) {
      const d = wordDiff(lines[delStart + k]!.text, lines[addStart + k]!.text);
      if (!d) continue;
      marks[delStart + k] = d[0];
      marks[addStart + k] = d[1];
    }
  }
  return marks;
}

/** Splits highlight tokens at range edges and flags the parts inside a range. */
export function markTokens<T extends { text: string }>(toks: readonly T[], ranges: readonly Range[] | undefined): (T & { word?: boolean })[] {
  if (!ranges || ranges.length === 0) return [...toks];
  const out: (T & { word?: boolean })[] = [];
  let at = 0;
  for (const t of toks) {
    const end = at + t.text.length;
    const cuts = new Set([at, end]);
    for (const [s, e] of ranges) {
      if (s > at && s < end) cuts.add(s);
      if (e > at && e < end) cuts.add(e);
    }
    const edges = [...cuts].sort((x, y) => x - y);
    for (let k = 0; k < edges.length - 1; k += 1) {
      const s = edges[k]!;
      const e = edges[k + 1]!;
      const word = ranges.some(([rs, re]) => s >= rs && e <= re);
      out.push({ ...t, text: t.text.slice(s - at, e - at), ...(word ? { word: true } : {}) });
    }
    at = end;
  }
  return out;
}
