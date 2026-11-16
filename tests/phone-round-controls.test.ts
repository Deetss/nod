// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneSheetBar } from '../web/phone/PhoneFitSheet';
import { PhoneSheet } from '../web/phone/PhoneSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const btn = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;

const bar = (busy: boolean, disabled: boolean, onPrimary = vi.fn()) =>
  createElement(PhoneSheetBar, { busy, disabled, primary: 'Send', busyLabel: 'Sending…', onCancel: vi.fn(), onPrimary });

describe('phone sheet bar pills', () => {
  it('busy: the primary keeps its fill, shows a spinner before the word and is aria-busy', () => {
    const onPrimary = vi.fn();
    const el = render(bar(true, false, onPrimary));
    const primary = btn(el, 'Sending…');
    expect(primary.className).toBe('ph-btn is-primary is-busy');
    expect(primary.getAttribute('aria-busy')).toBe('true');
    expect(primary.getAttribute('aria-disabled')).toBe('true');
    expect(primary.disabled).toBe(false);
    expect(primary.firstElementChild?.className).toBe('spinner');
    act(() => primary.click());
    expect(onPrimary).not.toHaveBeenCalled();
    expect(btn(el, 'Cancel').disabled).toBe(true);
  });

  it('disabled: the primary is disabled with no busy attributes, and Cancel stays live', () => {
    const el = render(bar(false, true));
    const primary = btn(el, 'Send');
    expect(primary.disabled).toBe(true);
    expect(primary.hasAttribute('aria-busy')).toBe(false);
    expect(primary.hasAttribute('aria-disabled')).toBe(false);
    expect(btn(el, 'Cancel').disabled).toBe(false);
  });
});

describe('phone sheet back button', () => {
  it('is a round Back arrow first in the header, for full and fit sheets alike', () => {
    for (const fit of [false, true]) {
      const el = render(createElement(PhoneSheet, { fit, title: 'Fix', sub: 'acme/app #7', onClose: vi.fn(), onMore: vi.fn(), children: null }));
      const head = el.querySelector('.ph-sheet-head');
      const first = head?.firstElementChild as HTMLButtonElement;
      expect(first.className).toBe('ph-iconbtn');
      expect(first.getAttribute('aria-label')).toBe('Back');
      expect(head?.lastElementChild?.getAttribute('aria-label')).toBe('More actions');
      act(() => root?.unmount());
      root = undefined;
      host?.remove();
    }
  });

  it('while busy it is disabled and neither it nor Esc closes the sheet', () => {
    const onClose = vi.fn();
    const el = render(createElement(PhoneSheet, { fit: true, title: 'Fix', sub: 'acme/app #7', closeDisabled: true, onClose, children: null }));
    const back = el.querySelector<HTMLButtonElement>('[aria-label="Back"]') as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    act(() => back.click());
    act(() => {
      el.querySelector('.ph-sheet')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
