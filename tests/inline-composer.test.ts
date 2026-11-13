import { describe, expect, it } from 'vitest';
import {
  composerReducer,
  initialComposer,
  primaryLabel,
  secondaryLabel,
  targetKey,
  type ComposerState,
} from '../web/inline/composer-state';

const line = { subject: 'line' as const, path: 'src/a.ts', side: 'RIGHT' as const, line: 40 };
const other = { subject: 'line' as const, path: 'src/a.ts', side: 'RIGHT' as const, line: 12 };
const file = { subject: 'file' as const, path: 'src/a.ts' };

function run(state: ComposerState, ...actions: Parameters<typeof composerReducer>[1][]) {
  return actions.reduce(composerReducer, state);
}

describe('composer reducer: open and close', () => {
  it('starts closed with no draft', () => {
    expect(initialComposer).toEqual({ status: 'closed', text: '', drafts: {} });
  });

  it('opens a line target as a single line with no start', () => {
    const s = composerReducer(initialComposer, { type: 'open', target: line });
    expect(s.status).toBe('open');
    expect(s.target).toEqual({ subject: 'line', path: 'src/a.ts', side: 'RIGHT', anchor: 40, line: 40 });
    expect(s.target && 'startLine' in s.target).toBe(false);
  });

  it('opens a file target', () => {
    const s = composerReducer(initialComposer, { type: 'open', target: file });
    expect(s).toEqual({ status: 'open', target: file, text: '', drafts: {} });
  });

  it('keeps the draft text when the composer is closed and reopens it on the same target', () => {
    const s = run(
      initialComposer,
      { type: 'open', target: line },
      { type: 'edit', text: 'Needs a guard' },
      { type: 'close' },
    );
    expect(s.status).toBe('closed');
    expect(s.target).toBeUndefined();
    expect(s.drafts[targetKey(s.target ?? { ...line, anchor: 40, line: 40 })]).toBe('Needs a guard');
    const reopened = composerReducer(s, { type: 'open', target: line });
    expect(reopened.text).toBe('Needs a guard');
  });

  it('keeps a draft per target when switching between targets', () => {
    const s = run(
      initialComposer,
      { type: 'open', target: line },
      { type: 'edit', text: 'on forty' },
      { type: 'open', target: other },
      { type: 'edit', text: 'on twelve' },
      { type: 'open', target: line },
    );
    expect(s.text).toBe('on forty');
    expect(s.status).toBe('open');
  });

  it('drops a blank draft on close', () => {
    const s = run(initialComposer, { type: 'open', target: line }, { type: 'edit', text: '   ' }, { type: 'close' });
    expect(s.drafts).toEqual({});
  });

  it('opening the target already shown changes nothing', () => {
    const open = composerReducer(initialComposer, { type: 'open', target: line });
    const edited = composerReducer(open, { type: 'edit', text: 'x' });
    expect(composerReducer(edited, { type: 'open', target: line })).toBe(edited);
  });

  it('ignores close while closed', () => {
    expect(composerReducer(initialComposer, { type: 'close' })).toBe(initialComposer);
  });
});

describe('composer reducer: range', () => {
  it('extends a range down from the anchor', () => {
    const s = run(initialComposer, { type: 'open', target: line }, { type: 'extend', line: 42 });
    expect(s.target).toMatchObject({ anchor: 40, line: 42, startLine: 40 });
  });

  it('extends a range up, keeping startLine not after line', () => {
    const s = run(initialComposer, { type: 'open', target: line }, { type: 'extend', line: 38 });
    expect(s.target).toMatchObject({ line: 40, startLine: 38 });
  });

  it('collapses back to a single line when extended to the anchor', () => {
    const s = run(
      initialComposer,
      { type: 'open', target: line },
      { type: 'extend', line: 42 },
      { type: 'extend', line: 40 },
    );
    expect(s.target && 'startLine' in s.target).toBe(false);
    expect(s.target).toMatchObject({ line: 40 });
  });

  it('ignores extend on a file target', () => {
    const open = composerReducer(initialComposer, { type: 'open', target: file });
    expect(composerReducer(open, { type: 'extend', line: 4 })).toBe(open);
  });

  it('gives a range its own draft key', () => {
    expect(targetKey({ ...line, anchor: 40, line: 42, startLine: 40 })).not.toBe(
      targetKey({ ...line, anchor: 40, line: 40 }),
    );
  });
});

