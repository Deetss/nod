// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckResult, HubStatus, PairResult } from '../shared/hub';
import type { HostPrefs, HostStatus } from '../shared/orca-hosts';
import { HubPaneBody } from '../web/settings/HubPane';
import type { HubSource } from '../web/settings/hub-source';
import { useHub } from '../web/settings/useHub';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HUB = 'https://hub.example.ts.net';
const HOSTS: HostStatus[] = [
  { name: 'local', online: true, lastSeen: 1 },
  { name: 'laptop', online: true, lastSeen: 1 },
  { name: 'desktop', online: false, lastSeen: 1 },
];
const PREFS: HostPrefs = { defaultHost: null, hosts: { 'acme-co/orders-api': 'laptop', 'acme-co/infra': 'desktop' } };
const REPOS = ['acme-co/infra', 'acme-co/orders-api', 'acme-co/web-app'];

let root: Root | undefined;
let host: HTMLElement | undefined;
let calls: { url: string; body?: string }[] = [];

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  vi.unstubAllGlobals();
});

interface SourceOpts {
  url: string;
  attached: boolean;
  status?: HubStatus;
  editable?: boolean;
  check?: (url: string) => Promise<CheckResult>;
  pair?: (input: string) => Promise<PairResult>;
}

function source(o: SourceOpts): HubSource {
  return {
    editable: o.editable ?? !o.attached,
    url: () => Promise.resolve({ url: o.url, attached: o.attached }),
    check: o.check ?? ((url) => Promise.resolve({ ok: true, url, status: url ? o.status : undefined })),
    pair: o.pair ?? (() => Promise.resolve({ ok: true })),
  };
}

function Harness({ src }: { src: HubSource }) {
  return createElement(HubPaneBody, { hub: useHub(src), repos: REPOS });
}

async function mount(src: HubSource, hosts: HostStatus[] = HOSTS): Promise<HTMLElement> {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      const body = url.startsWith('/api/orca/hosts') ? hosts : url.startsWith('/api/orca/host-prefs') ? PREFS : { enabled: true, repos: {} };
      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(createElement(Harness, { src })));
  await act(async () => {});
  await act(async () => {});
  return host;
}

const pill = (el: HTMLElement) => el.querySelector('.hub-pill');
const button = (el: HTMLElement, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text);

