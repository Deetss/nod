// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PickerItem } from '../web/issues/picker-state';
import { changeCount } from '../web/issues/picker-state';
import { PhonePicker, type PhonePickerProps } from '../web/phone/PhonePicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

const item = (name: string): PickerItem => ({ value: name, text: name, node: createElement('span', null, name) });
const LABELS = [item('flaky-ci'), item('bug'), item('checkout')];

function mount(over: Partial<PhonePickerProps> = {}): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(PhonePicker, {
        title: 'Labels',
        sub: 'acme-web #42',
        filterPlaceholder: 'Filter labels',
        items: LABELS,
        initial: new Set(['bug']),
        onApply: () => {},
        onClose: () => {},
        depth: 1,
        covered: false,
        ...over,
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
  const box = el.querySelector<HTMLInputElement>('.ph-pk-input');
  if (!box) throw new Error('no filter box');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.ph-pk-row:not(.ph-pk-create)')];
const rowNamed = (el: HTMLElement, name: string) => rows(el).find((r) => r.getAttribute('aria-label')?.startsWith(`${name},`));
const click = (e: Element | null | undefined) => act(() => (e as HTMLElement).click());
const applyBtn = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.ph-btn.is-primary');

describe('changeCount', () => {
  it('counts a single choice swap once', () => {
    expect(changeCount(new Set(['b']), new Set(['a']), true)).toBe(1);
    expect(changeCount(new Set(['b']), new Set(['a']))).toBe(2);
  });
});

describe('PhonePicker', () => {
  it('filters rows by text', () => {
    const el = mount();
    type(el, 'ch');
    expect(rows(el).map((r) => r.textContent)).toEqual(['checkout']);
  });

  it('offers a create row for a new name and none for an exact match', () => {
    const create = vi.fn(async (n: string) => item(n));
    const el = mount({ create });
    type(el, 'fla');
    expect(el.querySelector('.ph-pk-create')?.textContent).toContain("Create label 'fla'");
    type(el, 'bug');
    expect(el.querySelector('.ph-pk-create')).toBeNull();
  });

  it('creates a label and checks it', async () => {
    const create = vi.fn(async (n: string) => item(n));
    const el = mount({ create });
    type(el, 'flaky');
    await act(async () => (el.querySelector('.ph-pk-create') as HTMLElement).click());
    expect(create).toHaveBeenCalledWith('flaky');
    expect(rows(el).at(-1)?.getAttribute('aria-selected')).toBe('true');
    expect(applyBtn(el)?.textContent).toBe('Apply (1 change)');
  });

  it('shows the create error inline', async () => {
    const create = vi.fn(async () => {
      throw new Error('Validation Failed');
    });
    const el = mount({ create });
    type(el, 'zzz');
    await act(async () => (el.querySelector('.ph-pk-create') as HTMLElement).click());
    expect(el.querySelector('.ph-pk-inline')?.textContent).toContain('Could not create label: Validation Failed');
  });

  it('counts changes, captions them and applies the picked set', () => {
    const onApply = vi.fn();
    const el = mount({ onApply });
    expect(applyBtn(el)?.textContent).toBe('Apply');
    expect(applyBtn(el)?.disabled).toBe(true);
    click(rowNamed(el, 'flaky-ci'));
    click(rowNamed(el, 'bug'));
    expect(applyBtn(el)?.textContent).toBe('Apply (2 changes)');
    expect(rowNamed(el, 'flaky-ci')?.querySelector('.ph-pk-cap')?.textContent).toBe('add');
    expect(rowNamed(el, 'bug')?.querySelector('.ph-pk-cap')?.textContent).toBe('remove');
    click(applyBtn(el));
    expect([...(onApply.mock.calls[0]?.[0] as Set<string>)].sort()).toEqual(['flaky-ci']);
  });

  it('milestone is a radio group where a tap on the chosen row keeps it', () => {
    const ms = [{ value: '', text: 'No milestone', node: createElement('span', null, 'No milestone') }, item('v2.4 launch')];
    const onApply = vi.fn();
    const el = mount({ items: ms, initial: new Set(['']), single: true, title: 'Milestone', onApply });
    expect(el.querySelector('[role=radiogroup]')).not.toBeNull();
    click(rows(el)[0]);
    expect(rows(el)[0]?.getAttribute('aria-checked')).toBe('true');
    click(rows(el)[1]);
    expect(applyBtn(el)?.textContent).toBe('Apply (1 change)');
    expect(rows(el)[1]?.querySelector('.ph-pk-cap')?.textContent).toBe('set');
    click(applyBtn(el));
    expect([...(onApply.mock.calls[0]?.[0] as Set<string>)]).toEqual(['v2.4 launch']);
  });

  it('turns unchecked rows off at the limit', () => {
    const el = mount({ items: [item('a'), item('b')], initial: new Set(['a']), limit: 1 });
    expect(rows(el)[1]?.querySelector('.ph-pk-cap')?.textContent).toBe('Limit reached');
    click(rows(el)[1]);
    expect(rows(el)[1]?.getAttribute('aria-selected')).toBe('false');
  });

  it('shows the busy state and refuses to close', () => {
    const onClose = vi.fn();
    const el = mount({ busy: true, initial: new Set(), onClose });
    expect(applyBtn(el)?.textContent).toBe('Applying...');
    expect(applyBtn(el)?.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector<HTMLButtonElement>('.ph-pk-cancel')?.disabled).toBe(true);
    click(el.querySelector('.ph-iconbtn'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
