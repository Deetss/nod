import type { DiffLine, Hunk } from './types';

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parse a unified-diff patch (GitHub "patch" field) into hunks. */
export function parsePatch(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | undefined;
  let o = 0;
  let n = 0;
  for (const raw of patch.split('\n')) {
    const m = HUNK_RE.exec(raw);
    if (m) {
      cur = { header: raw, lines: [] };
      hunks.push(cur);
      o = Number(m[1]);
      n = Number(m[2]);
      continue;
    }
    if (!cur || raw.startsWith('\\')) continue;
    const mark = raw[0];
    const text = raw.slice(1);
    const line: DiffLine =
      mark === '+'
        ? { kind: 'add', newNo: n++, text }
        : mark === '-'
          ? { kind: 'del', oldNo: o++, text }
          : { kind: 'ctx', oldNo: o++, newNo: n++, text };
    if (mark === '+' || mark === '-' || mark === ' ') cur.lines.push(line);
  }
  return hunks;
}
