// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialClosed, type ClosedPage, type ClosedSectionState } from '../shared/closed';
import { ClosedPill, ClosedRow, ClosedSection } from '../web/ClosedSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: string };

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const ready = (items: Row[], more = false): ClosedSectionState<Row> => ({
  ...initialClosed<Row>(),
  open: true,
  status: 'ready',
  items,
  hasMore: more,
});

const section = (state: ClosedSectionState<Row>, handlers: Partial<{ onMore: () => void; onToggle: () => void }> = {}) =>
  createElement(ClosedSection<Row>, {
    state,
    narrow: false,
    renderRow: (r: Row) => createElement('div', { key: r.id, className: 'fake-row' }, r.id),
    onToggle: handlers.onToggle ?? (() => undefined),
    onWindow: () => undefined,
    onMore: handlers.onMore ?? (() => undefined),
    onRetry: () => undefined,
  });

describe('ClosedSection', () => {
  it('shows only the header while collapsed', () => {
    const el = render(section(initialClosed<Row>()));
    expect(el.querySelector('.sec-h')?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.sec-name')?.textContent).toBe('Closed · last 30 days');
    expect(el.querySelector('.closed-window')).toBeNull();
    expect(el.querySelector('.count')?.textContent).toBe('');
  });

  it('shows the window row, rows and the Load more row when expanded', () => {
    const el = render(section(ready([{ id: 'a' }, { id: 'b' }], true)));
    expect(el.querySelector('.closed-window')?.textContent).toContain('Last 30 days');
    expect(el.querySelector('.closed-window')?.textContent).toContain('newest first');
    expect(el.querySelectorAll('.fake-row')).toHaveLength(2);
    expect(el.querySelector('.closed-more')?.textContent).toBe('Load more (older than 30 days)');
    expect(el.querySelector('.count')?.textContent).toBe('2');
  });

  it('asks for the next page when Load more is pressed', () => {
    const onMore = vi.fn();
    const el = render(section(ready([{ id: 'a' }], true), { onMore }));
    act(() => el.querySelector<HTMLButtonElement>('.closed-more button')?.click());
    expect(onMore).toHaveBeenCalledOnce();
  });

  it('says nothing closed and hides Load more for an empty window', () => {
    const el = render(section(ready([], true)));
    expect(el.querySelector('.closed-empty')?.textContent).toBe('Nothing closed in 30 days.');
    expect(el.querySelector('.closed-more')).toBeNull();
    expect(el.querySelector('.count')?.textContent).toBe('0');
  });

  it('shows skeleton rows and a count of three dots while loading', () => {
    const el = render(section({ ...initialClosed<Row>(), open: true, status: 'loading' }));
    expect(el.querySelectorAll('.skeleton-row')).toHaveLength(3);
    expect(el.querySelector('.count')?.textContent).toBe('…');
  });

  it('shows an error banner with Retry', () => {
    const el = render(section({ ...initialClosed<Row>(), open: true, status: 'error', error: 'boom' }));
    expect(el.querySelector('.banner-error')?.textContent).toContain('boom');
    expect(el.querySelector('.banner-actions button')?.textContent).toBe('Retry');
  });

  it('toggles from the header', () => {
    const onToggle = vi.fn();
    const el = render(section(initialClosed<Row>(), { onToggle }));
    act(() => el.querySelector<HTMLButtonElement>('.sec-h')?.click());
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

describe('ClosedRow and ClosedPill', () => {
  const props = {
    id: 'PR_1',
    repo: 'acme-co/acme-web',
    number: 1398,
    title: 'Fix date picker timezone',
    author: 'acme-dev',
    closedAt: new Date().toISOString(),
    url: 'https://github.com/acme-co/acme-web/pull/1398',
    selected: false,
    onSelect: () => undefined,
    onOpen: () => undefined,
  };

  it.each([
    ['merged', 'MERGED'],
    ['closed', 'CLOSED'],
    ['completed', 'COMPLETED'],
    ['not-planned', 'NOT PLANNED'],
  ] as const)('writes the %s pill word and carries its own class', (state, word) => {
    const el = render(createElement(ClosedPill, { state }));
    expect(el.textContent).toBe(word);
    expect(el.querySelector(`.closed-${state}`)).not.toBeNull();
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('marks a selected row and has no unseen dot or badge', () => {
    const el = render(createElement(ClosedRow, { ...props, state: 'merged', selected: true }));
    expect(el.querySelector('.row')?.getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('.dot')).toBeNull();
    expect(el.querySelector('.badge')).toBeNull();
  });
});
