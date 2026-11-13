// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CheckItem, PrDetail } from '../shared/types';
import { MergeStatusBox, resetChecksMemory } from '../web/MergeStatusBox';

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

beforeEach(() => resetChecksMemory());

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const check = (name: string, status: CheckItem['status']): CheckItem => ({ name, status, duration: '' });

const CHECKS: CheckItem[] = [
  check('test (shard 2)', 'fail'),
  check('e2e (chromium)', 'cancelled'),
  check('visual-diff', 'skipped'),
  check('build', 'pass'),
  check('lint', 'pass'),
  ...Array.from({ length: 12 }, (_, i) => check(`unit-${i}`, 'pass')),
];

function detailOf(extra: Partial<PrDetail> = {}): PrDetail {
  return {
    summary: { id: 'PR_42', repo: 'acme-web', number: 42, ci: 'fail', url: 'https://example.test/42', autoMerge: false },
    body: '',
    baseRef: 'main',
    headRef: 'build-bot/cart-rounding',
    checks: CHECKS,
    isOpen: true,
    reviewDecision: 'CHANGES_REQUESTED',
    changeRequests: 1,
    pendingReviews: 1,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'BLOCKED',
    mergeMethod: 'squash',
    thread: [],
    ...extra,
  } as unknown as PrDetail;
}

const box = (detail: PrDetail) => createElement(MergeStatusBox, { detail, fix: undefined });

const rows = (el: HTMLElement) => [...el.querySelectorAll('.msb-row')];

describe('merge status box rows', () => {
  it('is a labelled section with review, checks and mergeability rows in order', () => {
    const el = render(box(detailOf()));
    expect(el.querySelector('section')?.getAttribute('aria-label')).toBe('Merge status');
    expect(rows(el).map((r) => r.querySelector('.msb-headline')?.textContent)).toEqual([
      'Changes requested',
      'Some checks were not successful',
      'This branch has no conflicts with the base branch',
    ]);
    expect([...el.querySelectorAll('.msb-detail')].map((d) => d.textContent)).toEqual([
      '1 requested change',
      '1 pending review',
    ]);
  });

  it('names a row by its headline then its sub line', () => {
    const el = render(box(detailOf()));
    expect(rows(el)[1]?.getAttribute('aria-label')).toBe(
      'Some checks were not successful. 1 failing, 1 cancelled, 1 skipped, 14 successful checks',
    );
  });

  it('leaves out the review row when nothing is required and the checks row when none report', () => {
    const el = render(box(detailOf({ reviewDecision: undefined, checks: [], pendingReviews: 2 })));
    expect(rows(el)).toHaveLength(1);
    expect(el.querySelector('.msb-detail')).toBeNull();
  });

  it('puts aria-expanded on the checks row only', () => {
    const el = render(box(detailOf()));
    expect(rows(el).map((r) => r.getAttribute('aria-expanded'))).toEqual([null, 'true', null]);
    expect(rows(el)[1]?.getAttribute('aria-controls')).toBe(el.querySelector('.msb-checks')?.id);
  });

  it('hides the ring from assistive tech and keeps the counts as text', () => {
    const el = render(box(detailOf()));
    expect(el.querySelector('.checks-ring')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.msb-checks')).not.toBeNull();
    expect(rows(el)[1]?.querySelector('.msb-sub')?.textContent).toBe('1 failing, 1 cancelled, 1 skipped, 14 successful checks');
  });
});

describe('mergeability row', () => {
  const sub = (detail: PrDetail) => rows(render(box(detail))).at(-1)?.querySelector('.msb-headline')?.textContent;

  it.each([
    ['MERGEABLE', 'This branch has no conflicts with the base branch'],
    ['CONFLICTING', 'This branch has conflicts that must be resolved'],
    ['UNKNOWN', 'Checking for conflicts'],
  ])('reads the %s copy', (mergeable, headline) => {
    expect(sub(detailOf({ mergeable, mergeStateStatus: mergeable === 'CONFLICTING' ? 'DIRTY' : 'CLEAN' }))).toBe(headline);
  });

  it('reads Checking for conflicts when mergeable is missing', () => {
    expect(sub(detailOf({ mergeable: undefined }))).toBe('Checking for conflicts');
  });
});

describe('expanded checks list', () => {
  it('is open for a failing PR, lists problems first and shows five rows with a tail', () => {
    const el = render(box(detailOf()));
    const items = [...el.querySelectorAll('[role="listitem"]')];
    expect(el.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe('Checks');
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.querySelector('.check-word')?.textContent)).toEqual([
      'fail',
      'cancelled',
      'skipped',
      'pass',
      'pass',
    ]);
    expect(el.querySelector('.msb-strip-sub')?.textContent).toBe('Problems first. Showing 5 of 17.');
    expect(el.querySelector('.msb-tail')?.textContent).toBe('Show 12 more successful checks');
  });

  it('loads the rest in place and collapses again', () => {
    const el = render(box(detailOf()));
    act(() => el.querySelector<HTMLButtonElement>('.msb-tail')?.click());
    expect(el.querySelectorAll('[role="listitem"]')).toHaveLength(17);
    expect(el.querySelector('.msb-tail')?.textContent).toBe('Show fewer');
    act(() => el.querySelector<HTMLButtonElement>('.msb-tail')?.click());
    expect(el.querySelectorAll('[role="listitem"]')).toHaveLength(5);
  });

  it('starts closed when every check passed and toggles with the row', () => {
    const el = render(box(detailOf({ checks: [check('build', 'pass'), check('lint', 'skipped')] })));
    const row = rows(el)[1];
    expect(row?.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.msb-checks')).toBeNull();
    act(() => (row as HTMLButtonElement).click());
    expect(row?.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.msb-checks')).not.toBeNull();
  });

  it('remembers the choice for the next PR in the session', () => {
    const first = render(box(detailOf()));
    act(() => (rows(first)[1] as HTMLButtonElement).click());
    act(() => root?.unmount());
    host?.remove();
    const second = render(box(detailOf({ summary: { id: 'PR_43' } as PrDetail['summary'] })));
    expect(rows(second)[1]?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('closed PRs', () => {
  it('shows one final row on a merged PR', () => {
    const el = render(box(detailOf({ isOpen: false, merged: true })));
    expect(rows(el).map((r) => r.querySelector('.msb-headline')?.textContent)).toEqual(['Pull request merged']);
  });
});
