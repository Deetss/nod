// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrcaInfo } from '../shared/orca';
import type { PrDetail, PrThreadItem } from '../shared/types';
import { ThreadCard } from '../web/DetailBody';
import { api } from '../web/api';
import { ALL_COMMENTS, useFixComments, type CommentControls } from '../web/useFixComments';

const mocks = vi.hoisted(() => ({ fail: undefined as Error | undefined, bot: { ok: true, message: 'ok' } as { ok: boolean; message: string } }));
vi.mock('../web/api', () => ({
  api: {
    orcaDispatch: vi.fn((): Promise<unknown> =>
      mocks.fail ? Promise.reject(mocks.fail) : Promise.resolve({ ok: true, worktree: 'pr-42-fix-comment' }),
    ),
    prComment: vi.fn((): Promise<unknown> => Promise.resolve(mocks.bot)),
  },
}));

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

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});
beforeEach(() => {
  mocks.fail = undefined;
  mocks.bot = { ok: true, message: 'ok' };
});

const noop = () => {};
const orca: OrcaInfo = { available: true, agents: ['claude'], repos: ['acme-web'] };

const thread = (n: number, over: object = {}): PrThreadItem => ({
  kind: 'thread',
  at: '2026-11-08T17:00:00Z',
  id: `T${n}`,
  path: `src/file_${n}.py`,
  line: n,
  resolved: false,
  isOutdated: false,
  comments: [
    { id: `C${n}`, author: 'build-bot', createdAt: '2026-11-08T17:00:00Z', bodyHtml: '<p>Fix it.</p>', body: `Fix it ${n}.`, url: `https://example.test/c${n}` },
    { id: `R${n}`, author: 'acme-dev', createdAt: '2026-11-08T18:00:00Z', bodyHtml: '<p>reply</p>' },
  ],
  ...over,
});

function detailOf(items: PrThreadItem[], extra: Partial<PrDetail> = {}): PrDetail {
  return {
    summary: { id: 'PR_42', repo: 'acme-web', number: 42, ci: 'pass', url: 'https://example.test/42' },
    headRef: 'build-bot/cart',
    baseRef: 'main',
    thread: items,
    ...extra,
  } as unknown as PrDetail;
}

type Out = CommentControls | undefined;
function probe(detail: PrDetail, info: OrcaInfo | undefined = orca, o: { limited?: boolean; notify?: (ok: boolean, m: string) => void; onDone?: () => void } = {}) {
  let latest: Out;
  function Probe() {
    latest = useFixComments({ detail, limited: o.limited ?? false, orca: info, notify: o.notify ?? noop, onDone: o.onDone ?? noop });
    return null;
  }
  render(createElement(Probe));
  return { out: () => latest };
}

describe('useFixComments availability', () => {
  it('is absent for a closed PR or a PR without inline threads', () => {
    expect(probe(detailOf([thread(1)], { isOpen: false })).out()).toBeUndefined();
    expect(probe(detailOf([])).out()).toBeUndefined();
  });

  it('counts fixable threads and keeps the header at zero when none are', () => {
    const p = probe(detailOf([thread(1), thread(2, { resolved: true }), thread(3, { isOutdated: true })]));
    expect(p.out()?.total).toBe(1);
    const none = probe(detailOf([thread(1, { resolved: true })]));
    expect(none.out()?.total).toBe(0);
  });

  it('maps Orca availability', () => {
    expect(probe(detailOf([thread(1)])).out()?.orca).toBe('ready');
    expect(probe(detailOf([thread(1)]), { ...orca, repos: ['x'] }).out()?.orca).toBe('unmapped');
    expect(probe(detailOf([thread(1)]), { available: false, agents: [] }).out()?.orca).toBe('absent');
    expect(probe(detailOf([thread(1)], { headIsFork: true })).out()?.orca).toBe('absent');
  });

  it('reports Offline when limited', () => {
    expect(probe(detailOf([thread(1)]), orca, { limited: true }).out()?.disabled).toBe('Offline');
  });
});

