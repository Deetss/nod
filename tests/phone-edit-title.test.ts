// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canSaveTitle, PhoneEditTitle } from '../web/phone/PhoneEditTitle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(over: Partial<Parameters<typeof PhoneEditTitle>[0]> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(PhoneEditTitle, {
        current: 'Checkout page flickers',
        issueRef: 'acme-web #42',
        writesOff: false,
        busy: false,
        onSave,
        onClose,
        ...over,
      }),
    ),
  );
  return { el: host, onSave, onClose };
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const field = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[aria-label=Title]');
const save = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.ph-btn.is-primary');

function type(el: HTMLElement, text: string): void {
  const box = field(el);
  if (!box) throw new Error('no field');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('canSaveTitle', () => {
  it('needs a changed, non empty title and a connection', () => {
    expect(canSaveTitle('New', 'Old', false)).toBe(true);
    expect(canSaveTitle('  Old ', 'Old', false)).toBe(false);
    expect(canSaveTitle('   ', 'Old', false)).toBe(false);
    expect(canSaveTitle('New', 'Old', true)).toBe(false);
  });
});

describe('edit title sheet', () => {
  it('prefills the title and starts with Save off', () => {
    const { el } = mount();
    expect(field(el)?.value).toBe('Checkout page flickers');
    expect(save(el)?.disabled).toBe(true);
    expect(save(el)?.className).toContain('is-off');
  });

  it('saves the trimmed new title with Save', () => {
    const { el, onSave } = mount();
    type(el, '  Checkout button is cut off  ');
    act(() => save(el)?.click());
    expect(onSave).toHaveBeenCalledWith('Checkout button is cut off');
  });

  it('saves on Enter', () => {
    const { el, onSave } = mount();
    type(el, 'Renamed');
    act(() => {
      field(el)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onSave).toHaveBeenCalledWith('Renamed');
  });

  it('shows the empty message and refuses to save', () => {
    const { el, onSave } = mount();
    type(el, '');
    expect(el.textContent).toContain('Title cannot be empty.');
    act(() => save(el)?.click());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the busy state: readonly field, Saving..., Cancel disabled, no close', () => {
    const { el, onClose } = mount({ busy: true });
    expect(save(el)?.textContent).toBe('Saving...');
    expect(save(el)?.getAttribute('aria-busy')).toBe('true');
    expect(field(el)?.readOnly).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('.ph-etitle-cancel')?.disabled).toBe(true);
    act(() => el.querySelector<HTMLElement>('.ph-scrim')?.click());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps Save off when writes are off', () => {
    const { el } = mount({ writesOff: true });
    type(el, 'Renamed');
    expect(save(el)?.disabled).toBe(true);
  });
});
