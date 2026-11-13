// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrcaInfo } from '../shared/orca';
import type { PrDetail } from '../shared/types';
import { FixButton } from '../web/FixMenu';
import { MergeStatusBox } from '../web/MergeStatusBox';
import { api } from '../web/api';
import { RESOLVE_SCOPE, useResolveConflicts, type MenuControls } from '../web/useFixChecks';

const dispatch = vi.hoisted(() => ({ fail: undefined as Error | undefined }));
vi.mock('../web/api', () => ({
  api: {
    orcaDispatch: vi.fn((): Promise<unknown> =>
      dispatch.fail ? Promise.reject(dispatch.fail) : Promise.resolve({ ok: true, worktree: 'pr-42-resolve-conflicts' }),
    ),
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

const noop = () => {};
const orca: OrcaInfo = { available: true, agents: ['claude'], repos: ['acme-web'] };

function detailOf(extra: Partial<PrDetail> = {}): PrDetail {
  return {
    summary: { id: 'PR_42', repo: 'acme-web', number: 42, ci: 'pass', url: 'https://example.test/42' },
    body: '',
    baseRef: 'main',
    headRef: 'build-bot/cart-rounding',
    checks: [],
    reviewLine: '',
    commits: [],
    commitTotal: 0,
    newCommits: 0,
    files: [],
    reviewBaseGone: false,
    mergeMethod: 'squash',
    mergeable: 'CONFLICTING',
    mergeStateStatus: 'DIRTY',
    ...extra,
  } as unknown as PrDetail;
}

function controls(over: Partial<MenuControls> = {}): MenuControls {
  return {
    mode: 'conflicts',
    disabled: undefined,
    orca: 'ready',
    menu: RESOLVE_SCOPE,
    openMenu: noop,
    closeMenu: noop,
    pick: noop,
    ...over,
  };
}

const menu = (fix: MenuControls) =>
  render(createElement(FixButton, { fix, scope: RESOLVE_SCOPE, label: 'Resolve conflicts', className: 'x', children: 'Go' }));
const rows = (el: HTMLElement) => [...el.querySelectorAll('[role="menuitem"]')];

describe('Resolve conflicts menu', () => {
  it('lists Dispatch with Orca then a disabled Ask Bot with its reason', () => {
    const r = rows(menu(controls()));
    expect(r.map((i) => i.querySelector('.fix-menu-title')?.textContent)).toEqual(['Dispatch with Orca', 'Ask Bot']);
    expect(r[0]?.getAttribute('aria-disabled')).toBeNull();
    expect(r[1]?.getAttribute('aria-disabled')).toBe('true');
    expect(r[1]?.textContent).toContain('Bot cannot resolve conflicts yet. It has no git merge.');
  });

  it('disables Orca with "Repo not in Orca" when the repo is unmapped', () => {
    const r = rows(menu(controls({ orca: 'unmapped' })));
    expect(r[0]?.getAttribute('aria-disabled')).toBe('true');
    expect(r[0]?.textContent).toContain('Repo not in Orca');
  });

  it('leaves only the disabled Bot row when Orca is absent', () => {
    const r = rows(menu(controls({ orca: 'absent' })));
    expect(r).toHaveLength(1);
    expect(r[0]?.getAttribute('aria-disabled')).toBe('true');
  });

  it('picks Orca with Enter, and never Bot', () => {
    const pick = vi.fn();
    const el = menu(controls({ pick }));
    const m = el.querySelector('[role="menu"]');
    act(() => void m?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(pick).toHaveBeenCalledWith('dispatch');
    pick.mockClear();
    act(() => void rows(el)[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(pick).not.toHaveBeenCalled();
  });

  it('shows Dispatching... with a spinner and ignores Esc while busy', () => {
    const closeMenu = vi.fn();
    const el = menu(controls({ busy: true, closeMenu }));
    const m = el.querySelector('[role="menu"]');
    expect(m?.getAttribute('aria-busy')).toBe('true');
    expect(rows(el)[0]?.textContent).toContain('Dispatching...');
    expect(rows(el)[0]?.querySelector('.spinner')).not.toBeNull();
    act(() => void m?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(closeMenu).not.toHaveBeenCalled();
    expect(el.querySelector('button')?.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Resolve strip', () => {
  const box = (resolve: MenuControls | undefined) =>
    render(createElement(MergeStatusBox, { detail: detailOf(), fix: undefined, resolve }));

  it('shows the button and the GitHub link under the conflict row', () => {
    const el = box(controls({ menu: undefined }));
    expect(el.querySelector('.msb-resolve button[aria-label="Resolve conflicts"]')).not.toBeNull();
    expect(el.querySelector('.msb-resolve a')?.getAttribute('href')).toBe('https://example.test/42');
    expect(el.querySelector('.msb-sub')?.textContent).toBe('Resolve the conflicts with Orca, or on GitHub, then refresh.');
  });

  it('is absent without resolve controls', () => {
    expect(box(undefined).querySelector('.msb-resolve')).toBeNull();
  });
});

describe('useResolveConflicts', () => {
  type Out = MenuControls | undefined;
  function probe(detail: PrDetail, info: OrcaInfo | undefined, notify = noop): { out: () => Out } {
    let latest: Out;
    function Probe() {
      latest = useResolveConflicts({ detail, limited: false, orca: info, notify });
      return null;
    }
    render(createElement(Probe));
    return { out: () => latest };
  }

  it('has no controls for a clean, closed or unknown PR', () => {
    expect(probe(detailOf({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' }), orca).out()).toBeUndefined();
    expect(probe(detailOf({ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }), orca).out()).toBeUndefined();
    expect(probe(detailOf({ isOpen: false }), orca).out()).toBeUndefined();
  });

  it('maps Orca availability to the menu choice', () => {
    expect(probe(detailOf(), orca).out()?.orca).toBe('ready');
    expect(probe(detailOf(), { ...orca, repos: ['other'] }).out()?.orca).toBe('unmapped');
    expect(probe(detailOf(), { available: false, agents: [] }).out()?.orca).toBe('absent');
    expect(probe(detailOf({ headIsFork: true }), orca).out()?.orca).toBe('absent');
  });

  it('dispatches the conflicts prompt in PR mode and toasts on success', async () => {
    const notify = vi.fn();
    const p = probe(detailOf(), orca, notify);
    act(() => p.out()?.openMenu(RESOLVE_SCOPE));
    expect(p.out()?.menu).toBe(RESOLVE_SCOPE);
    await act(async () => p.out()?.pick('dispatch'));
    const req = vi.mocked(api.orcaDispatch).mock.calls[0]?.[0];
    expect(req).toMatchObject({
      repo: 'acme-web',
      number: 42,
      agent: 'claude',
      name: 'pr-42-resolve-conflicts',
      baseBranch: 'build-bot/cart-rounding',
      pr: true,
    });
    expect(req?.prompt).toContain('Do not push');
    expect(notify).toHaveBeenCalledWith(true, 'Dispatched Orca for acme-web #42');
    expect(p.out()?.menu).toBeUndefined();
    expect(p.out()?.busy).toBe(false);
  });

  it('toasts the CLI message when the dispatch fails', async () => {
    dispatch.fail = new Error('orca not running');
    const notify = vi.fn();
    const p = probe(detailOf(), orca, notify);
    await act(async () => p.out()?.pick('dispatch'));
    expect(notify).toHaveBeenCalledWith(false,'Could not dispatch: orca not running');
  });

  it('never dispatches for Bot', async () => {
    const p = probe(detailOf(), orca);
    await act(async () => p.out()?.pick('bot'));
    expect(api.orcaDispatch).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  dispatch.fail = undefined;
});