describe('useFixComments actions', () => {
  it('posts the /bot comment straight away and toasts the file and line', async () => {
    const notify = vi.fn();
    const onDone = vi.fn();
    const p = probe(detailOf([thread(1)]), orca, { notify, onDone });
    act(() => p.out()?.openMenu('T1'));
    await act(async () => p.out()?.pick('bot'));
    const [repo, number, body] = vi.mocked(api.prComment).mock.calls[0] as unknown as [string, number, string];
    expect([repo, number]).toEqual(['acme-web', 42]);
    expect(body.startsWith('/bot fix this review comment on src/file_1.py:1')).toBe(true);
    expect(notify).toHaveBeenCalledWith(true, 'Asked Bot to fix file_1.py:1');
    expect(onDone).toHaveBeenCalled();
    expect(p.out()?.menu).toBeUndefined();
    expect(p.out()?.busy).toBe(false);
  });

  it('asks Bot about every fixable comment from the header scope', async () => {
    const notify = vi.fn();
    const p = probe(detailOf([thread(1), thread(2), thread(3, { resolved: true })]), orca, { notify });
    act(() => p.out()?.openMenu(ALL_COMMENTS));
    expect(p.out()).toMatchObject({ all: true, count: 2 });
    await act(async () => p.out()?.pick('bot'));
    const body = vi.mocked(api.prComment).mock.calls[0]?.[2] as string;
    expect(body.split('\n')[0]).toBe('/bot fix these 2 review comments on this PR:');
    expect(notify).toHaveBeenCalledWith(true, 'Asked Bot to fix 2 comments');
  });

  it('toasts the server message when the post fails', async () => {
    mocks.bot = { ok: false, message: 'rate limited' };
    const notify = vi.fn();
    const p = probe(detailOf([thread(1)]), orca, { notify });
    act(() => p.out()?.openMenu('T1'));
    await act(async () => p.out()?.pick('bot'));
    expect(notify).toHaveBeenCalledWith(false, 'Could not post comment on acme-web #42: rate limited');
    expect(p.out()?.menu).toBeUndefined();
  });

  it('dispatches the comment prompt in PR mode on the head branch', async () => {
    const notify = vi.fn();
    const p = probe(detailOf([thread(1)]), orca, { notify });
    act(() => p.out()?.openMenu('T1'));
    await act(async () => p.out()?.pick('dispatch'));
    const req = vi.mocked(api.orcaDispatch).mock.calls[0]?.[0];
    expect(req).toMatchObject({ repo: 'acme-web', number: 42, agent: 'claude', name: 'pr-42-fix-comment', baseBranch: 'build-bot/cart', pr: true });
    expect(req?.prompt).toContain('untrusted task data');
    expect(req?.prompt).toContain('Commit the fix and push it to build-bot/cart.');
    expect(notify).toHaveBeenCalledWith(true, 'Dispatched Orca for acme-web #42');
  });

  it('names the plural worktree for the header scope', async () => {
    const p = probe(detailOf([thread(1), thread(2)]));
    act(() => p.out()?.openMenu(ALL_COMMENTS));
    await act(async () => p.out()?.pick('dispatch'));
    expect(vi.mocked(api.orcaDispatch).mock.calls[0]?.[0].name).toBe('pr-42-fix-comments');
  });

  it('toasts the CLI message when the dispatch fails', async () => {
    mocks.fail = new Error('orca not running');
    const notify = vi.fn();
    const p = probe(detailOf([thread(1)]), orca, { notify });
    act(() => p.out()?.openMenu('T1'));
    await act(async () => p.out()?.pick('dispatch'));
    expect(notify).toHaveBeenCalledWith(false, 'Could not dispatch: orca not running');
  });

  it('never dispatches when the repo is not in Orca', async () => {
    const p = probe(detailOf([thread(1)]), { ...orca, repos: ['x'] });
    act(() => p.out()?.openMenu('T1'));
    await act(async () => p.out()?.pick('dispatch'));
    expect(api.orcaDispatch).not.toHaveBeenCalled();
  });

  it('does not open a menu while offline', () => {
    const p = probe(detailOf([thread(1)]), orca, { limited: true });
    act(() => p.out()?.openMenu('T1'));
    expect(p.out()?.menu).toBeUndefined();
  });
});

