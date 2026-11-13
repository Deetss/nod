import { describe, expect, it } from 'vitest';
import { composerKey, fileTargets, lineTarget, stepCursor } from '../web/inline/line-target';

describe('line target: side from the row kind', () => {
  it('puts a removed line on the LEFT side at its old number', () => {
    expect(lineTarget({ kind: 'del', oldNo: 12, text: 'x' })).toEqual({ side: 'LEFT', line: 12 });
  });

  it('puts an added line on the RIGHT side at its new number', () => {
    expect(lineTarget({ kind: 'add', newNo: 40, text: 'x' })).toEqual({ side: 'RIGHT', line: 40 });
  });

  it('puts a context line on the RIGHT side at its new number', () => {
    expect(lineTarget({ kind: 'ctx', oldNo: 7, newNo: 9, text: 'x' })).toEqual({ side: 'RIGHT', line: 9 });
  });

  it('returns undefined when the number for that side is missing', () => {
    expect(lineTarget({ kind: 'del', newNo: 3, text: 'x' })).toBeUndefined();
    expect(lineTarget({ kind: 'add', oldNo: 3, text: 'x' })).toBeUndefined();
  });
});

describe('line target: file rows and cursor stepping', () => {
  const hunks = [
    {
      header: '@@',
      lines: [
        { kind: 'ctx' as const, oldNo: 1, newNo: 1, text: 'a' },
        { kind: 'del' as const, oldNo: 2, text: 'b' },
        { kind: 'add' as const, newNo: 2, text: 'c' },
      ],
    },
  ];

  it('lists the commentable rows in diff order', () => {
    expect(fileTargets(hunks)).toEqual([
      { side: 'RIGHT', line: 1 },
      { side: 'LEFT', line: 2 },
      { side: 'RIGHT', line: 2 },
    ]);
  });

  it('steps down and up without wrapping', () => {
    const rows = fileTargets(hunks);
    expect(stepCursor(rows, undefined, 1)).toEqual({ side: 'RIGHT', line: 1 });
    expect(stepCursor(rows, rows[0], 1)).toEqual({ side: 'LEFT', line: 2 });
    expect(stepCursor(rows, rows[2], 1)).toEqual({ side: 'RIGHT', line: 2 });
    expect(stepCursor(rows, rows[0], -1)).toEqual({ side: 'RIGHT', line: 1 });
  });

  it('keeps a range on one side when asked', () => {
    const rows = fileTargets(hunks);
    expect(stepCursor(rows, { side: 'RIGHT', line: 1 }, 1, 'RIGHT')).toEqual({ side: 'RIGHT', line: 2 });
  });
});

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods,
});

describe('composer keys', () => {
  it('Ctrl+Enter posts', () => {
    expect(composerKey(key('Enter', { ctrlKey: true }))).toBe('post');
  });

  it('Cmd+Enter posts too', () => {
    expect(composerKey(key('Enter', { metaKey: true }))).toBe('post');
  });

  it('Ctrl+Shift+Enter adds a draft', () => {
    expect(composerKey(key('Enter', { ctrlKey: true, shiftKey: true }))).toBe('draft');
  });

  it('Esc closes', () => {
    expect(composerKey(key('Escape'))).toBe('close');
  });

  it('a bare Enter in the text is left alone', () => {
    expect(composerKey(key('Enter'))).toBeUndefined();
  });

  it('other keys are left alone', () => {
    expect(composerKey(key('a'))).toBeUndefined();
  });
});
