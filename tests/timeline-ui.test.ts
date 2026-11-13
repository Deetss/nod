// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { IssueComment } from '../shared/issue-types';
import type { PrThreadItem } from '../shared/types';
import { IssueThread, type ThreadItem } from '../web/issues/IssueThread';
import { PrThreadList } from '../web/PrThread';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const comment = (id: string, over: Partial<IssueComment> = {}): IssueComment => ({
  id,
  author: 'build-bot',
  createdAt: '2026-01-01T10:00:00Z',
  bodyHtml: `<p>body of ${id}</p>`,
  ...over,
});

const hiddenItems = (reason: string): PrThreadItem[] => [
  { kind: 'comment', at: '2026-01-01T10:00:00Z', comment: comment('C1', { minimized: { reason } }) },
];

const button = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.tl-hidden-btn');

describe('hidden comment row', () => {
  it('is collapsed by default: one row, no card, no body in the page', () => {
    const el = render(createElement(PrThreadList, { items: hiddenItems('duplicate') }));
    expect(el.querySelector('.tl-hidden-text')?.textContent).toBe('This comment was marked as duplicate');
    expect(el.querySelector('.tl-card')).toBeNull();
    expect(el.textContent).not.toContain('body of C1');
    const btn = button(el);
    expect(btn?.textContent).toBe('Show comment');
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
    expect(btn?.getAttribute('aria-label')).toBe('Show comment. This comment was marked as duplicate');
  });

  it('Show reveals the card and Hide puts it away, with aria-expanded following', () => {
    const el = render(createElement(PrThreadList, { items: hiddenItems('duplicate') }));
    const btn = button(el);
    act(() => btn?.click());
    expect(btn?.getAttribute('aria-expanded')).toBe('true');
    expect(btn?.textContent).toBe('Hide comment');
    expect(btn?.getAttribute('aria-label')).toBe('Hide comment');
    const card = el.querySelector('.tl-card');
    expect(card?.textContent).toContain('body of C1');
    expect(card?.id).toBe(btn?.getAttribute('aria-controls'));
    act(() => btn?.click());
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.tl-card')).toBeNull();
  });

  it('keeps focus on the button after toggling', () => {
    const el = render(createElement(PrThreadList, { items: hiddenItems('spam') }));
    const btn = button(el);
    btn?.focus();
    act(() => btn?.click());
    expect(document.activeElement).toBe(btn);
  });

  it('puts the reason pill on the expanded card, attention for outdated', () => {
    const el = render(createElement(PrThreadList, { items: hiddenItems('outdated') }));
    act(() => button(el)?.click());
    const pill = el.querySelector('.tl-card .tl-pill');
    expect(pill?.textContent).toBe('Outdated');
    expect(pill?.className).toContain('tl-pill-attention');
  });

  it.each([
    ['abuse', 'This comment was marked as abuse'],
    ['duplicate', 'This comment was marked as duplicate'],
    ['off-topic', 'This comment was marked as off-topic'],
    ['outdated', 'This comment was marked as outdated'],
    ['resolved', 'This comment was marked as resolved'],
    ['spam', 'This comment was marked as spam'],
    ['SPAM', 'This comment was marked as spam'],
    ['brand-new-reason', 'This comment was hidden'],
    ['', 'This comment was hidden'],
  ])('reason %j reads %s', (reason, sentence) => {
    const el = render(createElement(PrThreadList, { items: hiddenItems(reason) }));
    expect(el.querySelector('.tl-hidden-text')?.textContent).toBe(sentence);
  });

  it('words a hidden review the same way', () => {
    const items: PrThreadItem[] = [
      {
        kind: 'review',
        at: '2026-01-01T10:00:00Z',
        id: 'R1',
        actor: 'acme-dev',
        verdict: 'commented',
        bodyHtml: '<p>nit</p>',
        minimized: { reason: 'resolved' },
      },
    ];
    const el = render(createElement(PrThreadList, { items }));
    expect(el.querySelector('.tl-hidden-text')?.textContent).toBe('This review was marked as resolved');
    expect(button(el)?.textContent).toBe('Show review');
  });

  it('hides a comment inside a file review thread too', () => {
    const items: PrThreadItem[] = [
      {
        kind: 'thread',
        at: '2026-01-01T10:00:00Z',
        id: 'T1',
        path: 'src/cart/round.ts',
        line: 42,
        resolved: false,
        comments: [comment('C2', { minimized: { reason: 'off-topic' } })],
      },
    ];
    const el = render(createElement(PrThreadList, { items }));
    expect(el.textContent).toContain('src/cart/round.ts:42');
    expect(el.textContent).toContain('Open');
    expect(el.querySelector('.tl-hidden-text')?.textContent).toBe('This comment was marked as off-topic');
  });
});

