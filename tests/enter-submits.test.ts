// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrSummary } from '../shared/types';
import { ActionDialog } from '../web/Dialogs';
import { PhoneConfirm } from '../web/phone/PhoneActionSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

const pr = { number: 42, repo: 'org/repo', title: 'Title' } as unknown as PrSummary;

function mount(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}

function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function key(target: Element, init: KeyboardEventInit) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.useRealTimers();
});

function dialog(kind: 'admin' | 'comment' | 'approve' | 'merge') {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  mount(createElement(ActionDialog, { kind, pr, methodLabel: 'Squash', busy: false, onConfirm, onCancel, onUploadError: () => {} }));
  return { onConfirm, onCancel };
}

describe('Enter in dialogs', () => {
  it('admin: wrong number plus Enter does not confirm, right number confirms once', () => {
    const { onConfirm } = dialog('admin');
    const input = document.querySelector('input.confirm-input') as HTMLInputElement;
    type(input, '41');
    key(input, {});
    expect(onConfirm).not.toHaveBeenCalled();
    type(input, '42');
    key(input, {});
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('42');
  });

  it('ignores Enter during IME composition', () => {
    const { onConfirm } = dialog('admin');
    const input = document.querySelector('input.confirm-input') as HTMLInputElement;
    type(input, '42');
    key(input, { isComposing: true });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('comment: Enter does not confirm, Ctrl+Enter does', () => {
    const { onConfirm } = dialog('comment');
    const area = document.querySelector('textarea') as HTMLTextAreaElement;
    type(area, 'looks good');
    key(area, {});
    expect(onConfirm).not.toHaveBeenCalled();
    key(area, { ctrlKey: true });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('looks good');
  });

  it('approve: Enter in the optional comment box does not confirm', () => {
    const { onConfirm } = dialog('approve');
    key(document.querySelector('textarea')!, {});
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('merge: Enter on the dialog confirms, Enter on Cancel does not', () => {
    const { onConfirm } = dialog('merge');
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    key(cancel, {});
    expect(onConfirm).not.toHaveBeenCalled();
    key(document.querySelector('.dialog')!, {});
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Enter in the phone confirm', () => {
  it('submits only once armed and the number matches', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    mount(
      createElement(PhoneConfirm, {
        kind: 'ready',
        subject: 'Title',
        busy: false,
        requireNumber: 42,
        onConfirm,
        onCancel: vi.fn(),
      }),
    );
    const input = document.querySelector('input.ph-input') as HTMLInputElement;
    type(input, '42');
    key(input, {});
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    type(input, '41');
    key(input, {});
    expect(onConfirm).not.toHaveBeenCalled();
    type(input, '42');
    key(input, {});
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Phone confirm with the keyboard open', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shrinks its scrim to the visual viewport and keeps focus on Cancel', () => {
    const vv = Object.assign(new EventTarget(), { height: Math.round(window.innerHeight * 0.6) });
    vi.stubGlobal('visualViewport', vv);
    mount(
      createElement(PhoneConfirm, {
        kind: 'admin-merge',
        subject: 'Title',
        busy: false,
        requireNumber: 42,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );
    const scrim = document.querySelector('.ph-scrim') as HTMLElement;
    expect(scrim.classList.contains('has-keyboard')).toBe(true);
    expect(scrim.style.height).toBe(`${vv.height}px`);
    expect(document.activeElement?.textContent).toBe('Cancel');

    act(() => {
      vv.height = window.innerHeight;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(scrim.classList.contains('has-keyboard')).toBe(false);
    expect(scrim.style.height).toBe('');
  });
});
