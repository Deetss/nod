// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IssueDetail, IssueSummary } from '../shared/issue-types';
import type { CheckItem, PrDetail, PrSummary, PrThreadItem } from '../shared/types';
import { PhoneIssueSheet } from '../web/phone/PhoneIssueSheet';
import { PhonePrSheet } from '../web/phone/PhonePrSheet';
import type { PhonePr } from '../web/phone/usePhonePr';
import type { Remote } from '../web/useRemote';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const check = (name: string, status: CheckItem['status']): CheckItem =>
  ({ name, status, duration: '1m', url: 'https://example.test/run' }) as unknown as CheckItem;

const THREAD: PrThreadItem[] = [
  {
    kind: 'comment',
    at: '2026-01-01T10:00:00Z',
    comment: {
      id: 'C1',
      author: 'build-bot',
      createdAt: '2026-01-01T10:00:00Z',
      bodyHtml: '<p>hidden body</p>',
      minimized: { reason: 'off-topic' },
    },
  },
  {
    kind: 'review',
    at: '2026-01-01T11:00:00Z',
    id: 'R1',
    actor: 'acme-dev',
    verdict: 'changes',
    bodyHtml: '<p>Please fix</p>',
  },
];

const PR = {
  id: 'p1',
  repo: 'acme-web',
  number: 42,
  title: 'Synthetic change',
  author: 'build-bot',
  createdAt: '2026-01-01T09:00:00Z',
  isDraft: false,
  ci: 'fail',
  reviewStatus: 'Review requested',
  url: 'https://example.test/pr/42',
} as unknown as PrSummary;

