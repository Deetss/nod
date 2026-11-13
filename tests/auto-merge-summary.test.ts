// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { toSummary, type RawPr } from '../server/github-map';
import type { PrDetail, PrSummary } from '../shared/types';
import { DensityContext } from '../web/density';
import type { ReviewAccess } from '../shared/pr-actions';
import type { ActionKind } from '../web/DetailBody';
import { ReviewBar } from '../web/DetailPane';
import { FollowContext, type FollowView } from '../web/follow';
import { PrRow } from '../web/PrRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const RAW: RawPr = {
  id: 'PR_7',
  number: 7,
  title: 'Synthetic change',
  url: 'https://example.test/pr/7',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  headRefOid: 'abc123',
  repository: { name: 'acme-web' },
  author: { login: 'build-bot' },
  reviewDecision: null,
  approvals: { totalCount: 0 },
  anyReviews: { totalCount: 0 },
  commitCount: { totalCount: 1 },
  lastCommit: { nodes: [] },
};

const PR = { ...toSummary(RAW), id: 'PR_42', ci: 'pass', seen: 'seen' } as PrSummary;

describe('toSummary auto-merge mapping', () => {
  it('maps a set autoMergeRequest to autoMerge true', () => {
    expect(toSummary({ ...RAW, autoMergeRequest: { enabledAt: '2026-01-02T00:00:00Z' } }).autoMerge).toBe(true);
  });

  it('leaves autoMerge off for null and for a missing field', () => {
    expect(toSummary({ ...RAW, autoMergeRequest: null }).autoMerge).toBeFalsy();
    expect(toSummary(RAW).autoMerge).toBeFalsy();
  });
});

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

const view = (kind?: 'merged'): FollowView => ({
  chips: kind ? { PR_42: kind } : {},
  fading: new Set(),
  held: [],
});

function row(pr: PrSummary, v: FollowView): HTMLElement {
  return render(
    createElement(
      DensityContext.Provider,
      { value: 'comfortable' },
      createElement(
        FollowContext.Provider,
        { value: v },
        createElement(PrRow, { pr, selected: false, onSelect: () => {}, onOpen: () => {} }),
      ),
    ),
  );
}

describe('auto-merge chip from GitHub state', () => {
  it('shows the pending chip for autoMerge with no follow entry', () => {
    const chip = row({ ...PR, autoMerge: true }, view()).querySelector('.pr-chip');
    expect(chip?.textContent).toBe('Auto-merge on, waiting for checks');
    expect(chip?.classList.contains('pr-chip-wait')).toBe(true);
  });

  it('shows no chip without autoMerge', () => {
    expect(row(PR, view()).querySelector('.pr-chip')).toBeNull();
  });

  it('lets a merged follow entry win', () => {
    const chip = row({ ...PR, autoMerge: true }, view('merged')).querySelector('.pr-chip');
    expect(chip?.textContent).toBe('Merged');
  });
});

describe('auto-merge button', () => {
  const access = { ownPr: false, admin: 'hidden', draft: false } as const;

  function bar(autoMerge: boolean, density: 'comfortable' | 'compact'): HTMLElement {
    const detail = { summary: { ...PR, autoMerge }, mergeMethod: 'squash' } as unknown as PrDetail;
    return render(
      createElement(
        DensityContext.Provider,
        { value: density },
        createElement(ReviewBar, { detail, disabled: false, access, onAction: () => {} }),
      ),
    );
  }
  const button = (el: HTMLElement) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Auto-merge'));

  it.each(['comfortable', 'compact'] as const)('greys out and reads "Auto-merge is on" in %s density', (density) => {
    const btn = button(bar(true, density));
    expect(btn?.textContent).toContain('Auto-merge is on');
    expect(btn?.disabled).toBe(true);
    expect(btn?.classList.contains('btn-on')).toBe(true);
  });

  it('stays enabled with the method text when auto-merge is off', () => {
    const el = bar(false, 'comfortable');
    expect(button(el)?.disabled).toBe(false);
    expect(el.querySelector('.merge-method')?.textContent).not.toBe('Auto-merge is on');
  });
});

describe('review bar', () => {
  const access = { ownPr: false, admin: 'hidden', draft: false } as const;
  const detail = (extra: Partial<PrDetail> = {}) =>
    ({ summary: { ...PR, autoMerge: false }, mergeMethod: 'squash', isOpen: true, ...extra }) as unknown as PrDetail;
  const bar = (d: PrDetail, a: ReviewAccess = access, onAction: (k: ActionKind) => void = () => {}) =>
    render(createElement(ReviewBar, { detail: d, disabled: false, access: a, onAction }));

  it('puts the review buttons left and Auto-merge right', () => {
    const el = bar(detail());
    const side = (sel: string) => [...el.querySelectorAll(`${sel} button`)].map((b) => b.textContent);
    expect(side('.review-bar-side:not(.review-bar-merge)')).toEqual(['Approvea', 'Request changesr', 'Commentc']);
    expect(side('.review-bar-merge')).toEqual(['Auto-mergem']);
  });

  it('passes the clicked action up', () => {
    const calls: ActionKind[] = [];
    const el = bar(detail(), access, (k) => void calls.push(k));
    act(() => (el.querySelector('.btn-primary') as HTMLButtonElement | null)?.click());
    expect(calls).toEqual(['approve']);
  });

  it('shows the own-PR hint and disables Approve on your own PR', () => {
    const el = bar(detail(), { ownPr: true, admin: 'hidden', draft: false });
    expect(el.textContent).toContain('GitHub');
    const approve = [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Approve'));
    expect(approve?.disabled).toBe(true);
  });

  it('renders nothing for a merged or closed PR', () => {
    expect(bar(detail({ isOpen: false, merged: true })).querySelector('.review-bar')).toBeNull();
  });
});