describe('ThreadCard with comment controls', () => {
  const card = (items: PrThreadItem[], over: Partial<CommentControls> = {}, info: OrcaInfo = orca) => {
    let fix: Out;
    function Probe() {
      fix = useFixComments({ detail: detailOf(items), limited: false, orca: info, notify: noop, onDone: noop });
      return fix ? createElement(ThreadCard, { items, fix: { ...fix, ...over } }) : null;
    }
    return render(createElement(Probe));
  };
  const labels = (el: HTMLElement) => [...el.querySelectorAll('button[aria-haspopup="menu"]')].map((b) => b.getAttribute('aria-label'));

  it('puts Fix on fixable thread roots only, and Fix N comments in the header', () => {
    const el = card([thread(1), thread(2, { resolved: true }), thread(3, { isOutdated: true }), thread(4)]);
    expect(labels(el)).toEqual(['Fix 2 comments', 'Fix comment on file_1.py:1', 'Fix comment on file_4.py:4']);
  });

  it('has no Fix button on replies', () => {
    const el = card([thread(1)]);
    expect(el.querySelectorAll('.fix-comment')).toHaveLength(1);
  });

  it('drops the verb on inline review cards', () => {
    const el = card([thread(1)]);
    expect(el.querySelector('.tl-card-h')?.textContent).not.toContain('commented');
    expect(el.querySelector('.tl-card-tools .fix-comment')).not.toBeNull();
  });

  it('disables the header button with a reason at zero', () => {
    const el = card([thread(1, { resolved: true })]);
    const h = el.querySelector('.fix-thread');
    expect(h?.textContent?.trim()).toBe('Fix 0 comments');
    expect(h?.getAttribute('title')).toBe('No comments to fix');
    expect((h as HTMLButtonElement).disabled).toBe(true);
  });

  it('says Fix 1 comment for one', () => {
    expect(labels(card([thread(1)]))[0]).toBe('Fix 1 comment');
  });

  it('opens the comments menu in a portal with Bot then Orca', () => {
    const el = card([thread(1)], { menu: 'T1' });
    expect(el.querySelector('[role="menu"]')).toBeNull();
    const m = document.body.querySelector('[role="menu"]');
    expect(m?.getAttribute('aria-label')).toBe('Fix review comment');
    const rows = [...(m?.querySelectorAll('[role="menuitem"]') ?? [])];
    expect(rows.map((r) => r.querySelector('.fix-menu-title')?.textContent)).toEqual(['Ask Bot', 'Dispatch with Orca']);
    expect(rows[0]?.textContent).toContain('Posts /bot asking to fix this comment');
    expect(rows[1]?.textContent).toContain('The agent fixes this comment.');
  });

  it('words the header menu for all comments', () => {
    card([thread(1), thread(2)], { menu: ALL_COMMENTS, all: true, count: 2 });
    const m = document.body.querySelector('[role="menu"]');
    expect(m?.getAttribute('aria-label')).toBe('Fix review comments');
    expect(m?.textContent).toContain('Posts one /bot comment listing 2 comments');
    expect(m?.textContent).toContain('The agent fixes 2 comments.');
  });

  it('keeps one row when Orca is absent, and disables Orca when the repo is unmapped', () => {
    card([thread(1)], { menu: 'T1' }, { available: false, agents: [] });
    expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    act(() => root?.unmount());
    card([thread(1)], { menu: 'T1' }, { ...orca, repos: ['x'] });
    const rows = [...document.body.querySelectorAll('[role="menuitem"]')];
    expect(rows[1]?.getAttribute('aria-disabled')).toBe('true');
    expect(rows[1]?.textContent).toContain('Repo not in Orca');
  });

  it('shows Posting... on the Bot row and a spinner on the busy button only', () => {
    const el = card([thread(1), thread(2)], { menu: 'T1', busy: true, busyKind: 'bot', busyScope: 'T1' });
    const m = document.body.querySelector('[role="menu"]');
    expect(m?.getAttribute('aria-busy')).toBe('true');
    const rows = [...(m?.querySelectorAll('[role="menuitem"]') ?? [])];
    expect(rows[0]?.textContent).toContain('Posting...');
    expect(rows[0]?.querySelector('.spinner')).not.toBeNull();
    expect(rows[1]?.querySelector('.spinner')).toBeNull();
    const btns = [...el.querySelectorAll('.fix-comment')];
    expect(btns[0]?.querySelector('.spinner')).not.toBeNull();
    expect(btns[0]?.getAttribute('aria-busy')).toBe('true');
    expect(btns[1]?.querySelector('.spinner')).toBeNull();
  });

  it('shows Dispatching... on the Orca row when dispatch is picked', () => {
    card([thread(1)], { menu: 'T1', busy: true, busyKind: 'dispatch', busyScope: 'T1' });
    const rows = [...document.body.querySelectorAll('[role="menuitem"]')];
    expect(rows[1]?.textContent).toContain('Dispatching...');
    expect(rows[1]?.querySelector('.spinner')).not.toBeNull();
  });

  it('rows read Offline and are disabled when offline', () => {
    card([thread(1)], { menu: 'T1', disabled: 'Offline' });
    const rows = [...document.body.querySelectorAll('[role="menuitem"]')];
    expect(rows.every((r) => r.getAttribute('aria-disabled') === 'true' && r.textContent?.includes('Offline'))).toBe(true);
  });

  it('closes the menu when the pane scrolls, unless busy', () => {
    const closeMenu = vi.fn();
    card([thread(1)], { menu: 'T1', closeMenu });
    act(() => void document.dispatchEvent(new Event('scroll', { bubbles: false })));
    act(() => void window.dispatchEvent(new Event('scroll')));
    expect(closeMenu).toHaveBeenCalled();
    act(() => root?.unmount());
    closeMenu.mockClear();
    card([thread(1)], { menu: 'T1', closeMenu, busy: true, busyKind: 'bot', busyScope: 'T1' });
    act(() => void window.dispatchEvent(new Event('scroll')));
    expect(closeMenu).not.toHaveBeenCalled();
  });
});
