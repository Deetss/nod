// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollRowIntoView } from '../web/list-view';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('scrollRowIntoView', () => {
  it('scrolls the row to nearest after the next frame', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    document.body.innerHTML = '<div id="row-PR_1"></div>';

    scrollRowIntoView('PR_1');
    expect(spy).not.toHaveBeenCalled();
    frames.forEach((cb) => cb(0));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('does not throw when the row is missing', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => cb(0));
    expect(() => scrollRowIntoView('nope')).not.toThrow();
  });
});
