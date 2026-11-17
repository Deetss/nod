// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewAccess, type ReviewAccess } from '../shared/pr-actions';
import type { ActionResult, PrDetail, PrSummary } from '../shared/types';
import { api } from '../web/api';
import { useBypassMerge, type BypassControl } from '../web/BypassMerge';
import { ReviewBar } from '../web/DetailPane';
import { actionItems, type ActionContext } from '../web/phone/action-items';
import type { PhoneBypass } from '../web/phone/PhoneBypass';
import { PhonePrSheet } from '../web/phone/PhonePrSheet';
import type { PhonePr } from '../web/phone/usePhonePr';

const mocks = vi.hoisted(() => ({ result: { ok: true, message: 'Merged #372 without review. Branch deleted.' } as ActionResult }));
vi.mock('../web/api', () => ({
  api: { bypassMerge: vi.fn((): Promise<ActionResult> => Promise.resolve(mocks.result)) },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(node: ReactNode): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const PR = {
  id: 'PR_372',
  repo: 'acme-co/orders-api',
  number: 372,
  title: 'feat: add refund endpoint',
  author: 'acme-dev',
  createdAt: '2026-11-14T09:00:00Z',
  isDraft: false,
  ci: 'pass',
  autoMerge: false,
  reviewStatus: 'review required',
} as unknown as PrSummary;

const DETAIL = {
  summary: PR,
  isOpen: true,
  headRef: 'feat/refunds',
  mergeMethod: 'squash',
  mergeAllowed: { squash: true, merge: true, rebase: false },
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'BLOCKED',
  reviewDecision: 'REVIEW_REQUIRED',
  approvals: 0,
  requiredApprovals: 1,
  reviewThreadTotal: 3,
  unresolvedThreads: 0,
  rulesetBypass: true,
  checks: [{ name: 'build', status: 'pass', duration: '' }],
  commits: [],
  commitTotal: 0,
  newCommits: 0,
} as unknown as PrDetail;

const BYPASS: ReviewAccess = { ownPr: true, admin: 'hidden', draft: false, bypass: true };

const buttons = (el: HTMLElement) => [...el.querySelectorAll('button')];
const byText = (el: HTMLElement, text: string) => buttons(el).find((b) => b.textContent?.startsWith(text));
const key = (k: string) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));

/** The review bar wired to the real hook, as App wires it. */
function Bar({ onDone, expose }: { onDone: (r: ActionResult) => void; expose: (c: BypassControl) => void }) {
  const control = useBypassMerge({ pr: PR, enabled: true, onDone });
  expose(control);
  return createElement(ReviewBar, { detail: DETAIL, disabled: false, access: BYPASS, onAction: () => {}, bypass: control });
}

function mountBar() {
  const done: ActionResult[] = [];
  let control: BypassControl | undefined;
  const el = render(createElement(Bar, { onDone: (r) => void done.push(r), expose: (c) => (control = c) }));
  return { el, done, control: () => control! };
}

describe('desktop review bar with Merge (bypass)', () => {
  beforeEach(() => {
    mocks.result = { ok: true, message: 'Merged #372 without review. Branch deleted.' };
    vi.mocked(api.bypassMerge).mockClear();
  });

  it('shows Merge (bypass) in place of Admin merge, with the method in the tooltip', () => {
    const { el } = mountBar();
    const btn = byText(el, 'Merge (bypass)');
    expect(btn?.title).toContain('Skips the required review. Squash and merge.');
    expect(byText(el, 'Admin merge')).toBeUndefined();
    expect(el.querySelector('.review-bar-note')?.textContent).toBe("Your PR: you can't approve it, but you may skip review");
  });

  it('opens the strip, and Esc cancels without merging', () => {
    const { el, control } = mountBar();
    act(() => control().open());
    expect(el.querySelector('.review-bar.is-confirm')?.textContent).toContain('Merge #372 without review?');
    expect(document.activeElement?.textContent).toContain('Merge (bypass)');
    key('Escape');
    expect(el.querySelector('.is-confirm')).toBeNull();
    expect(api.bypassMerge).not.toHaveBeenCalled();
  });

  it('merges on Enter and reports the result', async () => {
    const { el, done, control } = mountBar();
    act(() => control().open());
    (document.activeElement as HTMLElement | null)?.blur();
    await act(async () => key('Enter'));
    expect(api.bypassMerge).toHaveBeenCalledWith('acme-co/orders-api', 372);
    expect(done[0]?.message).toBe('Merged #372 without review. Branch deleted.');
    expect(el.querySelector('.is-confirm')).toBeNull();
  });

  it('disables every bar button while busy', async () => {
    let finish: (r: ActionResult) => void = () => {};
    vi.mocked(api.bypassMerge).mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const { el, control } = mountBar();
    act(() => control().open());
    act(() => byText(el, 'Merge (bypass)')?.click());
    expect(buttons(el).every((b) => b.disabled)).toBe(true);
    expect(byText(el, 'Merging')?.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.review-bar-note')?.textContent).toBe('Merging #372 without review…');
    await act(async () => finish(mocks.result));
  });

  it('shows GitHub text on failure and keeps Merge (bypass) enabled for a retry', async () => {
    mocks.result = { ok: false, message: '405: Repository rule violations found' };
    const { el, done, control } = mountBar();
    act(() => control().open());
    await act(async () => byText(el, 'Merge (bypass)')?.click());
    expect(done).toHaveLength(0);
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('405: Repository rule violations found. Nothing changed.');
    expect(byText(el, 'Merge (bypass)')?.disabled).toBe(false);
    act(() => control().open());
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('phone bar with Merge (bypass)', () => {
  const data = { detail: { data: DETAIL }, diff: {}, files: [], toggleViewed: vi.fn(), reload: vi.fn() } as unknown as PhonePr;
  const bypass = (extra: Partial<PhoneBypass> = {}): PhoneBypass => ({
    phase: 'idle',
    detail: DETAIL,
    open: vi.fn(),
    cancel: vi.fn(),
    merge: vi.fn(),
    clearError: vi.fn(),
    ...extra,
  });
  const sheet = (b: PhoneBypass | undefined) =>
    render(
      createElement(PhonePrSheet, {
        pr: PR,
        viewer: 'acme-dev',
        data,
        writesOff: false,
        busy: false,
        bypass: b,
        depth: 0,
        covered: false,
        onClose: vi.fn(),
        onFile: vi.fn(),
        onMore: vi.fn(),
        onApprove: vi.fn(),
        onComment: vi.fn(),
      }),
    );
  const bar = (el: HTMLElement) => [...el.querySelectorAll('.ph-actionbar button')].map((b) => b.textContent);

  it('puts the pill in the Approve slot and keeps Comment and More', () => {
    const el = sheet(bypass());
    expect(bar(el)).toEqual(['Merge (bypass)', 'Comment', '']);
    expect(el.textContent).toContain("Your PR: you can't approve it, but you may skip review");
  });

  it('keeps Approve when the gate fails', () => {
    expect(bar(sheet(undefined))[0]).toBe('Approve');
  });

  it('shows the strip with Cancel and Merge now, without More', () => {
    const b = bypass({ phase: 'confirm' });
    const el = sheet(b);
    expect(bar(el)).toEqual(['Cancel', 'Merge now']);
    expect(el.querySelector('.ph-bypass-strip')?.textContent).toContain('1 of 1 checks passed · 3 of 3 threads resolved');
    act(() => byText(el, 'Merge now')?.click());
    expect(b.merge).toHaveBeenCalled();
  });

  it('disables Comment while busy and leaves More open', () => {
    const el = sheet(bypass({ phase: 'busy' }));
    expect(byText(el, 'Comment')?.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('[aria-label="More actions"]')?.disabled).toBe(false);
    expect(el.querySelector('.ph-btn.is-bypass')?.getAttribute('aria-busy')).toBe('true');
  });

  it('shows the failure strip and a retry pill', () => {
    const el = sheet(bypass({ error: '405: Repository rule violations found' }));
    expect(el.querySelector('.ph-pending-bar.is-error')?.textContent).toContain('GitHub refused the merge. Nothing changed.');
    expect(byText(el, 'Merge (bypass)')?.disabled).toBe(false);
  });

  it('drops the Admin merge row from the More sheet while the pill shows', () => {
    const access = reviewAccess({
      author: 'acme-dev',
      viewer: 'acme-dev',
      viewerCanMergeAsAdmin: true,
      ci: 'pass',
      state: 'OPEN',
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'BLOCKED',
      reviewDecision: 'REVIEW_REQUIRED',
      unresolvedThreads: 0,
      threadsComplete: true,
      rulesetBypass: true,
    });
    const ctx: ActionContext = {
      target: 'pr',
      ownPr: access.ownPr,
      isAdmin: access.admin !== 'hidden',
      adminReady: access.admin === 'ready',
      orcaAvailable: false,
      issueOpen: true,
      assignedToViewer: false,
      writesOff: false,
    };
    expect(actionItems(ctx).map((i) => i.id)).not.toContain('admin-merge');
  });
});
