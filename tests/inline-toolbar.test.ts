import { describe, expect, it } from 'vitest';
import { bullet, insertAtCaret, numbered, prefixLines, task, wrapSelection } from '../web/inline/toolbar';

describe('toolbar: wrapSelection', () => {
  it('wraps the selected words and keeps them selected', () => {
    const out = wrapSelection('say hi now', 4, 6, '**', '**');
    expect(out.text).toBe('say **hi** now');
    expect(out.text.slice(out.start, out.end)).toBe('hi');
  });

  it('inserts the pair at the caret with no selection and puts the caret between', () => {
    const out = wrapSelection('ab', 1, 1, '*', '*');
    expect(out.text).toBe('a**b');
    expect(out.start).toBe(2);
    expect(out.end).toBe(2);
  });
});

describe('toolbar: insertAtCaret', () => {
  it('inserts at the caret and moves the caret after it', () => {
    const out = insertAtCaret('hello world', 5, 5, ' there');
    expect(out).toEqual({ text: 'hello there world', start: 11, end: 11 });
  });

  it('replaces the selection', () => {
    const out = insertAtCaret('abcdef', 2, 4, '[x]');
    expect(out.text).toBe('ab[x]ef');
    expect(out.start).toBe(5);
  });

  it('inserts the mention trigger at the start of an empty box', () => {
    const out = insertAtCaret('', 0, 0, '@');
    expect(out).toEqual({ text: '@', start: 1, end: 1 });
  });
});

describe('toolbar: prefixLines', () => {
  it('prefixes each selected line for a bulleted list', () => {
    const text = 'one\ntwo\nthree';
    const out = prefixLines(text, 0, text.length, () => '- ');
    expect(out.text).toBe('- one\n- two\n- three');
  });

  it('numbers multiple lines from 1', () => {
    const text = 'a\nb';
    const out = prefixLines(text, 0, text.length, numbered);
    expect(out.text).toBe('1. a\n2. b');
  });

  it('prefixes only the line the caret is on when nothing is selected', () => {
    const text = 'one\ntwo\nthree';
    const caret = text.indexOf('two') + 1;
    const out = prefixLines(text, caret, caret, bullet);
    expect(out.text).toBe('one\n- two\nthree');
  });

  it('does not touch the next line when the selection ends right after a newline', () => {
    const text = 'one\ntwo\n';
    const out = prefixLines(text, 0, 4, task);
    expect(out.text).toBe('- [ ] one\ntwo\n');
  });

  it('shifts the selection by the prefix so it still covers the same text', () => {
    const text = 'one\ntwo';
    const out = prefixLines(text, 4, text.length, bullet);
    expect(out.text.slice(out.start, out.end)).toBe('two');
  });
});
