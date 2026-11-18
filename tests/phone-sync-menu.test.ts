// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppBar } from '../web/phone/PhoneBars';
import type { SyncProblem, SyncStatus } from '../web/phone/phone-logic';

vi.mock('../web/phone/usePush', () => ({ usePush: () => ({ state: 'unsupported' }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const HEALTHY: SyncStatus = { problem: 'none', title: 'Synced 2m ago', api: 'API 4,812 of 5,000 left', reset: 'Resets 14:40 · last sync cost 12' };

interface Opts {
  sync?: SyncStatus;
  menu?: boolean;
  onRefresh?: () => Promise<boolean>;
  onMenu?: (on: boolean) => void;
}

function mount(o: Opts = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const props = (sync: SyncStatus) => ({
    title: 'Pull requests',
    density: 'compact' as const,
    theme: 'dark' as const,
    menu: o.menu ?? true,
    onMenu: o.onMenu ?? vi.fn(),
    sync,
    syncing: false,
    onRefresh: o.onRefresh ?? vi.fn(() => Promise.resolve(true)),
    onDensity: vi.fn(),
    onToggleTheme: vi.fn(),
    onCheckUpdates: vi.fn(),
    connections: 'ok' as const,
    onConnections: vi.fn(),
  });
  act(() => root?.render(createElement(AppBar, props(o.sync ?? HEALTHY))));
  return (sync: SyncStatus) => act(() => root?.render(createElement(AppBar, props(sync))));
}

const more = () => host?.querySelector<HTMLButtonElement>('.ph-iconbtn');
const block = () => host?.querySelector('.ph-menu-status');
const syncNow = () => host?.querySelector<HTMLButtonElement>('.ph-menu-sync');
const items = () => [...(host?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

describe('phone ··· menu status block', () => {
  it('opens with Connections, then the block, and no Refresh row', () => {
    mount();
    const menu = host?.querySelector('.ph-menu');
    expect(menu?.firstElementChild?.className).toBe('ph-menu-conns');
    expect(menu?.children[1]?.className).toBe('ph-menu-status');
    expect(block()?.getAttribute('role')).toBe('group');
    const title = block()?.querySelector('.ph-menu-status-title');
    expect(block()?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(title?.textContent).toBe('Synced 2m ago');
    expect(block()?.querySelector('.ph-menu-status-api')?.textContent).toBe('API 4,812 of 5,000 left');
    expect(block()?.querySelector('.ph-menu-status-reset')?.textContent).toBe('Resets 14:40 · last sync cost 12');
    expect(items()[1]).toBe(syncNow());
    expect(items().map((b) => b.textContent)).not.toContain('Refresh');
  });

  it('runs Sync now once, shows Syncing… disabled, keeps the menu open, then shows the new title', async () => {
    let done: (ok: boolean) => void = () => undefined;
    const onRefresh = vi.fn(() => new Promise<boolean>((r) => (done = r)));
    const onMenu = vi.fn();
    const rerender = mount({ onRefresh, onMenu });
    act(() => syncNow()?.click());
    act(() => syncNow()?.click());
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(syncNow()?.disabled).toBe(true);
    expect(syncNow()?.textContent).toBe('Syncing…');
    expect(syncNow()?.getAttribute('aria-busy')).toBe('true');
    expect(syncNow()?.className).toContain('is-busy');
    expect(onMenu).not.toHaveBeenCalled();
    rerender({ ...HEALTHY, title: 'Synced just now' });
    await act(async () => done(true));
    expect(syncNow()?.textContent).toBe('Sync now');
    expect(block()?.querySelector('.ph-menu-status-title')?.textContent).toBe('Synced just now');
    expect(host?.querySelector('.sr-only[role="status"]')?.textContent).toBe('Synced just now');
  });

  it('disables Sync now and sends nothing while rate limited', () => {
    const onRefresh = vi.fn(() => Promise.resolve(true));
    mount({ onRefresh, sync: { problem: 'limited', title: 'Rate limited', api: 'API 0 of 5,000 left', reset: 'Resets 14:40, in 22m.' } });
    expect(syncNow()?.disabled).toBe(true);
    act(() => syncNow()?.click());
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it.each<[SyncProblem, string, string]>([
    ['stale', 'attention', 'Synced 47m ago · Stale'],
    ['low', 'attention', 'API 312 of 5,000 left · Low'],
    ['failed', 'danger', 'Sync failed'],
    ['limited', 'danger', 'Rate limited'],
    ['unreachable', 'danger', 'Cached 14:02 · actions off'],
  ])('puts the %s dot on ··· and names it in the label and the block', (problem, tone, title) => {
    mount({ menu: false, sync: { problem, title } });
    const dot = more()?.querySelector('.ph-sync-dot');
    expect(dot?.getAttribute('data-tone')).toBe(tone);
    expect(dot?.getAttribute('aria-hidden')).toBe('true');
    expect(more()?.getAttribute('aria-label')).toBe('More, sync problem');
    act(() => root?.unmount());
    mount({ sync: { problem, title } });
    expect(block()?.querySelector('.ph-menu-status-icon')?.getAttribute('data-tone')).toBe(tone);
    expect(block()?.querySelector('.ph-menu-status-title')?.textContent).toBe(title);
  });

  it('shows no dot and a plain label when healthy', () => {
    mount({ menu: false });
    expect(more()?.querySelector('.ph-sync-dot')).toBeNull();
    expect(more()?.getAttribute('aria-label')).toBe('More');
    expect(more()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('drops the API and reset lines without a rate', () => {
    mount({ sync: { problem: 'none', title: 'Not synced yet' } });
    expect(block()?.querySelector('.ph-menu-status-api')).toBeNull();
    expect(block()?.querySelector('.ph-menu-status-reset')).toBeNull();
  });
});
