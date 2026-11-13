import { describe, expect, it } from 'vitest';
import type { PrThreadItem } from '../shared/types';
import { groupThreads, threadLines } from '../web/inline/group-threads';

function thread(over: Partial<Extract<PrThreadItem, { kind: 'thread' }>>): PrThreadItem {
  return {
    kind: 'thread',
    at: '2026-11-10T10:00:00Z',
    id: over.id ?? 't',
    path: 'src/a.ts',
    resolved: false,
    comments: [],
    ...over,
  };
}

describe('groupThreads', () => {
  const items: PrThreadItem[] = [
    thread({ id: 'late', line: 40, side: 'RIGHT', at: '2026-11-10T12:00:00Z' }),
    thread({ id: 'early', line: 40, side: 'RIGHT', at: '2026-11-10T09:00:00Z' }),
    thread({ id: 'left', line: 40, side: 'LEFT', at: '2026-11-10T08:00:00Z' }),
    thread({ id: 'top', line: 3, side: 'RIGHT' }),
    thread({ id: 'filelvl', path: 'src/a.ts' }),
    thread({ id: 'other', path: 'docs/b.md', line: 1, side: 'RIGHT' }),
    thread({ id: 'draft', line: 7, side: 'RIGHT', pending: true, isOutdated: true, resolved: true }),
  ];

  it('groups by file path, sorted by path', () => {
    expect(groupThreads(items).map((f) => f.path)).toEqual(['docs/b.md', 'src/a.ts']);
  });

  it('places file-level threads apart from the line threads', () => {
    const a = groupThreads(items).find((f) => f.path === 'src/a.ts');
    expect(a?.fileLevel.map((g) => g.thread.id)).toEqual(['filelvl']);
    expect(a?.lines.flatMap((l) => l.threads.map((g) => g.thread.id))).not.toContain('filelvl');
  });

  it('orders lines by number, then LEFT before RIGHT on the same line', () => {
    const a = groupThreads(items).find((f) => f.path === 'src/a.ts');
    expect(a?.lines.map((l) => [l.line, l.side])).toEqual([
      [3, 'RIGHT'],
      [7, 'RIGHT'],
      [40, 'LEFT'],
      [40, 'RIGHT'],
    ]);
  });

  it('orders the threads on one line by time, oldest first', () => {
    const a = groupThreads(items).find((f) => f.path === 'src/a.ts');
    const right40 = a?.lines.find((l) => l.line === 40 && l.side === 'RIGHT');
    expect(right40?.threads.map((g) => g.thread.id)).toEqual(['early', 'late']);
  });

  it('marks drafts and keeps resolved and outdated flags', () => {
    const a = groupThreads(items).find((f) => f.path === 'src/a.ts');
    const draft = a?.lines.find((l) => l.line === 7)?.threads[0];
    expect(draft).toMatchObject({ draft: true, resolved: true, outdated: true });
    const plain = a?.lines.find((l) => l.line === 3)?.threads[0];
    expect(plain).toMatchObject({ draft: false, resolved: false, outdated: false });
  });

  it('reads a thread with no side as RIGHT', () => {
    const [f] = groupThreads([thread({ id: 'old', line: 5 })]);
    expect(f?.lines[0]).toMatchObject({ line: 5, side: 'RIGHT' });
  });

  it('keeps the thread object on each group', () => {
    const [f] = groupThreads([thread({ id: 'x', line: 2, side: 'RIGHT' })]);
    expect(f?.lines[0]?.threads[0]?.thread.id).toBe('x');
  });

  it('skips non-thread items and handles no threads', () => {
    expect(groupThreads(undefined)).toEqual([]);
    expect(groupThreads([])).toEqual([]);
    const review: PrThreadItem = { kind: 'review', at: 'x', id: 'r', actor: 'a', verdict: 'commented', bodyHtml: '' };
    expect(groupThreads([review])).toEqual([]);
  });
});

describe('threadLines', () => {
  const files = groupThreads([
    thread({ id: 'a', line: 3, side: 'RIGHT' }),
    thread({ id: 'b', line: 9, side: 'LEFT' }),
    thread({ id: 'c', path: 'src/a.ts' }),
  ]);

  it('returns the lines with threads for a file', () => {
    expect([...threadLines(files, 'src/a.ts')].sort((x, y) => x - y)).toEqual([3, 9]);
  });

  it('returns an empty set for a file with no line threads', () => {
    expect(threadLines(files, 'nope.ts').size).toBe(0);
  });
});
