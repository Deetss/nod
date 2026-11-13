// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrSummary } from '../shared/types';
import type { ActionKind } from '../web/DetailBody';
import { ActionDialog } from '../web/Dialogs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

const PR = { repo: 'acme-web', number: 42, title: 'Add rate-limit headers' } as PrSummary;

function mount(kind: ActionKind, busy: boolean, onConfirm = () => {}, onCancel = () => {}): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(createElement(ActionDialog, { kind, pr: PR, methodLabel: 'Squash and merge', busy, onConfirm, onCancel, onUploadError: () => {} }));
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const LABELS: Array<[ActionKind, string]> = [
  ['merge', 'Enabling auto-merge...'],
  ['approve', 'Approving...'],
  ['admin', 'Merging...'],
  ['request', 'Requesting changes...'],
  ['comment', 'Commenting...'],
  ['ready', 'Marking ready...'],
];

describe('ActionDialog busy state', () => {
  it.each(LABELS)('%s shows its busy label with a spinner', (kind, label) => {
    const el = mount(kind, true);
    const btn = el.querySelector<HTMLButtonElement>('.dialog-actions button:last-child');
    expect(btn?.textContent).toBe(label);
    expect(btn?.querySelector('.spinner')?.getAttribute('aria-hidden')).toBe('true');
    expect(btn?.getAttribute('aria-busy')).toBe('true');
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
    expect(btn?.disabled).toBe(false);
    expect(btn?.className).toContain(kind === 'admin' ? 'btn-danger' : 'btn-primary');
    expect(el.textContent).not.toContain('Working');
  });

  it('disables Cancel and ignores Escape while busy', () => {
    const onCancel = vi.fn();
    const el = mount('merge', true, () => {}, onCancel);
    expect(el.querySelector<HTMLButtonElement>('.dialog-actions button')?.disabled).toBe(true);
    act(() => {
      el.querySelector('.dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows the idle label and no busy attributes at rest', () => {
    const el = mount('merge', false);
    const btn = el.querySelector<HTMLButtonElement>('.dialog-actions button:last-child');
    expect(btn?.textContent).toBe('Enable auto-merge');
    expect(btn?.hasAttribute('aria-busy')).toBe(false);
  });
});
