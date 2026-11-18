// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureConnections } from '../server/connections-fixtures';
import { ConnectionsMenu } from '../web/connections/ConnectionsMenu';
import type { ConnectionsView } from '../web/connections/useConnections';
import { PhoneConnectionsSheet } from '../web/phone/PhoneConnectionsSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const view = (state?: string, over: Partial<ConnectionsView> = {}): ConnectionsView => ({
  data: state === 'checking' ? undefined : fixtureConnections(state),
  busy: false,
  check: vi.fn(() => Promise.resolve()),
  reload: vi.fn(),
  ...over,
});

function mount(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

const key = (k: string) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
const texts = (h: HTMLElement, sel: string) => [...h.querySelectorAll(sel)].map((e) => e.textContent);

function menu(v: ConnectionsView, cb: { onPair?: () => void; onGithub?: () => void } = {}) {
  return mount(createElement(ConnectionsMenu, { view: v, onPair: cb.onPair ?? vi.fn(), onGithub: cb.onGithub ?? vi.fn(), keys: true }));
}

describe('Connections chip and popover', () => {
  it('opens from the chip with the strip, rows and footer', () => {
    const h = menu(view());
    const chip = h.querySelector<HTMLButtonElement>('.cx-chip')!;
    expect(chip.className).toContain('is-ok');
    expect(chip.textContent).toContain('Service · 2 devices');
    act(() => chip.click());
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(texts(h, '.cx-node-name')).toEqual(['GitHub', 'This Nod', 'Tailscale', 'Devices', 'Orca']);
    expect(texts(h, '.cx-row-name')).toEqual(['GitHub', 'This Nod', 'Tailscale', 'Android phone', 'Laptop browser', 'Orca']);
    expect(texts(h, '.cx-footer .btn')).toEqual(['Pair device', 'Check now']);
    expect(document.activeElement?.textContent).toBe('Details');
  });

  it('closes on Esc and toggles on g c, but not on c alone', () => {
    const h = menu(view());
    key('g');
    key('c');
    expect(h.querySelector('.cx-pop')).not.toBeNull();
    act(() => void h.querySelector('.cx-pop')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(h.querySelector('.cx-pop')).toBeNull();
    key('c');
    expect(h.querySelector('.cx-pop')).toBeNull();
  });

  it('shows the broken state: danger chip, broken row first with Fix, no Pair while phone access is off', () => {
    const onGithub = vi.fn();
    const h = menu(view('conn-broken'), { onGithub });
    expect(h.querySelector('.cx-chip')?.className).toContain('is-danger');
    act(() => h.querySelector<HTMLButtonElement>('.cx-chip')!.click());
    const first = h.querySelector('.cx-row')!;
    expect(first.className).toContain('is-broken');
    expect(first.textContent).toContain('Last 3 syncs failed: gh is logged out.');
    expect(texts(h, '.cx-footer .btn')).toEqual(['Check now']);
    act(() => first.querySelector<HTMLButtonElement>('.cx-action')!.click());
    expect(onGithub).toHaveBeenCalledOnce();
    expect(h.querySelector('.cx-pop')).toBeNull();
  });

  it('reads Checking until the first answer, with dashed marks', () => {
    const h = menu(view('checking'));
    expect(h.querySelector('.cx-chip')?.className).toContain('is-checking');
    act(() => h.querySelector<HTMLButtonElement>('.cx-chip')!.click());
    expect(h.querySelectorAll('.cx-row .cx-mark.is-checking')).toHaveLength(5);
    expect(texts(h, '.cx-row-detail').every((t) => t === 'Checking…')).toBe(true);
  });

  it('renames a device inline and folds devices past four', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }))));
    vi.stubGlobal('fetch', fetch);
    const v = view('conn-many');
    const h = menu(v);
    act(() => h.querySelector<HTMLButtonElement>('.cx-chip')!.click());
    expect(h.querySelector('.cx-more')?.textContent).toBe('2 more devices');
    act(() => h.querySelector<HTMLButtonElement>('.cx-more button')!.click());
    expect(h.querySelector('.cx-more')).toBeNull();
    expect(h.querySelector('.cx-rows')?.className).toContain('is-scroll');
    const rename = [...h.querySelectorAll<HTMLButtonElement>('.cx-action')].find((b) => b.textContent?.startsWith('Rename'))!;
    act(() => rename.click());
    const input = h.querySelector<HTMLInputElement>('.cx-rename')!;
    expect(input.value).toBe('Android phone');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(fetch).toHaveBeenCalledWith('/api/devices/rename', expect.objectContaining({ method: 'POST' }));
    expect(v.reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('phone Connections sheet', () => {
  it('draws the rail, the other devices, and no rename or revoke', () => {
    const h = mount(createElement(PhoneConnectionsSheet, { view: view(), onClose: vi.fn() }));
    expect(texts(h, '.ph-cx-rail:not(.is-plain) .ph-cx-name')).toEqual(['This phone', 'Tailscale', 'Hub', 'GitHub', 'Orca on the hub']);
    expect(h.querySelectorAll('.ph-cx-link.is-ok')).toHaveLength(4);
    expect(texts(h, '.ph-cx-rail.is-plain .ph-cx-name')).toEqual(['Laptop browser']);
    expect(texts(h, '.ph-cx-others')).toEqual(['Other devices on this hub']);
    expect(h.textContent).not.toMatch(/Rename|Revoke/);
    expect(texts(h, '.ph-cx-action')).toEqual(['Copy']);
    expect(texts(h, '.ph-cx-bar .ph-btn')).toEqual(['Close', 'Check again']);
  });

  it('runs Check again and closes on Close', () => {
    const v = view();
    const onClose = vi.fn();
    const h = mount(createElement(PhoneConnectionsSheet, { view: v, onClose }));
    const [close, again] = [...h.querySelectorAll<HTMLButtonElement>('.ph-cx-bar .ph-btn')];
    act(() => again!.click());
    expect(v.check).toHaveBeenCalledOnce();
    act(() => close!.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
