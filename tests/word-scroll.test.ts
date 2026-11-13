import { describe, expect, it } from 'vitest';
import { WORD_CONTEXT_PX, wordScrollLeft } from '../web/word-scroll';

const view = { scrollLeft: 0, clientWidth: 800, scrollWidth: 3000, gutter: 108 };
const offRight = { left: 1500, right: 1900 };
const auto = { wrap: false, userScrolled: false };

describe('wordScrollLeft', () => {
  it('scrolls a highlight off-screen right into view with context to its left', () => {
    expect(wordScrollLeft(view, offRight, auto)).toBe(1500 - 108 - WORD_CONTEXT_PX);
  });

  it('stays put when the highlight is already visible', () => {
    expect(wordScrollLeft(view, { left: 300, right: 420 }, auto)).toBeUndefined();
  });

  it('stays put when Wrap is on', () => {
    expect(wordScrollLeft(view, offRight, { wrap: true, userScrolled: false })).toBeUndefined();
  });

  it('stays put once the user has scrolled the file sideways', () => {
    expect(wordScrollLeft(view, offRight, { wrap: false, userScrolled: true })).toBeUndefined();
  });

  it('clamps to the end of the scroller', () => {
    expect(wordScrollLeft(view, { left: 2980, right: 3000 }, auto)).toBe(3000 - 800);
  });
});
