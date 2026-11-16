// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UpdateCheckResult } from '../shared/app-update';
import { AppBar } from '../web/phone/PhoneBars';
import { useUpdateCheck, type UpdateToast } from '../web/phone/useUpdateCheck';

const mocks = vi.hoisted(() => ({ answer: Promise.resolve({ state: 'current', version: '0.2.10' }) as Promise<unknown> }));
vi.mock('../web/api', () => ({ api: { checkUpdates: vi.fn(() => mocks.answer) } }));
vi.mock('../web/phone/usePush', () => ({ usePush: () => ({ state: 'unsupported' }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

describe('phone menu Check for updates row', () => {
  function bar(onCheckUpdates: () => void, onMenu: (on: boolean) => void) {
    return createElement(AppBar, {
      title: 'PRs',
      searching: false,
      query: '',
      density: 'comfortable',
      theme: 'dark',
      onQuery: () => undefined,
      onSearching: () => undefined,
      menu: true,
      onMenu,
      onRefresh: () => undefined,
      onDensity: () => undefined,
      onToggleTheme: () => undefined,
      onCheckUpdates,
    });
  }

  it('is the last row, and a tap closes the menu and starts the check', () => {
    const check = vi.fn();
    const onMenu = vi.fn();
    const el = render(bar(check, onMenu));
    const rows = [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(rows.at(-1)?.textContent).toBe('Check for updates');

    act(() => rows.at(-1)?.click());
    expect(onMenu).toHaveBeenCalledWith(false);
    expect(check).toHaveBeenCalledOnce();
  });
});

describe('useUpdateCheck', () => {
  let ctl: { toast: UpdateToast | undefined; check: () => void } | undefined;
  function Probe() {
    ctl = useUpdateCheck();
    return null;
  }

  it('shows Checking, then the answer', async () => {
    let answer: (r: UpdateCheckResult) => void = () => undefined;
    mocks.answer = new Promise((r) => (answer = r));
    render(createElement(Probe));

    act(() => ctl?.check());
    expect(ctl?.toast).toEqual({ ok: true, message: 'Checking for updates…', pending: true });

    await act(async () => answer({ state: 'found', version: '0.2.11', installs: 'restart' }));
    expect(ctl?.toast).toEqual({ ok: true, message: 'Nod 0.2.11 is downloading. The service restarts on it when done.' });
  });

  it('shows a failed check as an error', async () => {
    mocks.answer = Promise.resolve({ state: 'failed', error: 'could not reach GitHub' });
    render(createElement(Probe));
    await act(async () => ctl?.check());
    expect(ctl?.toast).toEqual({ ok: false, message: 'Update check failed: could not reach GitHub' });
  });

  it('shows a refused request as an error', async () => {
    mocks.answer = Promise.reject(new Error('Forbidden token'));
    render(createElement(Probe));
    await act(async () => ctl?.check());
    expect(ctl?.toast).toEqual({ ok: false, message: 'Could not check for updates: Forbidden token' });
  });
});
