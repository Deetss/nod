// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { IssueSummary } from '../shared/issue-types';
import { IssueRow } from '../web/phone/PhoneList';
import { DensityContext, type Density } from '../web/density';
import { PHONE_CHIPS_MAX, splitChips } from '../web/row-format';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const label = (n: number) => ({ name: `label-${n}`, color: 'd73a4a' });

const issue = (count: number): IssueSummary => ({
  id: 'I_1',
  repo: 'acme-web',
  number: 7,
  title: 'Synthetic issue',
  author: 'build-bot',
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  url: 'https://example.test/issues/7',
  state: 'open',
  labels: Array.from({ length: count }, (_, i) => label(i + 1)),
  assignees: [],
  commentCount: 2,
  seen: 'seen',
});

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(i: IssueSummary, density: Density = 'comfortable'): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      createElement(DensityContext.Provider, { value: density }, createElement(IssueRow, { issue: i, onOpen: () => {} })),
    ),
  );
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('phone issue row labels', () => {
  it('limits phone chips by density and counts the rest', () => {
    expect(PHONE_CHIPS_MAX).toEqual({ comfortable: 2, compact: 1 });
    const labels = Array.from({ length: 5 }, (_, i) => label(i + 1));
    expect(splitChips(labels, PHONE_CHIPS_MAX.comfortable)).toMatchObject({ extra: 3 });
    expect(splitChips(labels, PHONE_CHIPS_MAX.compact)).toMatchObject({ extra: 4 });
  });

  const shownMore = (el: HTMLElement) => el.querySelector('.ph-lrow-chips .chip-more:not([hidden])');

  it('renders at most the comfortable limit plus a +n chip with its title', () => {
    const el = render(issue(5));
    expect(el.querySelectorAll('.ph-lrow-chips .label-chip')).toHaveLength(2);
    expect(shownMore(el)?.textContent).toBe('+3');
    expect(shownMore(el)?.getAttribute('title')).toBe('3 more labels');
  });

  it('renders one chip in compact density', () => {
    const el = render(issue(3), 'compact');
    expect(el.querySelectorAll('.ph-lrow-chips .label-chip')).toHaveLength(1);
    expect(shownMore(el)?.textContent).toBe('+2');
  });

  it('shows no +n chip when every label fits', () => {
    const el = render(issue(2));
    expect(el.querySelectorAll('.ph-lrow-chips .label-chip')).toHaveLength(2);
    expect(shownMore(el)).toBeNull();
  });

  it('does not reuse the tab-bar chip class on the row container', () => {
    const el = render(issue(2));
    expect(el.querySelector('.ph-chips')).toBeNull();
    expect(el.querySelector('.ph-lrow-chips')).not.toBeNull();
  });

  it('renders no chip container without labels and keeps the comment count', () => {
    const el = render(issue(0));
    expect(el.querySelector('.ph-lrow-chips')).toBeNull();
    expect(el.querySelector('.ph-lrow-comments')?.textContent).toBe('2');
  });

  it('reads every label in the row label, and the dash status when there is none', () => {
    const el = render(issue(3));
    const label = el.querySelector('.ph-lrow')?.getAttribute('aria-label') ?? '';
    expect(label).toContain('labels label-1, label-2, label-3');
    expect(label).toContain('No project status');
    expect(el.querySelector('.ph-lrow-glyph')?.className).toContain('is-none');
  });
});
