// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Picker, type PickerItem } from '../web/issues/Picker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

const item = (name: string): PickerItem => ({ value: name, text: name, node: createElement('span', null, name) });
const ITEMS = [item('flaky-ci'), item('bug')];

function mount(create?: (name: string) => Promise<PickerItem>, onApply = () => {}): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(Picker, {
        title: 'Labels',
        filterPlaceholder: 'Filter labels',
        items: ITEMS,
        initial: new Set<string>(),
        anchor: 'sidebar',
        create,
        onApply,
        onCancel: () => {},
      }),
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function type(el: HTMLElement, text: string): void {
  const box = el.querySelector<HTMLInputElement>('.picker-filter');
  if (!box) throw new Error('no filter box');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function key(el: HTMLElement, k: string): void {
  act(() => {
    el.querySelector('.picker-filter')?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });
}

const createRow = (el: HTMLElement) => el.querySelector('.picker-create');
const never = () => new Promise<PickerItem>(() => {});

describe('Picker create row', () => {
  it('shows alone for a filter with no match', () => {
    const el = mount(never);
    type(el, 'flaky');
    expect(createRow(el)?.textContent).toContain("Create label 'flaky'");
    expect(createRow(el)?.getAttribute('aria-label')).toBe('Create label flaky');
    expect(el.querySelectorAll('.picker-row').length).toBe(2);
  });

  it('shows after the matches for a partial match', () => {
    const el = mount(never);
    type(el, 'fla');
    const rows = [...el.querySelectorAll('.picker-row')];
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('flaky-ci');
    expect(rows[1]).toBe(createRow(el));
  });

  it('is hidden for an exact case-insensitive match', () => {
    const el = mount(never);
    type(el, 'Flaky-CI');
    expect(createRow(el)).toBeNull();
  });

  it('is hidden for an empty or blank filter', () => {
    const el = mount(never);
    expect(createRow(el)).toBeNull();
    type(el, '   ');
    expect(createRow(el)).toBeNull();
  });

  it('is hidden when the picker has no create handler', () => {
    const el = mount();
    type(el, 'flaky');
    expect(createRow(el)).toBeNull();
  });

  it('Enter on the focused create row creates and does not apply', async () => {
    const create = vi.fn(async (name: string) => item(name));
    const onApply = vi.fn();
    const el = mount(create, onApply);
    type(el, 'zzz');
    await act(async () => {
      el.querySelector('.picker-filter')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(create).toHaveBeenCalledWith('zzz');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('checks the new label, clears the filter and focuses it', async () => {
    const el = mount(async (name) => item(name));
    type(el, 'zzz');
    await act(async () => {
      el.querySelector('.picker-filter')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(createRow(el)).toBeNull();
    expect(el.querySelector<HTMLInputElement>('.picker-filter')?.value).toBe('');
    const rows = [...el.querySelectorAll('.picker-row')];
    expect(rows[2]?.className).toContain('is-focus');
    expect(rows[2]?.querySelector<HTMLInputElement>('input')?.checked).toBe(true);
    expect(el.querySelector('.picker-note')?.textContent).toContain('1 will be set.');
  });

  it('Enter on a match applies as before', () => {
    const create = vi.fn(async (name: string) => item(name));
    const onApply = vi.fn();
    const el = mount(create, onApply);
    type(el, 'fla');
    key(el, 'Enter');
    expect(onApply).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows the busy row and ignores a second click while creating', () => {
    const create = vi.fn(never);
    const el = mount(create);
    type(el, 'zzz');
    key(el, 'Enter');
    const row = createRow(el);
    expect(row?.textContent).toContain('Creating...');
    expect(row?.getAttribute('aria-busy')).toBe('true');
    expect(row?.querySelector('.spinner')).not.toBeNull();
    act(() => row?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('renders the error and clears it on the next keystroke', async () => {
    const el = mount(async () => {
      throw new Error('resource not accessible by integration');
    });
    type(el, 'zzz');
    await act(async () => {
      el.querySelector('.picker-filter')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('Could not create label: resource not accessible by integration');
    expect(createRow(el)?.textContent).toContain("Create label 'zzz'");
    type(el, 'zzzz');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
