// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Finding } from '../shared/findings';
import type { ThreadItem } from '../shared/fix-comments';
import { BulkDialog } from '../web/FindingParts';
import type { BulkRow } from '../web/useFindings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const thread = (n: number): ThreadItem =>
  ({
    kind: 'thread',
    at: '2026-11-15T09:00:00Z',
    id: `T${n}`,
    threadId: `PRRT_${n}`,
    path: `src/file_${n}.ts`,
    line: 10 + n,
    resolved: false,
    isOutdated: false,
    comments: [{ id: `C${n}`, author: 'review-bot', createdAt: '2026-11-15T09:00:00Z', bodyHtml: '<p>x</p>', body: 'Remove it.', url: `https://example.test/r${n}` }],
  }) as ThreadItem;
const row = (n: number, checked = true): BulkRow => ({ finding: { thread: thread(n), severity: 'blocker', text: 'Remove it.' } as Finding, checked });

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

function show(phone: boolean) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const host = document.createElement('div');
  if (phone) host.className = 'phone';
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(createElement(BulkDialog, { rows: [row(1), row(2, false)], busy: false, phone, onToggle: vi.fn(), onCancel, onConfirm })));
  return { host, onConfirm, onCancel };
}

const button = (text: RegExp): HTMLButtonElement =>
  [...document.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '')) as HTMLButtonElement;

describe('Hand all confirm', () => {
  it('opens as an AppDialog on desktop with the primary focused', () => {
    show(false);
    expect(document.querySelector('.app-dialog.finding-bulk')).not.toBeNull();
    expect(document.activeElement).toBe(button(/Hand 1 to bot/));
  });

  it('confirms from the primary and cancels from Cancel', () => {
    const { onConfirm, onCancel } = show(false);
    act(() => button(/Hand 1 to bot/).click());
    act(() => button(/^Cancel/).click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('is a bottom sheet on the phone, mounted on the phone root', () => {
    const { host, onConfirm } = show(true);
    expect(document.querySelector('.app-dialog')).toBeNull();
    expect(host.querySelector('.ph-scrim .finding-bulk.is-phone')).not.toBeNull();
    expect(host.querySelectorAll('.finding-bulk-row')).toHaveLength(2);
    act(() => button(/Hand 1 to bot/).click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
