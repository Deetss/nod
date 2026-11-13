import { describe, expect, it } from 'vitest';
import { goToFile, headerScrollTop, makeSequence, resolveTarget, type NavAdapter } from '../web/goto-file';
import { revealFile } from '../web/tree-state';
import type { FileItem } from '../shared/types';

const paths = Array.from({ length: 22 }, (_, i) => `src/dir${i % 3}/file${i}.ts`);
const p = (i: number): string => paths[i] as string;

/** Fake DOM: records the ordered calls and lets a test hold the render gate. */
function fake(opts: { collapsed?: string[]; missing?: string[]; gate?: Promise<void> } = {}) {
  const log: string[] = [];
  const collapsed = new Set(opts.collapsed ?? []);
  const a: NavAdapter = {
    isExpanded: (p) => !collapsed.has(p),
    expand: (p) => {
      collapsed.delete(p);
      log.push(`expand ${p}`);
    },
    whenRendered: async (p) => {
      await opts.gate;
      log.push(`rendered ${p}`);
      return !(opts.missing ?? []).includes(p);
    },
    nextFrame: async () => {
      log.push('frame');
    },
    scrollToHeader: (p) => log.push(`scroll ${p}`),
    markCurrent: (p) => log.push(`current ${p}`),
    flash: (p) => log.push(`flash ${p}`),
  };
  return { a, log };
}

describe('resolveTarget', () => {
  it('finds a file by path and ignores order', () => {
    const files = paths.map((path) => ({ path }));
    expect(resolveTarget(files, p(21))).toBe(p(21));
    expect(resolveTarget([...files].reverse(), p(0))).toBe(p(0));
    expect(resolveTarget(files, 'nope')).toBeUndefined();
  });
});

describe('goToFile', () => {
  it('scrolls to the first file after layout settles', async () => {
    const { a, log } = fake();
    expect(await goToFile(a, makeSequence(), p(0))).toBe(true);
    expect(log).toEqual([
      `current ${p(0)}`,
      `rendered ${p(0)}`,
      'frame',
      'frame',
      `scroll ${p(0)}`,
      `flash ${p(0)}`,
    ]);
  });

  it('scrolls to the last of 22 files', async () => {
    const { a, log } = fake();
    await goToFile(a, makeSequence(), p(21));
    expect(log).toContain(`scroll ${p(21)}`);
  });

  it('works for a file above the current position, since it uses the path', async () => {
    const { a, log } = fake();
    const seq = makeSequence();
    await goToFile(a, seq, p(20));
    await goToFile(a, seq, p(2));
    expect(log.filter((l) => l.startsWith('scroll '))).toEqual([`scroll ${p(20)}`, `scroll ${p(2)}`]);
    expect(headerScrollTop(900, -300, 40)).toBe(560);
  });

  it('expands a viewed collapsed file before waiting and scrolling', async () => {
    const { a, log } = fake({ collapsed: [p(5)] });
    await goToFile(a, makeSequence(), p(5));
    expect(log).toEqual([
      `current ${p(5)}`,
      `expand ${p(5)}`,
      `rendered ${p(5)}`,
      'frame',
      'frame',
      `scroll ${p(5)}`,
      `flash ${p(5)}`,
    ]);
  });

  it('does not scroll for a file that is not in the diff', async () => {
    const { a, log } = fake({ missing: [p(1)] });
    expect(await goToFile(a, makeSequence(), p(1))).toBe(false);
    expect(log.some((l) => l.startsWith('scroll'))).toBe(false);
  });

  it('lets only the last of two rapid clicks scroll', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const { a, log } = fake({ gate });
    const seq = makeSequence();
    const first = goToFile(a, seq, p(3));
    const second = goToFile(a, seq, p(9));
    open();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(log.filter((l) => l.startsWith('scroll '))).toEqual([`scroll ${p(9)}`]);
    expect(log.filter((l) => l.startsWith('flash '))).toEqual([`flash ${p(9)}`]);
  });
});

describe('revealFile', () => {
  const f = (path: string, viewed: boolean): FileItem => ({
    path,
    additions: 1,
    deletions: 0,
    viewed,
    changedSinceReview: false,
  });
  const files = [f('a/x.ts', true), f('a/y.ts', true), f('b/z.ts', false)];

  it('opens the collapsed folder holding the file', () => {
    expect(revealFile(files, 'a/x.ts', {})).toEqual({ 'a/': 'open' });
  });
  it('leaves an open folder alone', () => {
    const o = {};
    expect(revealFile(files, 'b/z.ts', o)).toBe(o);
  });
  it('opens a folder the user closed', () => {
    expect(revealFile(files, 'b/z.ts', { 'b/': 'closed' })).toEqual({ 'b/': 'open' });
  });
});
