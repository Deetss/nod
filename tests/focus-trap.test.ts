// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from '../web/useFocusTrap';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function Dialog({ onEscape }: { onEscape: () => void }) {
  const ref = useFocusTrap(onEscape);
  return createElement(
    'div',
    { ref, role: 'dialog' },
    createElement('button', { id: 'first' }, 'one'),
    createElement('button', { id: 'last' }, 'two'),
  );
}

function mount(open: boolean, onEscape: () => void) {
  return createElement(
    'div',
    null,
    createElement('button', { id: 'opener' }, 'open'),
    open ? createElement(Dialog, { onEscape }) : null,
  );
}

function render(open: boolean, onEscape: () => void) {
  act(() => root!.render(mount(open, onEscape)));
}

function setup() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
}

function key(target: Element, k: string, shiftKey = false) {
  const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe('useFocusTrap', () => {
  it('wraps Tab from the last control to the first and Shift+Tab back', () => {
    setup();
    render(true, () => undefined);
    const first = document.getElementById('first')!;
    const last = document.getElementById('last')!;
    last.focus();
    expect(key(last, 'Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(key(first, 'Tab', true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('leaves Tab alone between the first and last controls', () => {
    setup();
    render(true, () => undefined);
    const first = document.getElementById('first')!;
    first.focus();
    expect(key(first, 'Tab').defaultPrevented).toBe(false);
  });

  it('calls onEscape on Esc', () => {
    setup();
    const onEscape = vi.fn();
    render(true, onEscape);
    key(document.getElementById('first')!, 'Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the opener when the dialog unmounts', () => {
    setup();
    render(false, () => undefined);
    const opener = document.getElementById('opener')!;
    opener.focus();
    render(true, () => undefined);
    document.getElementById('last')!.focus();
    render(false, () => undefined);
    expect(document.activeElement).toBe(opener);
  });
});
