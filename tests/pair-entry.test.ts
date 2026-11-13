// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../shared/notify-rules';
import { NOT_PAIRED_HTML, PAIR_HTML } from '../server/pair-pages';
import { useHotkeys, type HotkeyHandlers } from '../web/hooks';
import { useIssueHotkeys, type IssueHotkeys } from '../web/issues/useIssueHotkeys';
import { Topbar } from '../web/Topbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

function device(n: number) {
  return { id: `d${n}`, name: `Phone ${n}`, createdAt: '2026-11-06T10:00:00Z', lastSeen: '2026-11-06T11:00:00Z' };
}

function stubDevices(count: number | 'fail') {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      count === 'fail'
        ? Promise.resolve(new Response('{"error":"forbidden"}', { status: 403 }))
        : Promise.resolve(
            new Response(JSON.stringify({ phoneUrl: 'https://x.example.ts.net', devices: Array.from({ length: count }, (_, i) => device(i)) })),
          ),
    ),
  );
}

async function render(node: React.ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {});
  return host;
}

function topbar(onPairPhone = () => {}) {
  return createElement(Topbar, {
    view: 'prs',
    onView: () => {},
    prUnseen: 0,
    issueUnseen: 0,
    activityUnseen: 0,
    items: [],
    syncedAt: undefined,
    rate: undefined,
    refreshDisabled: false,
    refreshing: false,
    syncing: false,
    theme: 'dark',
    searchRef: { current: null },
    narrow: false,
    onRefresh: () => {},
    onToggleTheme: () => {},
    onPick: () => {},
    notify: { settings: DEFAULT_SETTINGS, onChange: () => {}, density: 'comfortable', onDensity: () => {} },
    pairOpen: false,
    onPairPhone,
    onSettings: () => {},
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

describe('Topbar phone button', () => {
  it.each([
    [0, undefined, 'Pair phone, no phones paired', 'Pair phone (P)'],
    [2, '2', 'Pair phone, 2 phones paired', 'Pair phone (P). 2 phones paired.'],
    [12, '9+', 'Pair phone, 12 phones paired', 'Pair phone (P). 12 phones paired.'],
  ] as const)('with %i devices shows badge %s', async (count, badge, label, title) => {
    stubDevices(count);
    const el = await render(topbar());
    const btn = el.querySelector<HTMLButtonElement>('.pair-btn');
    expect(btn?.getAttribute('aria-label')).toBe(label);
    expect(btn?.title).toBe(title);
    expect(btn?.querySelector('.view-badge')?.textContent).toBe(badge);
  });

  it('sits directly before the bell', async () => {
    stubDevices(1);
    const el = await render(topbar());
    const labels = [...el.querySelectorAll('.top-icons > *')].map(
      (n) => n.querySelector('button')?.getAttribute('aria-label') ?? n.getAttribute('aria-label'),
    );
    expect(labels[0]).toBe('Pair phone, 1 phone paired');
    expect(el.querySelector('.top-icons .notify-menu')).not.toBeNull();
  });

  it('is hidden when the devices request fails', async () => {
    stubDevices('fail');
    const el = await render(topbar());
    expect(el.querySelector('.pair-btn')).toBeNull();
    expect(el.querySelector('.notify-menu')).not.toBeNull();
  });

  it('calls onPairPhone on click', async () => {
    stubDevices(0);
    const onPairPhone = vi.fn();
    const el = await render(topbar(onPairPhone));
    await act(async () => el.querySelector<HTMLButtonElement>('.pair-btn')?.click());
    expect(onPairPhone).toHaveBeenCalledOnce();
  });
});

function noop(): () => void {
  return () => {};
}

function PrKeys({ pair }: { pair: () => void }) {
  const h = new Proxy({ pair }, { get: (t, k) => (k in t ? t[k as 'pair'] : noop()) }) as unknown as HotkeyHandlers;
  useHotkeys(h, true);
  return null;
}

function IssueKeys({ pair }: { pair: () => void }) {
  const h = new Proxy({ pair }, { get: (t, k) => (k in t ? t[k as 'pair'] : noop()) }) as unknown as IssueHotkeys;
  useIssueHotkeys(h, true);
  return null;
}

function press(key: string, target: EventTarget = window, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
}

describe.each([
  ['PR view', PrKeys],
  ['Issues view', IssueKeys],
] as const)('P key in the %s', (_name, Keys) => {
  it('opens the dialog on Shift+p only', async () => {
    const pair = vi.fn();
    await render(createElement(Keys, { pair }));
    press('p');
    expect(pair).not.toHaveBeenCalled();
    press('P', window, { ctrlKey: true });
    expect(pair).not.toHaveBeenCalled();
    press('P');
    expect(pair).toHaveBeenCalledOnce();
  });

  it('does nothing while typing in an input', async () => {
    const pair = vi.fn();
    const el = await render(createElement(Keys, { pair }));
    const input = document.createElement('input');
    el.append(input);
    input.focus();
    press('P', input);
    expect(pair).not.toHaveBeenCalled();
  });
});

describe('phone pages', () => {
  it('Not paired page carries the heading and copy', () => {
    expect(NOT_PAIRED_HTML).toContain('<h1>Not paired</h1>');
    expect(NOT_PAIRED_HTML).toContain(
      "On your computer, open Nod and click the phone icon in the top bar. Then scan the code with this phone&#39;s camera.".replace('&#39;', "'"),
    );
    expect(NOT_PAIRED_HTML).toContain('role="status"');
    expect(NOT_PAIRED_HTML).not.toContain('<script');
  });

  it('pair page ships Pairing, Not paired and Pairing failed copy', () => {
    expect(PAIR_HTML).toContain('<h1 id="title">Pairing...</h1>');
    expect(PAIR_HTML).toContain('Keep this page open.');
    expect(PAIR_HTML).toContain('Not paired');
    expect(PAIR_HTML).toContain('Pairing failed');
    expect(PAIR_HTML).toContain(
      'On your computer, open Nod, click the phone icon in the top bar and scan the new code.',
    );
    expect(PAIR_HTML).toContain("setAttribute('role', 'alert')");
    expect(PAIR_HTML).toContain('#f0f6fc');
  });
});

describe('pair page script', () => {
  /** Runs the page script against a fake location and fetch, and returns where it navigated. */
  async function runPairPage(href: string): Promise<{ body: unknown; replaced: string }> {
    const url = new URL(href);
    let replaced = '';
    let body: unknown;
    const location = {
      hash: url.hash,
      search: url.search,
      pathname: url.pathname,
      replace: (to: string) => void (replaced = to),
    };
    const fetchStub = (_: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    const doc = new DOMParser().parseFromString(PAIR_HTML, 'text/html');
    const script = doc.querySelector('script')?.textContent ?? '';
    new Function('location', 'fetch', 'document', 'history', script)(location, fetchStub, doc, window.history);
    await new Promise((r) => setTimeout(r, 0));
    return { body, replaced };
  }

  it('pairs from the fragment and lands on the inbox', async () => {
    expect(await runPairPage('https://hq.example.ts.net/pair#code=abc')).toEqual({ body: { code: 'abc' }, replaced: '/' });
  });

  it('keeps ?apk= for the inbox without mixing it into the code', async () => {
    const out = await runPairPage('https://hq.example.ts.net/pair?apk=7#code=abc');
    expect(out).toEqual({ body: { code: 'abc' }, replaced: '/?apk=7' });
  });
});
