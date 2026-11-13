// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneComposer } from '../web/phone/PhoneComposer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(over: Partial<Parameters<typeof PhoneComposer>[0]> = {}) {
  const onSubmit = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(PhoneComposer, {
        draftKey: 'new-issue:acme-web',
        title: 'Description',
        submitLabel: 'Done',
        writesOff: false,
        busy: false,
        onSubmit,
        onClose: () => {},
        ...over,
      }),
    ),
  );
  return { el: host, onSubmit };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  window.localStorage.clear();
});

const field = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>('textarea');
const submit = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.ph-composer-actions .is-primary');

function type(el: HTMLElement, text: string): void {
  const box = field(el);
  if (!box) throw new Error('no field');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('composer used for the new issue description', () => {
  it('starts from the form text over a stale stored draft', () => {
    window.localStorage.setItem('new-issue:acme-web', 'old draft');
    const { el } = mount({ initialText: 'Steps to reproduce' });
    expect(field(el)?.value).toBe('Steps to reproduce');
  });

  it('falls back to the stored draft when the form has no text', () => {
    window.localStorage.setItem('new-issue:acme-web', 'recovered');
    const { el } = mount({ initialText: '' });
    expect(field(el)?.value).toBe('recovered');
  });

  it('lets Done submit an empty field to clear the description', () => {
    const { el, onSubmit } = mount({ initialText: 'text', allowEmpty: true });
    type(el, '');
    expect(submit(el)?.disabled).toBe(false);
    act(() => submit(el)?.click());
    expect(onSubmit).toHaveBeenCalledWith('');
    expect(window.localStorage.getItem('new-issue:acme-web')).toBeNull();
  });

  it('still blocks an empty comment', () => {
    const { el, onSubmit } = mount({ submitLabel: 'Comment' });
    expect(submit(el)?.disabled).toBe(true);
    act(() => submit(el)?.click());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
