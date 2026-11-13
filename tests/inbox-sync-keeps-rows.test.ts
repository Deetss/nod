// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InboxPane } from '../web/InboxPane';
import { visibleSections } from '../web/inbox-utils';
import type { InboxView } from '../web/useInbox';
import type { PrSummary } from '../shared/types';
import { deriveSections } from '../shared/sections';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function pr(id: string, over: Partial<PrSummary> = {}): PrSummary {
  return {
    id,
    repo: 'acme-api',
    number: Number(id.replace(/\D/g, '')) || 1,
    title: `Title ${id}`,
    author: 'build-bot',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    headSha: 'aaa',
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commitCount: 1,
    ci: 'pass',
    reviewStatus: 'needs review',
    seen: 'seen',
    url: 'u',
    isDraft: false,
    requested: ['me'],
    ...over,
  };
}

function view(prs: PrSummary[], syncing?: { done: number; total: number }): InboxView {
  return {
    viewer: 'me',
    prs,
    syncedAt: Date.now(),
    follows: {},
    syncing,
    sections: deriveSections('me', prs),
  };
}

let root: Root | undefined;
let host: HTMLElement | undefined;

function renderPane(data: InboxView | undefined, selectedId: string | undefined) {
  const sections = visibleSections(data, '', new Set());
  act(() => {
    root?.render(
      createElement(InboxPane, {
        data,
        error: undefined,
        loading: false,
        sections,
        selectedId,
        filter: '',
        filterRef: createRef<HTMLInputElement>(),
        listRef: createRef<HTMLDivElement>(),
        narrow: false,
        onFilter: () => {},
        onToggle: () => {},
        onSelect: () => {},
        onOpen: () => {},
        onRetry: () => {},
        onShowOrg: () => {},
      }),
    );
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe('inbox list across a sync', () => {
  it('keeps row nodes, selection and scroll when a sync starts and ends', () => {
    const prs = [pr('A1'), pr('A2'), pr('A3')];
    renderPane(view(prs), 'A2');
    const list = host!.querySelector('.inbox-list') as HTMLElement;
    list.scrollTop = 40;
    const before = [...host!.querySelectorAll('[role=option]')];
    expect(before).toHaveLength(3);

    renderPane(view(prs, { done: 1, total: 3 }), 'A2');
    expect(host!.querySelector('.loading-panel')).toBeNull();
    const during = [...host!.querySelectorAll('[role=option]')];
    expect(during).toHaveLength(3);
    during.forEach((node, i) => expect(node).toBe(before[i]));
    expect(host!.querySelector('#row-A2')?.getAttribute('aria-selected')).toBe('true');

    renderPane(view(prs), 'A2');
    const after = [...host!.querySelectorAll('[role=option]')];
    after.forEach((node, i) => expect(node).toBe(before[i]));
    expect(list.scrollTop).toBe(40);
  });

  it('shows the loading panel for a first sync with nothing cached', () => {
    renderPane(view([], { done: 0, total: 3 }), undefined);
    expect(host!.querySelector('.loading-panel')).not.toBeNull();
  });

  it('keeps rows visible during a sync that starts with an empty list', () => {
    renderPane(view([pr('A1')], { done: 0, total: 3 }), undefined);
    expect(host!.querySelectorAll('[role=option]')).toHaveLength(1);
    expect(host!.querySelector('.loading-panel')).toBeNull();
  });
});
