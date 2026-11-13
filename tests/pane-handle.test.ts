// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaneHandle } from '../web/PaneHandle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(onResize: (px: number) => void, onReset: () => void = () => {}): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(PaneHandle, { label: 'Resize Inbox', value: 400, min: 280, max: 900, onResize, onReset }),
    );
  });
  const el = host.querySelector<HTMLElement>('[role="separator"]');
  if (!el) throw new Error('handle not rendered');
  // jsdom has no pointer capture.
  el.setPointerCapture = () => {};
  return el;
}

function pointer(el: HTMLElement, type: string, clientX: number): void {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.classList.remove('pane-resizing');
});

describe('PaneHandle', () => {
  it('resizes by the pointer travel from the pressed width', () => {
    const onResize = vi.fn();
    const el = mount(onResize);
    pointer(el, 'pointerdown', 400);
    pointer(el, 'pointermove', 460);
    expect(onResize).toHaveBeenLastCalledWith(460);
    pointer(el, 'pointermove', 350);
    expect(onResize).toHaveBeenLastCalledWith(350);
  });

  it('ignores pointer moves before a press', () => {
    const onResize = vi.fn();
    const el = mount(onResize);
    pointer(el, 'pointermove', 500);
    expect(onResize).not.toHaveBeenCalled();
  });

  it('stops resizing after the pointer is released', () => {
    const onResize = vi.fn();
    const el = mount(onResize);
    pointer(el, 'pointerdown', 400);
    pointer(el, 'pointerup', 400);
    pointer(el, 'pointermove', 500);
    expect(onResize).not.toHaveBeenCalled();
    expect(document.body.classList.contains('pane-resizing')).toBe(false);
  });

  it('steps with the arrow keys and resets on double click', () => {
    const onResize = vi.fn();
    const onReset = vi.fn();
    const el = mount(onResize, onReset);
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onResize).toHaveBeenLastCalledWith(416);
    act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(onResize).toHaveBeenLastCalledWith(384);
    act(() => {
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