describe('Settings > Hub states', () => {
  it('URL empty: no pill, no pairing, hosts shown because this machine has paired hosts', async () => {
    const el = await mount(source({ url: '', attached: false }));
    expect(el.querySelector<HTMLInputElement>('input.hub-url')?.value).toBe('');
    expect(pill(el)).toBeNull();
    expect(button(el, 'Pair this desktop')).toBeUndefined();
    expect(el.querySelector('.hub-hosts')).not.toBeNull();
  });

  it('URL empty on a machine with no paired hosts hides the hosts section', async () => {
    const el = await mount(source({ url: '', attached: false }), [HOSTS[0]!]);
    expect(el.querySelector('.hub-hosts')).toBeNull();
  });

  it('checking: a neutral pill and a disabled Check', async () => {
    const el = await mount(source({ url: HUB, attached: false, check: () => new Promise(() => undefined) }));
    expect(pill(el)?.className).toContain('is-neutral');
    expect(pill(el)?.textContent).toBe('Checking...');
    expect(button(el, 'Check')?.disabled).toBe(true);
  });

  it('reachable and paired as admin: success pill, no Pair, editable hosts saved on the hub', async () => {
    const el = await mount(source({ url: HUB, attached: true, status: { state: 'paired', role: 'admin', version: '0.2.32' } }));
    expect(pill(el)?.className).toContain('is-success');
    expect(pill(el)?.textContent).toBe('Reachable · paired as admin · v0.2.32');
    expect(button(el, 'Pair this desktop')).toBeUndefined();
    expect(el.querySelector<HTMLInputElement>('input.hub-url')?.readOnly).toBe(true);
    expect(el.textContent).toContain('nod --local');
    const def = el.querySelector<HTMLSelectElement>('select.hub-default-select');
    expect(def?.disabled).toBe(false);
    expect(def?.selectedOptions[0]?.textContent).toBe('local (hub)');
    expect(el.textContent).not.toContain('Ask an admin device');
  });

  it('reachable, not paired: attention pill and Pair this desktop, which pairs with the pasted link', async () => {
    const pair = vi.fn((_input: string) => Promise.resolve<PairResult>({ ok: true }));
    const el = await mount(source({ url: HUB, attached: false, status: { state: 'not-paired' }, pair }));
    expect(pill(el)?.className).toContain('is-attention');
    expect(pill(el)?.textContent).toBe('Reachable · not paired');
    expect(el.querySelector('.hub-hosts')).toBeNull();
    await act(async () => button(el, 'Pair this desktop')?.click());
    const input = el.querySelector<HTMLInputElement>('input.hub-pair-input')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(input, `${HUB}/pair#code=abcdEFGH_123`);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(el, 'Pair')?.click());
    expect(pair).toHaveBeenCalledWith(`${HUB}/pair#code=abcdEFGH_123`);
  });

  it('unreachable: danger pill and nothing to pair', async () => {
    const el = await mount(source({ url: HUB, attached: false, status: { state: 'unreachable' } }));
    expect(pill(el)?.className).toContain('is-danger');
    expect(pill(el)?.textContent).toBe('Unreachable');
    expect(button(el, 'Pair this desktop')).toBeUndefined();
  });

  it('desktop role: hosts read only with the note', async () => {
    const el = await mount(source({ url: HUB, attached: true, status: { state: 'paired', role: 'desktop', version: '0.2.32' } }));
    expect(el.textContent).toContain('Ask an admin device to change this.');
    const selects = [...el.querySelectorAll<HTMLSelectElement>('.hub-hosts select')];
    expect(selects.length).toBe(4);
    expect(selects.every((s) => s.disabled)).toBe(true);
  });

  it('shows a refused URL under the field', async () => {
    const check = (url: string) =>
      Promise.resolve<CheckResult>(url ? { ok: false, error: 'The hub URL must start with https://.' } : { ok: true, url: '', status: undefined });
    const el = await mount(source({ url: '', attached: false, check }));
    const input = el.querySelector<HTMLInputElement>('input.hub-url')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(input, 'http://hub.example.ts.net');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(el, 'Check')?.click());
    expect(el.querySelector('.field-error')?.textContent).toContain('https://');
  });
});

describe('Settings > Hub host table', () => {
  it('lists inbox repos with their host, Default muted, an offline choice dashed', async () => {
    const el = await mount(source({ url: HUB, attached: true, status: { state: 'paired', role: 'admin' } }));
    const row = (repo: string) => el.querySelector<HTMLSelectElement>(`select[aria-label="Host for ${repo}"]`)!;
    expect(row('acme-co/orders-api').value).toBe('laptop');
    expect(row('acme-co/web-app').className).toContain('is-default');
    expect(row('acme-co/infra').className).toContain('is-offline');
    expect(row('acme-co/infra').selectedOptions[0]?.textContent).toBe('desktop · offline');
    const offline = [...row('acme-co/web-app').options].find((o) => o.value === 'desktop');
    expect(offline?.disabled).toBe(true);
  });

  it('saves a change on the hub at once', async () => {
    const el = await mount(source({ url: HUB, attached: true, status: { state: 'paired', role: 'admin' } }));
    const sel = el.querySelector<HTMLSelectElement>('select[aria-label="Host for acme-co/web-app"]')!;
    await act(async () => {
      sel.value = 'laptop';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const post = calls.find((c) => c.url.startsWith('/api/orca/prefs'));
    expect(JSON.parse(post?.body ?? '{}')).toEqual({ repo: 'acme-co/web-app', host: 'laptop' });
    expect(sel.value).toBe('laptop');
  });
});
