// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { PrThreadItem } from '../shared/types';
import { ThreadCard } from '../web/DetailBody';
import { PrThreadList } from '../web/PrThread';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS: PrThreadItem[] = [
  {
    kind: 'comment',
    at: '2026-01-01T10:00:00Z',
    comment: { id: 'C1', author: 'alice', createdAt: '2026-01-01T10:00:00Z', bodyHtml: '<p>Looks odd</p>' },
  },
  {
    kind: 'review',
    at: '2026-01-01T11:00:00Z',
    id: 'R1',
    actor: 'bob',
    verdict: 'changes',
    bodyHtml: '<p>Please fix</p>',
  },
  {
    kind: 'thread',
    at: '2026-01-01T12:00:00Z',
    id: 'T1',
    path: 'app/model.rb',
    line: 12,
    resolved: true,
    comments: [{ id: 'C2', author: 'carol', createdAt: '2026-01-01T12:00:00Z', bodyHtml: '<p>Rename</p>' }],
  },
];

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function mount(): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(PrThreadList, { items: ITEMS })));
  return host;
}

describe('ThreadCard', () => {
  it('shows the item count and the items', () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(ThreadCard, { items: ITEMS })));
    const card = host.querySelector('section[aria-label="Thread"]');
    expect(card?.querySelector('.card-h-sub')?.textContent).toBe('3');
    expect(card?.textContent).toContain('Please fix');
  });

  it('renders nothing without items', () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(createElement(ThreadCard, { items: [] })));
    expect(host.querySelector('section')).toBeNull();
  });
});

describe('PrThreadList', () => {
  it('renders comments, review bodies and thread comments', () => {
    const text = mount().textContent ?? '';
    expect(text).toContain('Looks odd');
    expect(text).toContain('Please fix');
    expect(text).toContain('Rename');
  });

  it('shows the review state words', () => {
    expect(mount().textContent).toContain('bob requested changes');
  });

  it('shows a thread file, line and Resolved tag', () => {
    const text = mount().textContent ?? '';
    expect(text).toContain('app/model.rb:12');
    expect(text).toContain('Resolved');
  });
});
