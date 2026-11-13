// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { FollowKind, PrSummary } from '../shared/types';
import { DensityContext, type Density } from '../web/density';
import { FollowContext, followPhase, type FollowView } from '../web/follow';
import { PrRow } from '../web/PrRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

const PR = {
  id: 'PR_42',
  repo: 'acme-web',
  number: 42,
  title: 'Add rate-limit headers',
  author: 'build-bot',
  url: 'https://example.test/pr/42',
  ci: 'pass',
  seen: 'seen',
  isDraft: false,
  additions: 42,
  deletions: 8,
  changedFiles: 4,
  updatedAt: new Date().toISOString(),
  reviewStatus: '1 approval',
} as unknown as PrSummary;

function mount(density: Density, view: FollowView): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(
        DensityContext.Provider,
        { value: density },
        createElement(
          FollowContext.Provider,
          { value: view },
          createElement(PrRow, { pr: PR, selected: false, onSelect: () => {}, onOpen: () => {} }),
        ),
      ),
    );
  });
  return host;
}

const view = (kind?: FollowKind, fading = false): FollowView => ({
  chips: kind ? { PR_42: kind } : {},
  fading: new Set(fading ? ['PR_42'] : []),
  held: [],
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const CASES: Array<[FollowKind, string, string]> = [
  ['auto-merge', 'Auto-merge on, waiting for checks', 'pr-chip-wait'],
  ['merging', 'Merging...', 'pr-chip-wait'],
  ['merged', 'Merged', 'pr-chip-merged'],
  ['approved', 'Approved', 'pr-chip-approved'],
];

describe('status chip in the PR row', () => {
  it.each(CASES)('%s shows its text and class, and hides the status text', (kind, text, cls) => {
    const el = mount('comfortable', view(kind));
    const chip = el.querySelector('.pr-chip');
    expect(chip?.textContent).toBe(text);
    expect(chip?.classList.contains(cls)).toBe(true);
    expect(chip?.classList.contains('ci')).toBe(true);
    expect(el.querySelector('.row-status')).toBeNull();
    const spins = kind === 'auto-merge' || kind === 'merging';
    expect(chip?.querySelector('.spinner') !== null).toBe(spins);
  });

  it('shows the muted status text and no chip at rest', () => {
    const el = mount('comfortable', view());
    expect(el.querySelector('.pr-chip')).toBeNull();
    expect(el.querySelector('.row-status')?.textContent).toBe('1 approval');
  });

  it('shows no chip in compact density', () => {
    const el = mount('compact', view('merged'));
    expect(el.querySelector('.pr-chip')).toBeNull();
  });

  it('marks a fading row as exiting', () => {
    const el = mount('comfortable', view('merged', true));
    expect(el.querySelector('.row')?.classList.contains('is-exiting')).toBe(true);
  });
});

describe('followPhase', () => {
  it('holds approved for 6 s', () => {
    expect(followPhase('approved', 5999, false)).toBe('chip');
    expect(followPhase('approved', 6000, false)).toBe('gone');
  });

  it('holds merged for 4 s, fades 200 ms, then removes the row', () => {
    expect(followPhase('merged', 3999, false)).toBe('chip');
    expect(followPhase('merged', 4000, false)).toBe('fade');
    expect(followPhase('merged', 4200, false)).toBe('gone');
  });

  it('removes a merged row at 4 s with no fade under reduced motion', () => {
    expect(followPhase('merged', 4000, true)).toBe('gone');
  });

  it('keeps server-driven chips for as long as the server reports them', () => {
    expect(followPhase('auto-merge', 10 * 60_000, false)).toBe('chip');
    expect(followPhase('merging', 10 * 60_000, false)).toBe('chip');
  });
});
