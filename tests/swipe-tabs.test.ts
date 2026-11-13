// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  EDGE_PX,
  RUBBER_MAX_PX,
  canStart,
  dragOffset,
  inEdgeZone,
  lockAxis,
  overlayOver,
  scrollerTakes,
  settleIndex,
  settleMs,
} from '../web/phone/swipe-logic';

const W = 412;
const release = (over: Partial<Parameters<typeof settleIndex>[0]>) =>
  settleIndex({ dx: 0, velocity: 0, width: W, index: 1, count: 3, ...over });

afterEach(() => {
  document.body.innerHTML = '';
});

describe('settleIndex: threshold and fling', () => {
  it('snaps back below 30% of the width', () => {
    expect(release({ dx: -0.29 * W })).toBe(1);
    expect(release({ dx: 0.29 * W })).toBe(1);
  });

  it('moves one tab past 30%, toward the side the content was dragged from', () => {
    expect(release({ dx: -0.31 * W })).toBe(2);
    expect(release({ dx: 0.31 * W })).toBe(0);
  });

  it('a fast fling changes tab even when short', () => {
    expect(release({ dx: -40, velocity: -0.8 })).toBe(2);
    expect(release({ dx: 40, velocity: 0.8 })).toBe(0);
  });

  it('a fling back against the drag snaps back, and a slow release is not a fling', () => {
    expect(release({ dx: -40, velocity: 0.8 })).toBe(1);
    expect(release({ dx: -40, velocity: -0.2 })).toBe(1);
  });
});

describe('first and last tab', () => {
  it('a swipe past either end stays put', () => {
    expect(release({ index: 0, dx: 0.6 * W, velocity: 1 })).toBe(0);
    expect(release({ index: 2, dx: -0.6 * W, velocity: -1 })).toBe(2);
  });

  it('rubber-bands past an end, small and capped', () => {
    expect(dragOffset(60, 0, 3)).toBe(20);
    expect(dragOffset(-600, 2, 3)).toBe(-RUBBER_MAX_PX);
  });

  it('follows the finger one to one where a tab exists', () => {
    expect(dragOffset(-60, 0, 3)).toBe(-60);
    expect(dragOffset(60, 2, 3)).toBe(60);
  });
});

describe('lockAxis: direction lock', () => {
  it('waits until the finger has moved 10px', () => {
    expect(lockAxis(9, 0)).toBe('pending');
    expect(lockAxis(-6, 7)).toBe('pending');
  });

  it('locks to the axis with more travel; a tie stays vertical', () => {
    expect(lockAxis(12, 4)).toBe('x');
    expect(lockAxis(4, -12)).toBe('y');
    expect(lockAxis(10, 10)).toBe('y');
  });
});

describe('canStart: edge zone, focus and overlays', () => {
  const base = { x: 200, width: W, focused: null, overlayOpen: false };

  it('ignores a touch within 24px of either edge', () => {
    expect(inEdgeZone(EDGE_PX - 1, W)).toBe(true);
    expect(inEdgeZone(W - EDGE_PX + 1, W)).toBe(true);
    expect(inEdgeZone(EDGE_PX, W)).toBe(false);
    expect(canStart({ ...base, x: 10 })).toBe(false);
    expect(canStart({ ...base, x: W - 10 })).toBe(false);
    expect(canStart(base)).toBe(true);
  });

  it('ignores a swipe while a text field has focus', () => {
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const box = document.createElement('input');
    box.type = 'checkbox';
    expect(canStart({ ...base, focused: input })).toBe(false);
    expect(canStart({ ...base, focused: area })).toBe(false);
    expect(canStart({ ...base, focused: box })).toBe(true);
    expect(canStart({ ...base, focused: document.createElement('button') })).toBe(true);
  });

  it('ignores a swipe while disabled or under an overlay', () => {
    expect(canStart({ ...base, disabled: true })).toBe(false);
    expect(canStart({ ...base, overlayOpen: true })).toBe(false);
  });

  it('counts a dialog or menu over the pager, but not the sheet the pager sits in', () => {
    document.body.innerHTML = `
      <div role="dialog" aria-modal="true" id="sheet"><div id="pager"></div></div>`;
    const pager = document.getElementById('pager') as HTMLElement;
    expect(overlayOver(pager)).toBe(false);
    document.body.insertAdjacentHTML('beforeend', '<div role="dialog" aria-modal="true"></div>');
    expect(overlayOver(pager)).toBe(true);
  });

  it('a menu open over the main tabs blocks them', () => {
    document.body.innerHTML = '<div id="pager"></div><div role="menu"></div>';
    expect(overlayOver(document.getElementById('pager') as HTMLElement)).toBe(true);
  });
});

describe('scrollerTakes: horizontally scrollable ancestors', () => {
  function setup(scrollLeft: number, overflowX = 'auto') {
    document.body.innerHTML = '<div id="pager"><pre id="code"><span id="t">x</span></pre></div>';
    const code = document.getElementById('code') as HTMLElement;
    code.style.overflowX = overflowX;
    Object.defineProperties(code, {
      scrollWidth: { value: 800 },
      clientWidth: { value: 400 },
      scrollLeft: { value: scrollLeft, writable: true },
    });
    return { pager: document.getElementById('pager') as HTMLElement, target: document.getElementById('t') as HTMLElement };
  }

  it('a code block at its start takes a left drag but not a right one', () => {
    const { pager, target } = setup(0);
    expect(scrollerTakes(target, pager, -20)).toBe(true);
    expect(scrollerTakes(target, pager, 20)).toBe(false);
  });

  it('a code block at its end takes a right drag but not a left one', () => {
    const { pager, target } = setup(400);
    expect(scrollerTakes(target, pager, -20)).toBe(false);
    expect(scrollerTakes(target, pager, 20)).toBe(true);
  });

  it('a block in the middle takes both ways', () => {
    const { pager, target } = setup(150);
    expect(scrollerTakes(target, pager, -20)).toBe(true);
    expect(scrollerTakes(target, pager, 20)).toBe(true);
  });

  it('wide content that does not scroll is ignored', () => {
    const { pager, target } = setup(0, 'hidden');
    expect(scrollerTakes(target, pager, -20)).toBe(false);
  });
});

describe('reduced motion', () => {
  it('settles without the slide', () => {
    expect(settleMs(true)).toBe(0);
    expect(settleMs(false)).toBeGreaterThan(0);
  });
});
