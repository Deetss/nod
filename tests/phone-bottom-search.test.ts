// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveSections } from '../shared/sections';
import type { PrSummary } from '../shared/types';
import type { ActivityHandle } from '../web/activity-ui';
import type { IssuesState } from '../web/issues/useIssues';
import { PhoneApp } from '../web/phone/PhoneApp';
import type { PhoneTab } from '../web/phone/phone-logic';
import type { Inbox } from '../web/useInbox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pr = (n: number, title: string, over: Partial<PrSummary> = {}): PrSummary => ({
  id: `acme-api#${n}`,
  repo: 'acme-api',
  number: n,
  title,
  author: 'build-bot',
  createdAt: '2026-11-06T10:00:00Z',
  updatedAt: `2026-11-06T1${n}:00:00Z`,
  headSha: 'a1b2c3d',
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  commitCount: 1,
  ci: 'pass',
  reviewStatus: 'needs review',
  seen: 'seen',
  url: '',
  ...over,
});

const prs = [
  pr(1, 'fix: resolve duplicate webhook', { requested: ['acme-dev'] }),
  pr(2, 'feat: retry failed webhook', { author: 'acme-dev', requested: ['acme-dev'] }),
  pr(3, 'chore: tidy swagger tags', { author: 'acme-dev' }),
  pr(4, 'feat: log inbound vendor calls'),
];

let host: HTMLElement;
let root: Root;

function mount(tab: PhoneTab = 'prs') {
  const inbox = {
    data: { viewer: 'acme-dev', prs, sections: deriveSections('acme-dev', prs), syncedAt: Date.now(), follows: {} },
    error: undefined,
    loading: false,
    ready: true,
    reload: vi.fn(),
    refreshing: false,
    syncing: false,
  } as unknown as Inbox;
  const issues = { data: undefined, error: undefined, reload: vi.fn() } as IssuesState;
  const activity = { feed: undefined, error: undefined, lastVisit: 0, reload: vi.fn(), loadOlder: vi.fn() } as ActivityHandle;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      createElement(PhoneApp, {
        tab,
        onTab: vi.fn(),
        connections: { data: undefined, busy: false, check: vi.fn(), reload: vi.fn() },
        inbox,
        issues,
        activity,
        seenLocal: new Set<string>(),
        issueSeen: new Set<string>(),
        sheet: undefined,
        onSheet: vi.fn(),
        onSeenPr: vi.fn(),
        onSeenIssue: vi.fn(),
        onRefresh: vi.fn(),
        connection: { connection: undefined, result: undefined, busy: false, check: async () => {}, clearResult: () => {} },
        theme: 'dark',
        onToggleTheme: vi.fn(),
        density: 'comfortable',
        onDensity: vi.fn(),
      }),
    ),
  );
}

const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T & HTMLElement>(sel);
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const sections = () => [...host.querySelectorAll('.ph-pane.is-active .ph-section')].map((s) => s.textContent);
const checkbox = (label: string) =>
  [...host.querySelectorAll('[role="checkbox"]')].find((r) => r.querySelector('.ph-pk-node')?.textContent === label);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('bottom bar', () => {
  it('replaces the chip row and the header search button on PRs', () => {
    mount();
    expect(q('.ph-chips')).toBeNull();
    expect(q('.ph-appbar [aria-label="Search"]')).toBeNull();
    expect(q('.ph-pill')?.textContent).toBe('Search pull requests');
    expect(q('.ph-filterbtn')?.getAttribute('aria-label')).toBe('Filters');
    expect(q('.ph-filter-badge')).toBeNull();
  });

  it('is absent on Activity, which keeps its chips', () => {
    mount('activity');
    expect(q('.ph-bottombar')).toBeNull();
  });
});

describe('filter sheet', () => {
  it('applies ticks at once, badges the button and forces ticked sections open', () => {
    mount();
    click(q('.ph-filterbtn'));
    expect(q('.ph-sheet')?.getAttribute('aria-label')).toBe('Filter pull requests');
    click(checkbox('Needs me'));
    click(checkbox('Mine'));
    expect(checkbox('Mine')?.getAttribute('aria-checked')).toBe('true');
    expect(sections().map((s) => s?.replace(/\d+$/, ''))).toEqual(['Needs my review', 'Mine']);
    expect(host.querySelectorAll('.ph-pane.is-active .ph-lrow').length).toBe(4);
    expect(q('.ph-actionbar .is-primary')?.textContent).toBe('Done · 2 filters');

    click(q('.ph-actionbar .is-primary'));
    expect(q('.ph-sheet')).toBeNull();
    expect(q('.ph-filterbtn')?.getAttribute('aria-label')).toBe('Filters, 2 on');
    expect(q('.ph-filter-badge')?.textContent).toBe('2');
  });

  it('clears every tick and keeps the sheet open', () => {
    mount();
    click(q('.ph-filterbtn'));
    click(checkbox('Org'));
    click(q('.ph-filter-clear'));
    expect(q('.ph-sheet')).not.toBeNull();
    expect(checkbox('Org')?.getAttribute('aria-checked')).toBe('false');
    expect(q<HTMLButtonElement>('.ph-filter-clear')?.disabled).toBe(true);
  });
});

describe('search', () => {
  const type = (text: string) => {
    const input = q<HTMLInputElement>('.ph-searchband input') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      set?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('shows a flat, de-duplicated result list and Cancel restores the list', () => {
    mount();
    click(q('.ph-pill'));
    expect(q('.phone')?.classList.contains('is-searching')).toBe(true);
    expect(q('.ph-bottombar')).toBeNull();
    type('webhook');
    expect(q('.ph-results-line')?.textContent).toBe('2 results for “webhook”');
    expect(host.querySelectorAll('.ph-list.is-results .ph-section').length).toBe(0);
    expect(host.querySelectorAll('.ph-list.is-results .ph-lrow').length).toBe(2);

    click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Cancel'));
    expect(q('.phone')?.classList.contains('is-searching')).toBe(false);
    expect(q('.ph-results-line')).toBeNull();
    expect(q('.ph-pill')).not.toBeNull();
  });

  it('offers Clear filters when the ticked filters hide every match', () => {
    mount();
    click(q('.ph-filterbtn'));
    click(checkbox('Org'));
    click(q('.ph-actionbar .is-primary'));
    click(q('.ph-pill'));
    type('swagger');
    expect(q('.ph-results-line')?.textContent).toBe('No results for “swagger” · Org');
    expect(q('.ph-empty-body')?.textContent).toBe('1 filter is on.');
    click([...host.querySelectorAll('button')].find((b) => b.textContent === 'Clear filters'));
    expect(q('.ph-results-line')?.textContent).toBe('1 result for “swagger”');
  });
});
