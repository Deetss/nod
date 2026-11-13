// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetTabs, SwipePager, useTabPager } from '../web/phone/SwipePager';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tab = 'a' | 'b' | 'c';
const ORDER: readonly Tab[] = ['a', 'b', 'c'];

let root: Root;
let host: HTMLElement;
let reduced = false;

function Probe({ start = 'a' as Tab, onTab = (_: Tab) => {} }) {
  const [tab, setTab] = useState<Tab>(start);
  const change = (t: Tab) => {
    onTab(t);
    setTab(t);
  };
  const pager = useTabPager(ORDER, tab, change);
  return createElement(
    'div',
    null,
    createElement(SheetTabs<Tab>, { tabs: [['a', 'A'], ['b', 'B'], ['c', 'C']], value: tab, onChange: change, pager }),
    createElement(SwipePager, {
      pager,
      panes: ORDER.map((k) => createElement('button', { key: k, className: `pane-${k}` }, k)),
    }),
  );
}

function mount(props: Parameters<typeof Probe>[0] = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(Probe, props)));
}

const pager = () => host.querySelector('.ph-pager') as HTMLElement;
const track = () => host.querySelector('.ph-pager-track') as HTMLElement;
const active = () => host.querySelector('.ph-pane.is-active')?.textContent;

function pointer(type: string, x: number, y: number, t: number, target: Element = pager()) {
  const e = new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, pointerType: 'touch' });
  Object.defineProperty(e, 'timeStamp', { value: t });
  act(() => {
    target.dispatchEvent(e);
  });
}

/** A drag from x0 to x1 in `steps` moves, `ms` apart, then a lift. */
function swipe(x0: number, x1: number, { steps = 10, ms = 16, y = 0, target }: { steps?: number; ms?: number; y?: number; target?: Element } = {}) {
  pointer('pointerdown', x0, 300, 0, target);
  for (let i = 1; i <= steps; i++) pointer('pointermove', x0 + ((x1 - x0) * i) / steps, 300 + (y * i) / steps, i * ms, target);
  pointer('pointerup', x1, 300 + y, steps * ms + 1, target);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  reduced = false;
  window.matchMedia = vi.fn((q: string) => ({ matches: reduced && q.includes('reduce') }) as MediaQueryList);
  Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true });
  Element.prototype.setPointerCapture = vi.fn();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('SwipePager', () => {
  it('a slow drag past 30% moves to the next tab, the same way a tap does', () => {
    const onTab = vi.fn();
    mount({ onTab });
    swipe(300, 150, { ms: 40 });
    expect(onTab).toHaveBeenCalledWith('b');
    expect(active()).toBe('b');
    expect(host.querySelector('[aria-selected="true"]')?.textContent).toBe('B');
  });

  it('a short slow drag snaps back', () => {
    mount();
    swipe(300, 220, { ms: 40 });
    expect(active()).toBe('a');
    expect(track().style.getPropertyValue('--swipe-pos')).toBe('0');
  });

  it('a mostly vertical drag never moves the tabs', () => {
    mount();
    swipe(300, 150, { y: 400 });
    expect(active()).toBe('a');
  });

  it('a touch in the edge zone is left to the back gesture', () => {
    mount({ start: 'b' });
    swipe(10, 300);
    expect(active()).toBe('b');
  });

  it('the first tab rubber-bands and stays', () => {
    mount();
    swipe(100, 380);
    expect(active()).toBe('a');
  });

  it('moves the track and indicator with the finger', () => {
    mount();
    pointer('pointerdown', 300, 300, 0);
    pointer('pointermove', 290, 300, 16);
    pointer('pointermove', 197, 300, 32);
    const pos = Number(track().style.getPropertyValue('--swipe-pos'));
    // Movement counts from where the 10px lock was reached, so the content starts from rest.
    expect(pos).toBeCloseTo((290 - 197) / 412, 4);
    expect((host.querySelector('.ph-tabs-ind') as HTMLElement).style.getPropertyValue('--swipe-pos')).toBe(String(pos));
    expect(track().classList.contains('is-moving')).toBe(true);
  });

  it('swallows the tap that ends a swipe, but not a plain tap', () => {
    mount();
    const onClick = vi.fn();
    host.addEventListener('click', onClick);
    swipe(300, 150, { ms: 40 });
    act(() => (host.querySelector('.pane-b') as HTMLElement).click());
    expect(onClick).not.toHaveBeenCalled();
    act(() => (host.querySelector('.pane-b') as HTMLElement).click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('settles without a slide under reduced motion', () => {
    reduced = true;
    mount();
    swipe(300, 150, { ms: 40 });
    expect(active()).toBe('b');
    expect(track().style.transition).toBe('none');
  });

  it('slides when motion is allowed', () => {
    mount();
    swipe(300, 150, { ms: 40 });
    expect(track().style.transition).toContain('transform');
  });

  it('keeps tapping the tabs working, and leaves a mouse drag alone', () => {
    mount();
    act(() => (host.querySelector('[role="tab"]:nth-of-type(3)') as HTMLElement).click());
    expect(active()).toBe('c');
    const down = new PointerEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 300, pointerType: 'mouse', isPrimary: true });
    act(() => {
      pager().dispatchEvent(down);
    });
    pointer('pointermove', 100, 300, 16);
    pointer('pointerup', 100, 300, 17);
    expect(active()).toBe('c');
  });
});