describe('composer reducer: tabs and posting', () => {
  it('switches between write and preview', () => {
    const open = composerReducer(initialComposer, { type: 'open', target: line });
    const preview = composerReducer(open, { type: 'tab', tab: 'preview' });
    expect(preview.status).toBe('previewing');
    expect(composerReducer(preview, { type: 'tab', tab: 'write' }).status).toBe('open');
  });

  it('does not post an empty text', () => {
    const open = composerReducer(initialComposer, { type: 'open', target: line });
    expect(composerReducer(open, { type: 'post' })).toBe(open);
  });

  it('moves to posting on post and closes on succeed, dropping the draft', () => {
    const s = run(
      initialComposer,
      { type: 'open', target: line },
      { type: 'edit', text: 'Ship it' },
      { type: 'post' },
    );
    expect(s.status).toBe('posting');
    const done = composerReducer(s, { type: 'succeed' });
    expect(done).toEqual({ status: 'closed', text: '', drafts: {} });
  });

  it('keeps the text and the error on fail, and retries with the same text', () => {
    const s = run(
      initialComposer,
      { type: 'open', target: line },
      { type: 'edit', text: 'Ship it' },
      { type: 'post' },
      { type: 'fail', error: 'Not Found' },
    );
    expect(s).toMatchObject({ status: 'failed', text: 'Ship it', error: 'Not Found' });
    const retry = composerReducer(s, { type: 'retry' });
    expect(retry).toMatchObject({ status: 'posting', text: 'Ship it' });
    expect(retry.error).toBeUndefined();
  });

  it('lets the text change while failed and closes keeping it', () => {
    const failed = run(
      initialComposer,
      { type: 'open', target: line },
      { type: 'edit', text: 'a' },
      { type: 'post' },
      { type: 'fail', error: 'x' },
    );
    const edited = composerReducer(failed, { type: 'edit', text: 'ab' });
    expect(edited.text).toBe('ab');
    const closed = composerReducer(edited, { type: 'close' });
    expect(closed.drafts[targetKey(line.subject === 'line' ? { ...line, anchor: 40, line: 40 } : file)]).toBe('ab');
  });

  it('refuses close and edit while posting', () => {
    const posting = run(
      initialComposer,
      { type: 'open', target: line },
      { type: 'edit', text: 'a' },
      { type: 'post' },
    );
    expect(composerReducer(posting, { type: 'close' })).toBe(posting);
    expect(composerReducer(posting, { type: 'edit', text: 'b' })).toBe(posting);
  });

  it('ignores succeed, fail and retry in the wrong status', () => {
    const open = composerReducer(initialComposer, { type: 'open', target: line });
    expect(composerReducer(open, { type: 'succeed' })).toBe(open);
    expect(composerReducer(open, { type: 'fail', error: 'x' })).toBe(open);
    expect(composerReducer(open, { type: 'retry' })).toBe(open);
  });
});

describe('composer labels', () => {
  it('primary label follows the status', () => {
    const open = composerReducer(initialComposer, { type: 'open', target: line });
    expect(primaryLabel(open)).toBe('Comment');
    const posting = run(open, { type: 'edit', text: 'a' }, { type: 'post' });
    expect(primaryLabel(posting)).toBe('Posting...');
    const failed = composerReducer(posting, { type: 'fail', error: 'x' });
    expect(primaryLabel(failed)).toBe('Retry');
  });

  it('secondary label is Start a review, or Add review comment with a pending review', () => {
    expect(secondaryLabel(false)).toBe('Start a review');
    expect(secondaryLabel(true)).toBe('Add review comment');
  });
});
