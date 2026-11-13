// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Topbar } from '../web/Topbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

type Flags = { refreshing: boolean; syncing: boolean; refreshDisabled?: boolean };

function render(f: Flags, onRefresh = () => {}): HTMLElement {
  if (!host) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => {
    root?.render(
      createElement(Topbar, {
        view: 'prs',
        onView: () => {},
        prUnseen: 0,
        issueUnseen: 0,
        activityUnseen: 0,
        items: [],
        syncedAt: Date.now() - 5000,
        rate: undefined,
        refreshDisabled: f.refreshDisabled ?? false,
        refreshing: f.refreshing,
        syncing: f.syncing,
        theme: 'dark',
        searchRef: createRef<HTMLInputElement>(),
        narrow: false,
        onRefresh,
        onToggleTheme: () => {},
        onPick: () => {},
        notify: { settings: {} as never, onChange: () => {}, density: 'comfortable', onDensity: () => {} },
        pairOpen: false,
        onPairPhone: () => {},
      } as never),
    );
  });
  return host;
}

const refreshBtn = (h: HTMLElement) => h.querySelector('.btn-refresh') as HTMLButtonElement;
const syncText = (h: HTMLElement) => h.querySelector('.sync-text')?.textContent;
const status = (h: HTMLElement) => h.querySelector('.top-right > [role="status"]')?.textContent;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"devices":[]}', { status: 200 })));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
});

describe('Topbar sync feedback', () => {
  it('shows the age and no spinner at rest', () => {
    const h = render({ refreshing: false, syncing: false });
    expect(syncText(h)).toMatch(/^Synced/);
    expect(h.querySelector('.btn-refresh .spinner')).toBeNull();
    expect(refreshBtn(h).getAttribute('aria-busy')).toBeNull();
  });

  it('shows the spinner and aria state while a user refresh runs, and ignores clicks', () => {
    const onRefresh = vi.fn();
    const h = render({ refreshing: true, syncing: false }, onRefresh);
    const b = refreshBtn(h);
    expect(b.querySelector('.spinner')).not.toBeNull();
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.disabled).toBe(false);
    expect(syncText(h)).toBe('Syncing...');
    act(() => b.click());
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('reads Syncing... for a background sync without a spinner or busy button', () => {
    const h = render({ refreshing: false, syncing: true });
    expect(syncText(h)).toBe('Syncing...');
    expect(h.querySelector('.btn-refresh .spinner')).toBeNull();
    expect(refreshBtn(h).getAttribute('aria-busy')).toBeNull();
  });

  it('announces Syncing then Synced for a user refresh only', () => {
    const h = render({ refreshing: false, syncing: true });
    expect(status(h)).toBe('');
    render({ refreshing: true, syncing: true });
    expect(status(h)).toBe('Syncing');
    render({ refreshing: false, syncing: false });
    expect(status(h)).toBe('Synced');
  });
});
