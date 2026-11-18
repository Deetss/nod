// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureConnections } from '../server/connections-fixtures';
import type { HubView } from '../shared/hub';
import { ConnectionsMenu } from '../web/connections/ConnectionsMenu';
import { HubDownBanner, returnText, takeSeenSent, useHubReturnToast, useLocalMode } from '../web/hub-fallback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  delete (window as { nod?: unknown }).nod;
  window.history.replaceState(null, '', '/');
});

function mount(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

/** The shell's bridge with a scripted view. */
function shell(view: HubView, retry: () => Promise<HubView> = async () => view) {
  const hub = { get: vi.fn(async () => view), check: vi.fn(), pair: vi.fn(), retry: vi.fn(retry) };
  (window as { nod?: unknown }).nod = { hub };
  return hub;
}

/** What App does with the hook: the banner while down, and the chip in local mode. */
function Page() {
  const local = useLocalMode();
  return createElement(
    'div',
    null,
    createElement(ConnectionsMenu, {
      view: { data: fixtureConnections(undefined), busy: false, check: async () => undefined, reload: () => undefined },
      onPair: () => undefined,
      onGithub: () => undefined,
      keys: false,
      localMode: local.down,
    }),
    local.down ? createElement(HubDownBanner, { retrying: local.retrying, onRetry: local.retry }) : null,
  );
}

describe('B1 banner', () => {
  it('shows the label, the detail and Retry', () => {
    const onRetry = vi.fn();
    const h = mount(createElement(HubDownBanner, { retrying: false, onRetry }));
    expect(h.querySelector('[role="alert"]')?.textContent).toContain('Hub unreachable, local mode.');
    expect(h.textContent).toContain('Seen marks are kept here and sent when the hub is back.');
    act(() => h.querySelector<HTMLButtonElement>('.hub-down-retry')!.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('spins while retrying and ignores more presses', () => {
    const onRetry = vi.fn();
    const h = mount(createElement(HubDownBanner, { retrying: true, onRetry }));
    const btn = h.querySelector<HTMLButtonElement>('.hub-down-retry')!;
    expect(btn.querySelector('.spinner')).not.toBeNull();
    expect(btn.getAttribute('aria-busy')).toBe('true');
    act(() => btn.click());
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe('local mode on the page', () => {
  it('shows the banner and the attention chip when the shell reports the hub down', async () => {
    shell({ url: 'https://hub.example.ts.net', attached: false, down: true });
    const h = mount(createElement(Page));
    await flush();
    expect(h.querySelector('.hub-down')).not.toBeNull();
    const chip = h.querySelector('.cx-chip')!;
    expect(chip.className).toContain('is-attention');
    expect(chip.textContent).toContain('Local mode · hub down');
  });

  it('Retry asks the shell and shows the spinner until it answers', async () => {
    let answer: (v: HubView) => void = () => undefined;
    const hub = shell({ url: 'https://hub.example.ts.net', attached: false, down: true }, () => new Promise((r) => (answer = r)));
    const h = mount(createElement(Page));
    await flush();
    act(() => h.querySelector<HTMLButtonElement>('.hub-down-retry')!.click());
    expect(hub.retry).toHaveBeenCalledTimes(1);
    expect(h.querySelector('.hub-down-retry .spinner')).not.toBeNull();
    await act(async () => answer({ url: 'https://hub.example.ts.net', attached: false, down: true }));
    await flush();
    expect(h.querySelector('.hub-down-retry .spinner')).toBeNull();
  });

  it('shows no banner on a desktop without a Hub URL', async () => {
    shell({ url: '', attached: false, down: false });
    const h = mount(createElement(Page));
    await flush();
    expect(h.querySelector('.hub-down')).toBeNull();
    expect(h.querySelector('.cx-chip')!.textContent).not.toContain('Local mode');
  });

  it('shows no banner without the shell, as on a phone', async () => {
    const h = mount(createElement(Page));
    await flush();
    expect(h.querySelector('.hub-down')).toBeNull();
  });
});

function ToastProbe({ push }: { push: (t: { message: string; ms?: number }) => void }) {
  useHubReturnToast(push);
  return null;
}

describe('reconnect toast', () => {
  it('reads the count once and strips it from the URL', () => {
    const url = new URL('https://hub.example.ts.net/?view=issues&seen-sent=12#pr');
    expect(takeSeenSent(url)).toEqual({ count: 12, rest: '/?view=issues#pr' });
    expect(takeSeenSent(new URL('https://hub.example.ts.net/?seen-sent=many'))).toBeUndefined();
    expect(takeSeenSent(new URL('https://hub.example.ts.net/'))).toBeUndefined();
  });

  it('says how many marks were sent', () => {
    expect(returnText(12)).toBe('Back on the hub. 12 seen marks sent.');
    expect(returnText(1)).toBe('Back on the hub. 1 seen mark sent.');
  });

  it('shows for 4 s in the desktop app, then leaves the URL clean', () => {
    shell({ url: 'https://hub.example.ts.net', attached: true, down: false });
    window.history.replaceState(null, '', '/?seen-sent=3');
    const push = vi.fn();
    mount(createElement(ToastProbe, { push }));
    expect(push).toHaveBeenCalledWith({ kind: 'ok', message: 'Back on the hub. 3 seen marks sent.', ms: 4000 });
    expect(window.location.search).toBe('');
  });

  it('never shows without the shell, as on a phone', () => {
    window.history.replaceState(null, '', '/?seen-sent=3');
    const push = vi.fn();
    mount(createElement(ToastProbe, { push }));
    expect(push).not.toHaveBeenCalled();
  });
});
