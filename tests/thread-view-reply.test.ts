// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupedThread, ThreadItem } from '../web/inline/group-threads';
import { ThreadView } from '../web/inline/ThreadView';

const replyToThread = vi.fn();

vi.mock('../web/api', () => ({
  api: {
    replyToThread: (...a: unknown[]) => replyToThread(...a),
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const thread: ThreadItem = {
  kind: 'thread',
  at: '2026-01-01T12:00:00Z',
  id: 'a',
  threadId: 'T_a',
  path: 'db/seeds.rb',
  line: 22,
  resolved: false,
  comments: [{ id: 'C_a', author: 'build-bot', createdAt: '2026-01-01T12:00:00Z', bodyHtml: '<p>Body a</p>' }],
};

let root: Root | undefined;
let el: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
});

function mount(g: GroupedThread): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  el = host;
  root = createRoot(host);
  act(() => root!.render(createElement(ThreadView, { g, host: { repo: 'acme-web', number: 42, onPosted: vi.fn() } })));
  return host;
}

/** Sets the value the way a keystroke does, so React's change tracking sees it. */
function type(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('ThreadView optimistic reply', () => {
  it('shows the reply in the thread while it posts', async () => {
    replyToThread.mockReturnValue(new Promise(() => {}));
    const view = mount({ thread, draft: false, resolved: false, outdated: false });

    const textarea = view.querySelector<HTMLTextAreaElement>('textarea[aria-label^="Reply on"]');
    if (!textarea) throw new Error('missing reply box');
    type(textarea, 'Hello world');

    const reply = [...view.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Reply');
    if (!reply) throw new Error('missing Reply button');
    await act(async () => reply.click());

    expect(view.textContent).toContain('Sending...');
    expect(view.textContent).toContain('Hello world');
    expect(textarea.value).toBe('');
  });
});
