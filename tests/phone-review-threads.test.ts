// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiffLine, PrThreadItem } from '../shared/types';
import { HunkLines } from '../web/DiffFileView';
import type { ComposerState } from '../web/inline/composer-state';
import type { FileThreads, ThreadItem } from '../web/inline/group-threads';
import { PrThreadList } from '../web/PrThread';
import { PhoneReplySheet } from '../web/phone/PhoneReplySheet';

const mocks = vi.hoisted(() => ({ reply: vi.fn(async (): Promise<{ ok: boolean; message: string }> => ({ ok: true, message: 'ok' })) }));
vi.mock('../web/api', () => ({ api: { replyToThread: mocks.reply } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  mocks.reply.mockClear();
});

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

const thread: ThreadItem = {
  kind: 'thread',
  at: '2026-11-16T17:00:00Z',
  id: 'T1',
  threadId: 'PRRT_1',
  path: 'app/models/order.rb',
  line: 8,
  resolved: false,
  comments: [{ id: 'C1', author: 'riley-k', createdAt: '2026-11-16T17:00:00Z', bodyHtml: '<p>Rename the class too?</p>' }],
};

describe('Reply on every thread', () => {
  it('shows Reply beside Resolve when the list takes onReply, and hands back the thread', () => {
    const onReply = vi.fn();
    const items: PrThreadItem[] = [thread];
    const el = render(createElement(PrThreadList, { items, phone: true, host: { repo: 'acme-co/orders-api', number: 365, onChanged: () => undefined }, onReply }));
    act(() => button(el, 'Reply').click());
    expect(onReply).toHaveBeenCalledWith(thread);
    expect(button(el, 'Resolve')).toBeTruthy();
  });

  it('shows no Reply without onReply, as on the desktop', () => {
    const el = render(createElement(PrThreadList, { items: [thread], phone: true, host: { repo: 'r/x', number: 1, onChanged: () => undefined } }));
    expect(button(el, 'Reply')).toBeUndefined();
  });
});

describe('PhoneReplySheet', () => {
  const type = (el: HTMLElement, text: string) => {
    const a = el.querySelector('textarea') as HTMLTextAreaElement;
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      set.call(a, text);
      a.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('titles the sheet by the first author and posts to the thread', async () => {
    const onDone = vi.fn();
    const el = render(createElement(PhoneReplySheet, { repo: 'acme-co/orders-api', number: 365, thread, onDone, onCancel: () => undefined }));
    expect(el.textContent).toContain('Reply to riley-k');
    expect(el.textContent).toContain('app/models/order.rb:8');
    type(el, 'Sure, renaming it now.');
    await act(async () => button(el, 'Reply').click());
    expect(mocks.reply).toHaveBeenCalledWith('acme-co/orders-api', 365, 'PRRT_1', 'Sure, renaming it now.');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('keeps the text and offers Retry when the reply fails', async () => {
    mocks.reply.mockResolvedValueOnce({ ok: false, message: 'GitHub returned 422' });
    const el = render(createElement(PhoneReplySheet, { repo: 'r/x', number: 1, thread, onDone: () => undefined, onCancel: () => undefined }));
    type(el, 'Sure.');
    await act(async () => button(el, 'Reply').click());
    expect(el.textContent).toContain('Not posted: GitHub returned 422');
    expect(button(el, 'Retry')).toBeTruthy();
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Sure.');
  });
});

describe('renderThreads', () => {
  it('draws a line threads through the given renderer instead of the full cards', () => {
    const lines: DiffLine[] = [{ kind: 'add', newNo: 8, text: 'class Order' }];
    const threads: FileThreads = { path: 'a.rb', fileLevel: [], lines: [{ line: 8, side: 'RIGHT', threads: [{ thread, draft: false, resolved: false, outdated: false }] }] };
    const state: ComposerState = { status: 'closed', text: '', drafts: {} };
    const el = render(
      createElement(HunkLines, {
        lines,
        yaml: false,
        comment: {
          state,
          onOpenLine: () => undefined,
          onOpenFile: () => undefined,
          renderComposer: () => null,
          threads,
          host: { repo: 'r/x', number: 1, onPosted: () => undefined },
          renderThreads: (list) => list.map((g) => createElement('span', { key: g.thread.id, className: 'pill' }, g.thread.id)),
        },
      }),
    );
    expect(el.querySelector('.pill')?.textContent).toBe('T1');
    expect(el.querySelector('.thread-card')).toBeNull();
  });
});
