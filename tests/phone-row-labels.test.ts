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

  it('renders at most the comfortable limit plus a +n chip with its title', () => {
    const el = render(issue(5));
    expect(el.querySelectorAll('.ph-row-chips .chip:not(.chip-more)')).toHaveLength(2);
    const more = el.querySelector('.chip-more');
    expect(more?.textContent).toBe('+3');
    expect(more?.getAttribute('title')).toBe('3 more labels');
  });

  it('renders one chip in compact density', () => {
    const el = render(issue(3), 'compact');
    expect(el.querySelectorAll('.ph-row-chips .chip:not(.chip-more)')).toHaveLength(1);
    expect(el.querySelector('.chip-more')?.textContent).toBe('+2');
  });

  it('renders no +n chip when every label fits', () => {
    const el = render(issue(2));
    expect(el.querySelectorAll('.ph-row-chips .chip')).toHaveLength(2);
    expect(el.querySelector('.chip-more')).toBeNull();
  });

  it('does not reuse the tab-bar chip class on the row container', () => {
    const el = render(issue(2));
    expect(el.querySelector('.ph-chips')).toBeNull();
    expect(el.querySelector('.ph-row-chips')).not.toBeNull();
  });

  it('renders no chip container without labels and keeps the comment count', () => {
    const el = render(issue(0));
    expect(el.querySelector('.ph-row-chips')).toBeNull();
    expect(el.querySelector('.ph-status')?.textContent).toContain('2');
  });
});
