// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../web/phone/haptics', () => ({ BUZZ: { success: 10, tick: 5 }, buzz: vi.fn() }));

import { buzz } from '../web/phone/haptics';
import { PullList } from '../web/phone/PhoneList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(onRefresh: () => Promise<boolean>, limited = false) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(createElement(PullList, { syncLine: 'Synced 4 min ago', refreshing: false, onRefresh, limited, children: 'rows' })),
  );
}

const list = () => host?.querySelector('.ph-list') as HTMLElement;
const disc = () => host?.querySelector('.ph-pull-disc') as HTMLElement;
const line = () => host?.querySelector('.ph-syncline')?.textContent;

function touch(type: string, y?: number) {
  const e = new Event(type, { bubbles: true });
  Object.defineProperty(e, 'touches', { value: y === undefined ? [] : [{ clientY: y }] });
  act(() => {
    list().dispatchEvent(e);
  });
}

/** A drag from y 100 through each finger travel, then release. */
function pull(...travel: number[]) {
  touch('touchstart', 100);
  for (const t of travel) touch('touchmove', 100 + t);
}
const release = () => touch('touchend');

beforeEach(() => {
  vi.mocked(buzz).mockClear();
  window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

describe('pull to refresh', () => {
  it('ignores a touch that starts while the list is scrolled', () => {
    const onRefresh = vi.fn(() => Promise.resolve(true));
    mount(onRefresh);
    Object.defineProperty(list(), 'scrollTop', { configurable: true, value: 40 });
    pull(120);
    release();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(disc().className).toContain('is-idle');
  });

  it('follows the finger, damped and capped, and says release past the line', () => {
    mount(vi.fn(() => Promise.resolve(true)));
    pull(50);
    expect(disc().style.transform).toBe('translateY(30px)');
    expect(line()).toBe('Synced 4 min ago');
    pull(50, 100);
    expect(disc().style.transform).toBe('translateY(56px)');
    expect(line()).toBe('Release to refresh');
  });

  it('ticks once when crossing 72, and again only after dropping back', () => {
    mount(vi.fn(() => Promise.resolve(true)));
    pull(40, 72, 90, 100);
    expect(buzz).toHaveBeenCalledTimes(1);
    expect(buzz).toHaveBeenCalledWith(5);
    touch('touchmove', 160);
    touch('touchmove', 180);
    expect(buzz).toHaveBeenCalledTimes(2);
  });

  it('springs back without a request when released short of the line', () => {
    const onRefresh = vi.fn(() => Promise.resolve(true));
    mount(onRefresh);
    pull(60);
    release();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(disc().className).toContain('is-returning');
    expect(disc().style.transform).toBe('translateY(0px)');
  });

  it('refreshes past the line and rests the disc at 40 while syncing', async () => {
    let done: (ok: boolean) => void = () => undefined;
    const onRefresh = vi.fn(() => new Promise<boolean>((r) => (done = r)));
    mount(onRefresh);
    pull(100);
    release();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(disc().className).toContain('is-syncing');
    expect(disc().style.transform).toBe('translateY(40px)');
    expect(line()).toBe('Refreshing…');
    await act(async () => done(true));
    expect(disc().className).toContain('is-done');
  });

  it('shows Sync failed when the refresh resolves false, then the disc leaves after 1s', async () => {
    vi.useFakeTimers();
    mount(() => Promise.resolve(false));
    pull(100);
    release();
    await act(async () => undefined);
    expect(disc().className).toContain('is-failed');
    expect(line()).toBe('Sync failed');
    expect(buzz).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(999));
    expect(disc().className).toContain('is-failed');
    act(() => vi.advanceTimersByTime(1));
    expect(disc().className).toContain('is-done');
    act(() => vi.advanceTimersByTime(150));
    expect(disc().className).toContain('is-idle');
    expect(line()).toBe('Synced 4 min ago');
  });

  it('sends no request and never ticks while rate limited', () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn(() => Promise.resolve(true));
    mount(onRefresh, true);
    pull(50, 100);
    expect(disc().className).toContain('is-limited');
    expect(host?.querySelector('.ph-pull-pill')?.textContent).toBe('No request sent');
    expect(host?.querySelector('.ph-pull-arc')).toBeNull();
    expect(line()).toBe('Synced 4 min ago');
    release();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(buzz).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1000));
    expect(disc().className).toContain('is-done');
  });
});
