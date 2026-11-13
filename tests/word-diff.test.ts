import { describe, expect, it } from 'vitest';
import type { DiffLine } from '../shared/types';
import { highlight } from '../web/highlight';
import { hunkMarks, markTokens, wordDiff } from '../web/word-diff';

const OLD = 'The State Management section of [`CLAUDE.md`](CLAUDE.md) has the canonical pattern and reference';
const NEW = 'The State Management section of [`AGENTS.md`](AGENTS.md) has the canonical pattern and reference';

const slice = (s: string, ranges: readonly (readonly [number, number])[]) => ranges.map(([a, b]) => s.slice(a, b));

describe('wordDiff', () => {
  it('marks only the changed words when most of the line stays the same', () => {
    const d = wordDiff(OLD, NEW);
    expect(d).toBeDefined();
    expect(slice(OLD, d![0])).toEqual(['CLAUDE', 'CLAUDE']);
    expect(slice(NEW, d![1])).toEqual(['AGENTS', 'AGENTS']);
  });

  it('merges neighbouring changed tokens and keeps an unchanged separator out', () => {
    expect(slice('const value = baz-qux;', wordDiff('const value = foo_bar;', 'const value = baz-qux;')![1])).toEqual(['baz-qux']);
    expect(slice('const a = baz.qux(1);', wordDiff('const a = foo.bar(1);', 'const a = baz.qux(1);')![1])).toEqual(['baz', 'qux']);
  });

  it('keeps the spaces around a change out of the mark', () => {
    const d = wordDiff('description: Returns all sale fields', 'description: Returns sale fields allowed by token scope')!;
    expect(slice('description: Returns all sale fields', d[0])).toEqual(['all']);
    expect(slice('description: Returns sale fields allowed by token scope', d[1])).toEqual(['allowed by token scope']);
  });

  it('leaves a mostly rewritten line unmarked', () => {
    expect(wordDiff('return render(view, props);', 'throw new Error("nope");')).toBeUndefined();
  });

  it('leaves identical and empty lines unmarked', () => {
    expect(wordDiff(OLD, OLD)).toBeUndefined();
    expect(wordDiff('', 'x')).toBeUndefined();
  });
});

describe('hunkMarks', () => {
  const line = (kind: DiffLine['kind'], text: string): DiffLine => ({ kind, text });

  it('pairs a run of deletions with the run of additions after it, line by line', () => {
    const lines = [
      line('ctx', 'a'),
      line('del', 'let x = 1;'),
      line('del', 'let y = 2;'),
      line('add', 'let x = 10;'),
      line('add', 'let y = 20;'),
      line('add', 'let z = 3;'),
      line('ctx', 'b'),
    ];
    const m = hunkMarks(lines);
    expect(m[0]).toBeUndefined();
    expect(slice('let x = 1;', m[1]!)).toEqual(['1']);
    expect(slice('let x = 10;', m[3]!)).toEqual(['10']);
    expect(slice('let y = 20;', m[4]!)).toEqual(['20']);
    expect(m[5]).toBeUndefined();
    expect(m[6]).toBeUndefined();
  });

  it('never marks an addition with no deletion before it', () => {
    expect(hunkMarks([line('add', 'new'), line('del', 'old')])).toEqual([undefined, undefined]);
  });
});

describe('markTokens', () => {
  it('splits highlight tokens at range edges and keeps the full text', () => {
    const d = wordDiff(OLD, NEW)!;
    const out = markTokens(highlight(NEW, false), d[1]);
    expect(out.map((t) => t.text).join('')).toBe(NEW);
    expect(out.filter((t) => t.word).map((t) => t.text)).toEqual(['AGENTS', 'AGENTS']);
  });

  it('returns the tokens unchanged without ranges', () => {
    const toks = highlight(NEW, false);
    expect(markTokens(toks, undefined)).toEqual(toks);
  });
});
