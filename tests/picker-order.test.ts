// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Picker } from '../web/issues/Picker';
import { bulkPickerOrder, orderPickerItems, type PickerItem } from '../web/issues/picker-state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (name: string): PickerItem => ({ value: name, text: name, node: createElement('span', null, name) });
const values = (items: readonly PickerItem[]) => items.map((i) => i.value);
const ITEMS = ['alpha', 'bug', 'chore', 'docs', 'enhancement', 'flaky'].map(item);

describe('orderPickerItems', () => {
  it('puts checked first, mixed second, the rest last', () => {
    const out = orderPickerItems(ITEMS, { checked: new Set(['docs', 'bug']), mixed: new Set(['flaky']) });
    expect(values(out)).toEqual(['bug', 'docs', 'flaky', 'alpha', 'chore', 'enhancement']);
  });

  it('keeps the existing order within each group', () => {
    const out = orderPickerItems(ITEMS, { checked: new Set(['flaky', 'alpha']) });
    expect(values(out)).toEqual(['alpha', 'flaky', 'bug', 'chore', 'docs', 'enhancement']);
  });

  it('is a no-op when nothing is checked or mixed', () => {
    expect(values(orderPickerItems(ITEMS, { checked: new Set() }))).toEqual(values(ITEMS));
  });

  it('ignores checked values that are not in the list', () => {
    expect(values(orderPickerItems(ITEMS, { checked: new Set(['gone']) }))).toEqual(values(ITEMS));
  });
});

describe('bulkPickerOrder', () => {
  it('marks a value checked when every issue has it and mixed when some do', () => {
    const order = bulkPickerOrder([
      ['bug', 'docs'],
      ['bug', 'flaky'],
      ['bug'],
    ]);
    expect([...order.checked]).toEqual(['bug']);
    expect([...order.mixed ?? []].sort()).toEqual(['docs', 'flaky']);
  });

  it('counts a value once per issue even if listed twice', () => {
    const order = bulkPickerOrder([['bug', 'bug'], ['docs']]);
    expect([...order.checked]).toEqual([]);
    expect([...order.mixed ?? []].sort()).toEqual(['bug', 'docs']);
  });

  it('returns empty sets for no issues', () => {
    const order = bulkPickerOrder([]);
    expect(order.checked.size).toBe(0);
    expect(order.mixed?.size).toBe(0);
  });
});

describe('Picker row order', () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = undefined;
    host = undefined;
  });

  function mount(ranked?: { checked: ReadonlySet<string>; mixed?: ReadonlySet<string> }): HTMLElement {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        createElement(Picker, {
          title: 'Labels',
          filterPlaceholder: 'Filter labels',
          items: ITEMS,
          initial: new Set(['docs']),
          ranked,
          anchor: 'sidebar',
          onApply: () => {},
          onCancel: () => {},
        }),
      );
    });
    return host;
  }

  const nameOf = (row: Element) => row.querySelector(':scope > span:not(.picker-act)')?.textContent;
  const rowNames = (el: HTMLElement) => [...el.querySelectorAll('.picker-row')].map(nameOf);
  const toggle = (el: HTMLElement, name: string) => {
    const row = [...el.querySelectorAll<HTMLLabelElement>('.picker-row')].find((r) => nameOf(r) === name);
    const box = row?.querySelector<HTMLInputElement>('input[type=checkbox]');
    if (!box) throw new Error(`no row ${name}`);
    act(() => box.click());
  };
  const filter = (el: HTMLElement, text: string) => {
    const box = el.querySelector<HTMLInputElement>('.picker-filter');
    if (!box) throw new Error('no filter box');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('lists checked rows first when the picker opens', () => {
    const el = mount({ checked: new Set(['docs', 'flaky']) });
    expect(rowNames(el)).toEqual(['docs', 'flaky', 'alpha', 'bug', 'chore', 'enhancement']);
  });

  it('keeps the order when a row is toggled', () => {
    const el = mount({ checked: new Set(['docs']) });
    const before = rowNames(el);
    toggle(el, 'alpha');
    toggle(el, 'docs');
    expect(rowNames(el)).toEqual(before);
  });

  it('applies the same order to filtered rows', () => {
    // Filter "e" matches chore and enhancement; enhancement is checked, so it leads.
    const el = mount({ checked: new Set(['enhancement']), mixed: new Set(['chore']) });
    filter(el, 'e');
    expect(rowNames(el)).toEqual(['enhancement', 'chore']);
  });
});
