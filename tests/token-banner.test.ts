// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionState, grantedScopes, type Connection } from '../shared/connection';
import type { Stale } from '../shared/types';
import { Banner, failureLine, ListBanner } from '../web/Banner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const required = (): Connection => {
  const granted = grantedScopes(['read:org', 'gist']);
  return { state: connectionState(true, granted), source: 'gh', checkedAt: '10:26', login: 'acme-dev', granted, tokenScopes: ['read:org', 'gist'] };
};

const message = 'Something went wrong while executing your query.';
const stale: Stale = { kind: 'error', cachedAt: '10:26', message, status: 200, operation: 'InboxSync:full', at: '10:30' };
const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

describe('list banners', () => {
  it('shows the first-run banner in the accent tone with Set up GitHub', () => {
    const onFix = vi.fn();
    const el = render(createElement(ListBanner, { connection: { state: 'none', source: 'gh', checkedAt: '' }, stale: undefined, rate: undefined, syncedAt: 0, onRetry: vi.fn(), onFix }));
    expect(el.querySelector('.banner-setup')?.textContent).toContain('Nod is not connected to GitHub');
    act(() => button(el, 'Set up GitHub').click());
    expect(onFix).toHaveBeenCalled();
  });

  it('replaces the sync error with the missing-scope banner, never both', () => {
    const el = render(createElement(ListBanner, { connection: required(), stale, rate: undefined, syncedAt: Date.now(), onRetry: vi.fn(), onFix: vi.fn() }));
    expect(el.querySelectorAll('.banner')).toHaveLength(1);
    expect(el.querySelector('.banner-title')?.textContent).toBe('GitHub token is missing repo');
    expect(el.querySelector('.banner-cached')?.textContent).toMatch(/^Cached \d\d:\d\d · actions off$/);
    act(() => button(el, 'Details').click());
    expect(el.textContent).toContain('Token scopes: read:org, gist. Nod needs repo.');
  });

  it('titles a sync failure Sync failed and shows the message once', () => {
    const el = render(createElement(Banner, { stale, rate: undefined, onRetry: vi.fn() }));
    expect(el.querySelector('.banner-title')?.textContent).toBe('Sync failed');
    expect(el.textContent?.split(message)).toHaveLength(2);
    act(() => button(el, 'Details').click());
    expect(el.textContent).toContain('HTTP 200 · InboxSync:full · 10:30');
    expect(el.textContent?.split(message)).toHaveLength(2);
  });

  it('shows nothing when the token is fine and nothing failed', () => {
    const ok = { ...required(), state: 'ok' as const };
    const el = render(createElement(ListBanner, { connection: ok, stale: undefined, rate: undefined, syncedAt: 0, onRetry: vi.fn(), onFix: vi.fn() }));
    expect(el.innerHTML).toBe('');
    expect(failureLine({ kind: 'error', cachedAt: '', message: '' })).toBe('No more detail from GitHub.');
  });
});
