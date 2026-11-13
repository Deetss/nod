// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrThreadItem } from '../shared/types';
import { PrThreadList } from '../web/PrThread';

const resolveThread = vi.fn();
const unresolveThread = vi.fn();

vi.mock('../web/api', () => ({
  api: {
    resolveThread: (...a: unknown[]) => resolveThread(...a),
    unresolveThread: (...a: unknown[]) => unresolveThread(...a),
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function thread(id: string, resolved: boolean): PrThreadItem {
  return {
    kind: 'thread',
    at: '2026-01-01T12:00:00Z',
    id,
    threadId: `T_${id}`,
    path: 'db/seeds.rb',
    line: 22,
    resolved,
    comments: [{ id: `C_${id}`, author: 'build-bot', createdAt: '2026-01-01T12:00:00Z', bodyHtml: `<p>Body ${id}</p>` }],
  };
}

const onChanged = vi.fn();
let root: Root | undefined;
let host: HTMLElement | undefined;

beforeEach(() => {
  resolveThread.mockReset().mockResolvedValue({ ok: true, message: 'Thread resolved' });
  unresolveThread.mockReset().mockResolvedValue({ ok: true, message: 'Thread reopened' });
  onChanged.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function mount(items: PrThreadItem[], phone = false): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(PrThreadList, { items, phone, host: { repo: 'acme-web', number: 7, onChanged } })));
  return host;
}

function button(el: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.replace(/x$/, '').trim() === label);
}

const click = async (b: HTMLButtonElement | undefined) => {
  if (!b) throw new Error('missing button');
  await act(async () => b.click());
};

describe('resolve threads on the timeline', () => {
  it('shows an open thread expanded with an Open pill and Resolve', () => {
    const el = mount([thread('a', false)]);
    expect(el.textContent).toContain('Open');
    expect(el.textContent).toContain('Body a');
    expect(button(el, 'Resolve')).toBeDefined();
    expect(button(el, 'Expand')).toBeUndefined();
  });

  it('collapses a resolved thread to its path row with a hidden count', () => {
    const el = mount([thread('a', true)]);
    expect(el.textContent).toContain('Resolved');
    expect(el.textContent).toContain('1 comment hidden');
    expect(el.textContent).not.toContain('Body a');
    expect(button(el, 'Expand')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('Expand shows the card with Unresolve and Collapse, and Collapse hides it again', async () => {
    const el = mount([thread('a', true)]);
    await click(button(el, 'Expand'));
    expect(el.textContent).toContain('Body a');
    expect(button(el, 'Unresolve')).toBeDefined();
    expect(el.textContent).not.toContain('hidden');
    await click(button(el, 'Collapse'));
    expect(el.textContent).not.toContain('Body a');
    expect(button(el, 'Expand')).toBeDefined();
  });

  it('Resolve calls the resolve api for the thread and refetches', async () => {
    const el = mount([thread('a', false)]);
    await click(button(el, 'Resolve'));
    expect(resolveThread).toHaveBeenCalledWith('acme-web', 7, 'T_a');
    expect(unresolveThread).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('Unresolve calls the unresolve api for the thread and refetches', async () => {
    const el = mount([thread('a', true)]);
    await click(button(el, 'Expand'));
    await click(button(el, 'Unresolve'));
    expect(unresolveThread).toHaveBeenCalledWith('acme-web', 7, 'T_a');
    expect(resolveThread).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('disables the button and ignores a second press while busy', async () => {
    let finish: (v: { ok: boolean; message: string }) => void = () => undefined;
    resolveThread.mockReturnValue(new Promise((r) => (finish = r)));
    const el = mount([thread('a', false)]);
    await click(button(el, 'Resolve'));
    const busy = button(el, 'Resolving...');
    expect(busy?.disabled).toBe(true);
    await act(async () =>
      el.querySelector('#tl-a')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })),
    );
    expect(resolveThread).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, message: '' }));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('shows the failure message and Retry repeats the call', async () => {
    resolveThread.mockResolvedValueOnce({ ok: false, message: 'GitHub API error 502' });
    const el = mount([thread('a', false)]);
    await click(button(el, 'Resolve'));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not resolve thread: GitHub API error 502');
    expect(onChanged).not.toHaveBeenCalled();
    await click(button(el, 'Retry'));
    expect(resolveThread).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('shows a thrown request error as a failure', async () => {
    unresolveThread.mockRejectedValueOnce(new Error('offline'));
    const el = mount([thread('a', true)]);
    await click(button(el, 'Expand'));
    await click(button(el, 'Unresolve'));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Could not unresolve thread: offline');
  });

  it('x resolves the thread when focus is inside its card', async () => {
    const el = mount([thread('a', false)]);
    await act(async () =>
      el.querySelector('.tl-card')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })),
    );
    expect(resolveThread).toHaveBeenCalledWith('acme-web', 7, 'T_a');
  });

  it('x does not resolve a different thread', async () => {
    const el = mount([thread('a', false), thread('b', false)]);
    await act(async () =>
      el.querySelector('#tl-b')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })),
    );
    expect(resolveThread).toHaveBeenCalledTimes(1);
    expect(resolveThread).toHaveBeenCalledWith('acme-web', 7, 'T_b');
  });

  it('desktop shows the x key chip, phone does not and hides the count', () => {
    const desktop = mount([thread('a', false), thread('b', true)]);
    expect(desktop.querySelector('.tl-actions .kbd')?.textContent).toBe('x');
    expect(desktop.textContent).toContain('1 comment hidden');
    act(() => root?.unmount());
    desktop.remove();
    const phone = mount([thread('a', false), thread('b', true)], true);
    expect(phone.querySelector('.kbd')).toBeNull();
    expect(phone.textContent).not.toContain('hidden');
  });
});
