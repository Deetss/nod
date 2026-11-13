// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTyping } from '../web/hooks';

function input(type: string): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  return el;
}

describe('isTyping', () => {
  it('treats text-like inputs and textareas as typing', () => {
    expect(isTyping(input('text'))).toBe(true);
    expect(isTyping(input('search'))).toBe(true);
    expect(isTyping(document.createElement('textarea'))).toBe(true);
    expect(isTyping(document.createElement('select'))).toBe(true);
  });

  it('lets hotkeys through when a checkbox, radio or button input has focus', () => {
    expect(isTyping(input('checkbox'))).toBe(false);
    expect(isTyping(input('radio'))).toBe(false);
    expect(isTyping(input('button'))).toBe(false);
  });

  it('ignores non-element targets', () => {
    expect(isTyping(null)).toBe(false);
  });
});
