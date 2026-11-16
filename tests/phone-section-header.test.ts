// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhoneInbox, type InboxSectionView } from '../web/phone/PhoneInbox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

const view = (over: Partial<InboxSectionView>): InboxSectionView => ({
  key: 'mine',
  title: 'Mine',
  count: 2,
  open: true,
  empty: false,
  rows: createElement('div', { className: 'ph-lrow' }, 'row'),
  ...over,
});

function mount(sections: InboxSectionView[], onToggle = vi.fn()) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(PhoneInbox, {
        sections,
        status: 'ready',
        skeletonTitles: [],
        syncLine: 'Synced',
        cachedLine: '',
        errorDetail: '',
        refreshing: false,
        emptyTitle: '',
        emptyBody: '',
        emptyLine: 'No PRs here',
        noun: 'pull request',
        onToggle,
        onRefresh: () => undefined,
      }),
    ),
  );
  return onToggle;
}

const header = (name: string) =>
  [...(host?.querySelectorAll<HTMLButtonElement>('.ph-section') ?? [])].find((b) => b.textContent?.startsWith(name));

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('phone section header', () => {
  it('names the title and count, singular for one', () => {
    mount([view({ count: 5 }), view({ key: 'org', title: 'Org open', count: 1 })]);
    expect(header('Mine')?.getAttribute('aria-label')).toBe('Mine, 5 pull requests');
    expect(header('Org open')?.getAttribute('aria-label')).toBe('Org open, 1 pull request');
  });

  it('shows an empty closed section with no rows and no empty line', () => {
    mount([view({ key: 'needs', title: 'Needs my review', count: 0, empty: true, open: false })]);
    const h = header('Needs my review');
    expect(h?.getAttribute('aria-expanded')).toBe('false');
    expect(h?.getAttribute('aria-label')).toBe('Needs my review, 0 pull requests');
    expect(host?.querySelector('.ph-section-empty')).toBeNull();
    expect(host?.querySelector('.ph-lrow')).toBeNull();
  });

  it('shows the empty line, not rows, when an empty section is opened', () => {
    mount([view({ count: 0, empty: true, open: true })]);
    expect(host?.querySelector('.ph-section-empty')?.textContent).toBe('No PRs here');
    expect(host?.querySelector('.ph-lrow')).toBeNull();
  });

  it('hands the tapped section to the toggle, so an empty one can skip saving', () => {
    const empty = view({ key: 'needs', title: 'Needs my review', count: 0, empty: true, open: false });
    const onToggle = mount([empty, view({})]);
    act(() => header('Needs my review')?.click());
    expect(onToggle).toHaveBeenCalledWith(empty);
  });
});