function prData(over: Partial<PrDetail> = {}): PhonePr {
  const detail = {
    summary: PR,
    isOpen: true,
    merged: false,
    thread: THREAD,
    checks: [check('test (shard 2)', 'fail'), check('build', 'pass'), check('lint', 'skipped')],
    commits: [],
    commitTotal: 0,
    newCommits: 0,
    headRef: 'build-bot/cart-rounding',
    baseRef: 'main',
    body: '',
    bodyHtml: '',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    ...over,
  } as unknown as PrDetail;
  return { detail: { data: detail }, diff: {}, files: [], toggleViewed: vi.fn(), reload: vi.fn() } as unknown as PhonePr;
}

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function mountNode(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

function mountPr(data: PhonePr): HTMLElement {
  return mountNode(
    createElement(PhonePrSheet, {
      pr: PR,
      viewer: 'me',
      data,
      writesOff: false,
      busy: false,
      depth: 0,
      covered: false,
      onClose: vi.fn(),
      onFile: vi.fn(),
      onMore: vi.fn(),
      onApprove: vi.fn(),
      onComment: vi.fn(),
    }),
  );
}

const tabs = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const tab = (el: HTMLElement, name: string) => {
  const t = tabs(el).find((b) => b.textContent?.startsWith(name));
  if (!t) throw new Error(`no ${name} tab`);
  return t;
};

describe('phone PR sheet status box', () => {
  it('keeps the tab order Overview, Files, Thread, Checks', () => {
    const el = mountPr(prData());
    expect(tabs(el).map((t) => t.textContent?.split(' ')[0])).toEqual(['Overview', 'Files', 'Thread', 'Checks']);
  });

  it('shows the merge status box first in Overview and drops the CI pill and Reviews line', () => {
    const el = mountPr(prData());
    expect(el.querySelector('.ph-pills')?.textContent).toBe('Open');
    expect(el.querySelector('.ph-reviews')).toBeNull();
    act(() => tab(el, 'Overview').click());
    const box = el.querySelector('section[aria-label="Merge status"]');
    expect(box).not.toBeNull();
    expect(el.querySelector('.ph-status-box')?.firstElementChild).toBe(box);
  });

  it('opens the Checks tab from the checks row, with no inline list', () => {
    const el = mountPr(prData());
    act(() => tab(el, 'Overview').click());
    const row = el.querySelector<HTMLButtonElement>('.msb-row-checks');
    expect(row?.getAttribute('aria-expanded')).toBeNull();
    expect(el.querySelector('.msb-checks')).toBeNull();
    act(() => row?.click());
    expect(tab(el, 'Checks').getAttribute('aria-selected')).toBe('true');
  });

  it('draws cancelled and skipped checks with their own icons, not the pending ring', () => {
    const el = mountPr(
      prData({ checks: [check('e2e', 'cancelled'), check('visual-diff', 'skipped'), check('wait', 'running')] }),
    );
    act(() => tab(el, 'Checks').click());
    const rows = [...el.querySelectorAll('.ph-check')];
    const ring = (row: Element) => row.querySelector('circle[stroke-dasharray]') !== null;
    expect(rows.map((r) => r.querySelector('.ph-check-word.is-cancelled, .ph-check-word.is-skipped, .ph-check-word.is-running')?.className)).toHaveLength(3);
    expect(rows.map(ring)).toEqual([false, false, true]);
  });

  it('opens the Thread tab from a review row', () => {
    const el = mountPr(prData({ reviewDecision: 'CHANGES_REQUESTED', changeRequests: 1 } as Partial<PrDetail>));
    act(() => tab(el, 'Overview').click());
    act(() => el.querySelector<HTMLButtonElement>('.msb-row-review')?.click());
    expect(tab(el, 'Thread').getAttribute('aria-selected')).toBe('true');
  });

  it('draws the Thread tab on the rail with a collapsed hidden comment', () => {
    const el = mountPr(prData());
    act(() => tab(el, 'Thread').click());
    expect(el.querySelector('.ph-thread ol.tl-list')).not.toBeNull();
    expect(el.querySelector('.tl-hidden-text')?.textContent).toBe('This comment was marked as off-topic');
    expect(el.textContent).not.toContain('hidden body');
    const btn = el.querySelector<HTMLButtonElement>('.tl-hidden-btn');
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
    act(() => btn?.click());
    expect(btn?.getAttribute('aria-expanded')).toBe('true');
    expect(el.textContent).toContain('hidden body');
  });
});

describe('phone issue sheet thread', () => {
  const issue = {
    id: 'i1',
    repo: 'acme-web',
    number: 17,
    title: 'Synthetic issue',
    author: 'acme-dev',
    createdAt: '2026-01-01T09:00:00Z',
    state: 'open',
    assignees: [],
    labels: [],
    commentCount: 2,
  } as unknown as IssueSummary;
  const detail = {
    data: {
      bodyHtml: '<p>summary</p>',
      comments: [
        { id: 'IC1', author: 'build-bot', createdAt: '2026-01-01T10:00:00Z', bodyHtml: '<p>spam body</p>', minimized: { reason: 'SPAM' } },
        { id: 'IC2', author: 'acme-dev', createdAt: '2026-01-01T11:00:00Z', bodyHtml: '<p>visible body</p>' },
      ],
    } as unknown as IssueDetail,
    error: undefined,
    loading: false,
    reload: vi.fn(),
  } as unknown as Remote<IssueDetail>;

  it('draws comments on the rail and collapses hidden ones', () => {
    const el = mountNode(
      createElement(PhoneIssueSheet, {
        issue,
        viewer: 'me',
        projectStatus: false,
        detail,
        writesOff: false,
        busy: false,
        depth: 0,
        covered: false,
        onClose: vi.fn(),
        onMore: vi.fn(),
        onPrimary: vi.fn(),
        onComment: vi.fn(),
        onPick: vi.fn(),
        sub: { onOpen: vi.fn(), onLong: vi.fn(), onCreate: vi.fn(), onParent: vi.fn() },
      }),
    );
    act(() => tab(el, 'Thread').click());
    expect(el.querySelector('.ph-thread ol.tl-list')).not.toBeNull();
    expect(el.querySelector('.tl-hidden-text')?.textContent).toBe('This comment was marked as spam');
    expect(el.textContent).not.toContain('spam body');
    expect(el.textContent).toContain('visible body');
  });
});
