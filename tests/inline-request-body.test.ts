import { describe, expect, it } from 'vitest';
import { commentRequestBody } from '../web/inline/request-body';
import type { ComposerTarget } from '../web/inline/composer-state';

const line: ComposerTarget = { subject: 'line', path: 'src/a.ts', side: 'RIGHT', anchor: 40, line: 40 };

describe('commentRequestBody', () => {
  it('builds a single line body with line and side only', () => {
    expect(commentRequestBody(line, '  Needs a guard  ')).toEqual({
      body: 'Needs a guard',
      path: 'src/a.ts',
      subjectType: 'line',
      line: 40,
      side: 'RIGHT',
    });
  });

  it('builds a range body with startLine and startSide on the same side', () => {
    const range: ComposerTarget = { ...line, anchor: 40, line: 42, startLine: 40 };
    expect(commentRequestBody(range, 'Across these')).toEqual({
      body: 'Across these',
      path: 'src/a.ts',
      subjectType: 'line',
      line: 42,
      side: 'RIGHT',
      startLine: 40,
      startSide: 'RIGHT',
    });
  });

  it('keeps the LEFT side for a deleted line', () => {
    const left: ComposerTarget = { ...line, side: 'LEFT', anchor: 9, line: 9 };
    expect(commentRequestBody(left, 'gone')).toMatchObject({ side: 'LEFT' });
    expect(commentRequestBody(left, 'gone')).not.toHaveProperty('startLine');
  });

  it('builds a file body with no line fields', () => {
    const file: ComposerTarget = { subject: 'file', path: 'src/a.ts' };
    const body = commentRequestBody(file, 'About the file');
    expect(body).toEqual({ body: 'About the file', path: 'src/a.ts', subjectType: 'file' });
    expect(body).not.toHaveProperty('line');
    expect(body).not.toHaveProperty('side');
    expect(body).not.toHaveProperty('startLine');
    expect(body).not.toHaveProperty('startSide');
  });

  it('returns undefined for blank text, for a line and a file target', () => {
    expect(commentRequestBody(line, '   ')).toBeUndefined();
    expect(commentRequestBody({ subject: 'file', path: 'x' }, '')).toBeUndefined();
  });

  it('refuses a range that starts after its last line', () => {
    expect(() => commentRequestBody({ ...line, anchor: 42, line: 40, startLine: 42 }, 'x')).toThrow(
      'A range starts after its last line',
    );
  });

  it('sends no head or commit field', () => {
    const body = commentRequestBody(line, 'x') as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['body', 'line', 'path', 'side', 'subjectType']);
  });
});