describe('PR thread rail', () => {
  const items: PrThreadItem[] = [
    {
      kind: 'review',
      at: '2026-01-01T10:00:00Z',
      id: 'R1',
      actor: 'acme-dev',
      verdict: 'changes',
      bodyHtml: '<p>Round before tax.</p>',
    },
    { kind: 'comment', at: '2026-01-01T11:00:00Z', comment: comment('C1') },
    { kind: 'review', at: '2026-01-01T12:00:00Z', id: 'R2', actor: 'acme-dev', verdict: 'approved', bodyHtml: '' },
  ];

  it('is an ordered list of items with decorative rail icons', () => {
    const el = render(createElement(PrThreadList, { items }));
    expect(el.querySelector('ol')?.getAttribute('aria-label')).toBe('Thread');
    expect(el.querySelectorAll('ol > li')).toHaveLength(3);
    for (const icon of el.querySelectorAll('.tl-icon, .tl-avatar')) expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the review verdict as words and a pill, and a bodyless approval as an event row', () => {
    const el = render(createElement(PrThreadList, { items }));
    const first = el.querySelectorAll('li')[0];
    expect(first?.querySelector('.tl-card-h')?.textContent).toContain('acme-dev requested changes');
    expect(first?.querySelector('.tl-pill')?.textContent).toBe('Changes requested');
    expect(first?.querySelector('article')?.id).toBe('tl-R1');
    const last = el.querySelectorAll('li')[2];
    expect(last?.className).toContain('tl-event-row');
    expect(last?.textContent).toContain('acme-dev approved');
    expect(last?.querySelector('.tl-pill')?.textContent).toBe('Approved');
  });

  it('reads a commenting review as reviewed', () => {
    const only: PrThreadItem[] = [
      { kind: 'review', at: '2026-01-01T10:00:00Z', id: 'R3', actor: 'acme-dev', verdict: 'commented', bodyHtml: '<p>hm</p>' },
    ];
    const el = render(createElement(PrThreadList, { items: only }));
    expect(el.querySelector('.tl-card-h')?.textContent).toContain('acme-dev reviewed');
  });
});

describe('issue thread', () => {
  const items: ThreadItem[] = [
    { kind: 'event', at: 1, event: { id: 'E1', createdAt: '2026-01-01T09:00:00Z', actor: 'acme-dev', text: 'acme-dev added the bug label' } },
    { kind: 'comment', at: 2, index: 0, comment: comment('C1') },
    { kind: 'comment', at: 3, index: 1, comment: comment('C2', { minimized: { reason: 'off-topic' } }) },
  ];

  it('draws label events and comments on the rail', () => {
    const el = render(createElement(IssueThread, { items, unseenFrom: 99 }));
    expect(el.querySelectorAll('ol > li')).toHaveLength(3);
    expect(el.querySelector('.tl-event-row')?.textContent).toContain('acme-dev added the bug label');
    expect(el.querySelector('.tl-card-h')?.textContent).toContain('build-bot commented');
  });

  it('does not show NEW on a collapsed hidden row, only on its card once shown', () => {
    const el = render(createElement(IssueThread, { items, unseenFrom: 1 }));
    expect(el.querySelectorAll('.badge-new')).toHaveLength(0);
    expect(el.querySelector('.tl-hidden')?.getAttribute('data-comment')).toBe('1');
    expect(el.querySelector('.tl-hidden')?.getAttribute('data-unseen')).toBeNull();
    act(() => button(el)?.click());
    const card = el.querySelector('.tl-hidden .tl-card');
    expect(card?.querySelector('.badge-new')?.textContent).toBe('NEW');
    expect(card?.getAttribute('data-unseen')).toBe('1');
    expect(card?.getAttribute('data-comment')).toBe('1');
    expect(el.querySelector('.tl-hidden')?.getAttribute('data-comment')).toBeNull();
  });

  it('counts hidden comments for stepping: every comment carries a data-comment index', () => {
    const el = render(createElement(IssueThread, { items, unseenFrom: 99 }));
    const steps = [...el.querySelectorAll('[data-comment]')].map((n) => n.getAttribute('data-comment'));
    expect(steps).toEqual(['0', '1']);
  });
});
