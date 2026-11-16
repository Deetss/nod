// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../web/phone/haptics', () => ({ BUZZ: { success: 10, tick: 5 }, buzz: vi.fn() }));
vi.mock('../web/api', () => ({ api: { pushPrefs: () => new Promise(() => undefined) } }));

import { buzz } from '../web/phone/haptics';
import { PhoneActionSheet } from '../web/phone/PhoneActionSheet';
import { PhoneBotSplit } from '../web/phone/PhoneBotSplit';
import { PhoneEditTitle } from '../web/phone/PhoneEditTitle';
import { PhoneNotifySheet } from '../web/phone/PhoneNotifySheet';
import { PhoneSheet } from '../web/phone/PhoneSheet';
import { PhoneSubRowSheet } from '../web/phone/PhoneSubIssues';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(el: ReactElement) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(el));
}

const strip = () => host?.querySelector('.ph-strip') as HTMLElement;
const sheet = () => strip().closest('[role="dialog"]') as HTMLElement;

function pointer(target: Element, type: string, y: number, t: number) {
  const e = new MouseEvent(type, { bubbles: true, clientY: y });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'timeStamp', { value: t });
  act(() => {
    target.dispatchEvent(e);
  });
}

/** Drags from the strip by `dy`, slowly enough that it is never a fling, and releases. */
function drag(dy: number, target: Element = strip()) {
  pointer(target, 'pointerdown', 200, 1000);
  for (let d = 10; d <= dy; d += 10) pointer(target, 'pointermove', 200 + d, 1000 + d * 10);
  pointer(target, 'pointerup', 200 + dy, 1000 + dy * 10 + 400);
}

const sheetProps = (onClose: () => void, closeDisabled = false) =>
  createElement(PhoneSheet, { title: 'acme-co/orders-api #372', sub: 'build-bot', onClose, closeDisabled, children: 'body' });

beforeEach(() => {
  vi.mocked(buzz).mockClear();
  window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

describe('swipe down to close', () => {
  it('ignores a drag that starts on a button in the strip', () => {
    const onClose = vi.fn();
    mount(sheetProps(onClose));
    const close = strip().querySelector('button') as HTMLButtonElement;
    drag(160, close);
    act(() => vi.advanceTimersByTime(300));
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().style.transform).toBe('');
  });

  it('springs back below the line and keeps the sheet', () => {
    const onClose = vi.fn();
    mount(sheetProps(onClose));
    pointer(strip(), 'pointerdown', 200, 1000);
    pointer(strip(), 'pointermove', 300, 1500);
    expect(sheet().style.transform).toBe('translateY(100px)');
    pointer(strip(), 'pointerup', 300, 1600);
    expect(sheet().style.transform).toBe('');
    expect(sheet().style.transition).toContain('180ms');
    act(() => vi.advanceTimersByTime(500));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fades the scrim with the drag', () => {
    mount(sheetProps(vi.fn()));
    pointer(strip(), 'pointerdown', 200, 1000);
    pointer(strip(), 'pointermove', 320, 1500);
    const scrim = host?.querySelector('.ph-sheet-scrim') as HTMLElement;
    expect(scrim.style.getPropertyValue('--ph-scrim-k')).toBe('0.5');
  });

  it('slides out past the line and closes once', () => {
    const onClose = vi.fn();
    mount(sheetProps(onClose));
    drag(140);
    expect(sheet().style.transform).toBe('translateY(100%)');
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(240));
    act(() => vi.advanceTimersByTime(500));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on release under reduced motion, with no slide', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    const onClose = vi.fn();
    mount(sheetProps(onClose));
    drag(140);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ticks once on crossing 120 and again only after dropping back', () => {
    mount(sheetProps(vi.fn()));
    pointer(strip(), 'pointerdown', 200, 1000);
    for (const y of [300, 320, 340, 300, 330]) pointer(strip(), 'pointermove', y, 2000);
    expect(vi.mocked(buzz).mock.calls).toEqual([[5], [5]]);
  });

  it('does not drag while Close is disabled', () => {
    const onClose = vi.fn();
    mount(sheetProps(onClose, true));
    drag(160);
    act(() => vi.advanceTimersByTime(500));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not drag Edit title while it saves', () => {
    const onClose = vi.fn();
    mount(createElement(PhoneEditTitle, { current: 'Old', issueRef: 'acme-web #42', writesOff: false, busy: true, onSave: vi.fn(), onClose }));
    drag(160);
    act(() => vi.advanceTimersByTime(500));
    expect(onClose).not.toHaveBeenCalled();
  });

  const child = { id: 'c1', repo: 'acme-co/orders-api', number: 14, title: 'Child', state: 'open' as const, url: '' };
  const bottomSheets: [string, (onClose: () => void) => ReactElement][] = [
    ['action sheet', (onClose) => createElement(PhoneActionSheet, { title: 'acme-co/orders-api #372', items: [], onRun: vi.fn(), onClose })],
    ['bot split', (onClose) => createElement(PhoneBotSplit, { number: 12, parts: [{ title: 'One', acceptanceCriteria: [] }], onSplit: vi.fn(), onClose })],
    ['edit title', (onClose) => createElement(PhoneEditTitle, { current: 'Old', issueRef: 'acme-web #42', writesOff: false, busy: false, onSave: vi.fn(), onClose })],
    ['notify', (onClose) => createElement(PhoneNotifySheet, { push: { state: 'off', busy: false, toggle: vi.fn() }, onClose })],
    [
      'sub-issue row',
      (onClose) =>
        createElement(PhoneSubRowSheet, { parentNumber: 12, child, parentRepo: 'acme-co/orders-api', writesOff: false, onOpen: vi.fn(), onGithub: vi.fn(), onRemove: vi.fn(), onClose }),
    ],
  ];

  it.each(bottomSheets)('%s wires its handle and title as the drag zone', (_name, make) => {
    const onClose = vi.fn();
    mount(make(onClose));
    expect(strip().querySelector('.ph-handle')).not.toBeNull();
    expect(strip().querySelector('h2')).not.toBeNull();
    drag(140);
    act(() => vi.advanceTimersByTime(240));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
