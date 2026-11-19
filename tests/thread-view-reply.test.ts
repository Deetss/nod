// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrThreadItem } from '../shared/types';
import { GroupedThread } from '../web/inline/group-threads';
import { ThreadView } from '../web/inline/ThreadView';

const replyToThread = vi.fn();

vi.mock('../web/api', () => ({
  api: {
    replyToThread: (...a: unknown[]) => replyToThread(...a),
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

const onPosted = vi.fn();
let root: Root | undefined;
let host: HTMLElement | undefined;

beforeEach(() => {
  replyToThread.mockReset();
  onPosted.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function mount(g: GroupedThread): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(ThreadView, { g, host: { repo: 'acme-web', number: 42, onPosted } })));
  return host;
}

function button(el: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.replace(/x$/, '').trim() === label);
}

const click = async (b: HTMLButtonElement | undefined) => {
  if (!b) throw new Error('missing button');
  await act(async () => b.click());
};

describe('ThreadView optimistic reply', () => {
  it('shows the reply in the thread while it posts', async () => {
    // Make the replyToThread return a pending promise (never resolves)
    const neverResolves = new Promise(() => {});
    replyToThread.mockReturnValue(neverResolves);

    const openThread: PrThreadItem = thread('a', false);
    const g: GroupedThread = {
      thread: openThread,
      draft: false,
      resolved: false,
      outdated: false,
    };
    const el = mount(g);

    // Wait for the textarea to be present
    let textarea: HTMLTextAreaElement | null = null;
    await act(async () => {
      for (let i = 0; i < 20; i++) {
        const textareas = el.querySelectorAll('textarea');
        for (const ta of textareas) {
          const label = ta.getAttribute('aria-label');
          if (label && label.startsWith('Reply on')) {
            textarea = ta as HTMLTextAreaElement;
            return;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    });
    if (!textarea) {
      throw new Error('Textarea not found. Rendered HTML: ' + el.innerHTML);
    }

    // Set the textarea's value using the native value setter and dispatch an input event
    act(() => {
      // Use the native value setter to set the textarea's value
      Object.defineProperty(textarea, 'value', {
        value: 'Hello world',
        writable: true,
      });
      // Dispatch an input event to simulate user typing
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Click the Reply button
    const replyButton = button(el, 'Reply');
    if (!replyButton) {
      throw new Error('Reply button not found. Rendered HTML: ' + el.innerHTML);
    }
    await click(replyButton);

    // While the reply is posting, we should see the sent comment with "Sending..."
    expect(el.textContent).toContain('Sending...');
    expect(el.textContent).toContain('Hello world');

    // The textarea should be cleared
    expect(textarea.value).toBe('');
  });
});