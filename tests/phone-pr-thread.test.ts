// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrDetail, PrSummary, PrThreadItem } from '../shared/types';
import { PhonePrSheet } from '../web/phone/PhonePrSheet';
import type { PhonePr } from '../web/phone/usePhonePr';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const THREAD: PrThreadItem[] = [
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

const PR = {
  id: 'p1',
  repo: 'acme-web',
  number: 7,
  title: 'Synthetic change',
  author: 'dev-a',
  createdAt: '2026-01-01T09:00:00Z',
  isDraft: false,
  ci: 'pass',
  reviewStatus: 'Review requested',
} as unknown as PrSummary;

const DATA = {
  detail: { data: { thread: THREAD, checks: [], commits: [], commitTotal: 0, newCommits: 0 } as unknown as PrDetail },
  diff: {},
  files: [],
  toggleViewed: vi.fn(),
  reload: vi.fn(),
} as unknown as PhonePr;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function mount(data: PhonePr = DATA): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      createElement(PhonePrSheet, {
        pr: PR,
        viewer: 'me',
        data,
        writesOff: false,
        busy: false,
        depth: 0,
        covered: false,
        onClose: vi.fn(),
        onFile: vi.fn(),
        onMore: vi.fn(),
        onApprove: vi.fn(),
        onComment: vi.fn(),
      }),
    ),
  );
  return host;
}

function threadTab(el: HTMLElement): HTMLButtonElement {
  const tab = [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((t) => t.textContent?.startsWith('Thread'));
  if (!tab) throw new Error('no Thread tab');
  return tab;
}

describe('PhonePrSheet thread tab', () => {
  it('shows the item count on the tab', () => {
    expect(threadTab(mount()).textContent).toBe('Thread 3');
  });

  it('shows the empty state when the detail loaded without a thread', () => {
    const loaded = { ...DATA, detail: { data: { checks: [], commits: [], commitTotal: 0, newCommits: 0 } } } as unknown as PhonePr;
    const el = mount(loaded);
    expect(threadTab(el).textContent).toBe('Thread 0');
    act(() => threadTab(el).click());
    expect(el.textContent).toContain('No conversation yet.');
    expect(el.textContent).not.toContain('Loading');
  });

  it('shows Loading while the detail is in flight', () => {
    const loading = { ...DATA, detail: {} } as unknown as PhonePr;
    const el = mount(loading);
    act(() => threadTab(el).click());
    expect(el.textContent).toContain('Loading');
  });

  it('renders the items and review state words', () => {
    const el = mount();
    act(() => threadTab(el).click());
    const text = el.textContent ?? '';
    expect(text).toContain('Looks odd');
    expect(text).toContain('bob requested changes');
    expect(text).toContain('Please fix');
    expect(text).toContain('app/model.rb:12');
    expect(text).toContain('Resolved');
    expect(text).not.toContain('Rename');
  });
});
