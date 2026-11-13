// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CHIPS_MAX, formatMeta, splitChips } from '../web/row-format';

describe('splitChips', () => {
  it('shows every label up to the maximum with no +N', () => {
    expect(splitChips(['a', 'b', 'c'])).toEqual({ shown: ['a', 'b', 'c'], extra: 0 });
    expect(splitChips([])).toEqual({ shown: [], extra: 0 });
  });

  it('keeps three chips and counts the rest for six labels', () => {
    const r = splitChips(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(CHIPS_MAX).toBe(3);
    expect(r.shown).toEqual(['a', 'b', 'c']);
    expect(r.extra).toBe(3);
  });

  it('counts a single overflow label', () => {
    expect(splitChips(['a', 'b', 'c', 'd']).extra).toBe(1);
  });
});

describe('formatMeta', () => {
  it('joins repo number, author and age for an issue', () => {
    expect(formatMeta({ repo: 'acme-api', number: 412, author: 'acme-dev', age: '2h' })).toBe(
      'acme-api #412 · acme-dev · 2h',
    );
  });

  it('appends diff size and files for a PR', () => {
    expect(
      formatMeta({ repo: 'acme-api', number: 412, author: 'acme-dev', age: '2h', additions: 42, deletions: 8, changedFiles: 4 }),
    ).toBe('acme-api #412 · acme-dev · 2h · +42 -8 · 4 files');
  });

  it('singularizes one file and groups thousands', () => {
    expect(
      formatMeta({ repo: 'r', number: 1, author: 'a', age: '1m', additions: 1200, deletions: 0, changedFiles: 1 }),
    ).toBe('r #1 · a · 1m · +1,200 -0 · 1 file');
  });
});
