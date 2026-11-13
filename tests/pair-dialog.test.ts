// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DevicesResponse, PairCode } from '../shared/pairing';
import { PairDialog } from '../web/PairDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

const CODE: PairCode = {
  code: 'abc',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  link: 'https://hq.example.ts.net/pair#code=abc',
};
const DEVICE = { id: 'd1', name: 'Galaxy', createdAt: '2026-11-06T10:00:00Z', lastSeen: '2026-11-06T11:00:00Z' };

function fakeFetch(devices: DevicesResponse, calls: string[]) {
  return vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const body = url.startsWith('/api/devices') && !init ? devices : url === '/api/pair/code' ? CODE : { ok: true };
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
}

async function mount(devices: DevicesResponse, calls: string[] = []): Promise<HTMLElement> {
  vi.stubGlobal('fetch', fakeFetch(devices, calls));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(PairDialog, { onClose: () => {} }));
  });
  await act(async () => {});
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

describe('PairDialog', () => {
  it('shows a QR code, the link, the countdown and the paired devices', async () => {
    const el = await mount({ phoneUrl: 'https://hq.example.ts.net', devices: [DEVICE] });
    expect(el.querySelector('svg.pair-qr path')?.getAttribute('d')).toContain('M');
    expect(el.querySelector<HTMLInputElement>('input[aria-label="Pairing link"]')?.value).toBe(CODE.link);
    expect(el.textContent).toMatch(/expires in 9:5\d|expires in 10:00/);
    expect(el.textContent).toContain('Galaxy');
    expect(el.textContent).toContain('Copy');
  });

  it('revokes a device through the API', async () => {
    const calls: string[] = [];
    const el = await mount({ phoneUrl: 'https://hq.example.ts.net', devices: [DEVICE] }, calls);
    const revoke = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Revoke');
    await act(async () => {
      revoke?.click();
    });
    expect(calls).toContain('POST /api/devices/revoke');
  });

  it('explains how to turn phone access on when it is off', async () => {
    const el = await mount({ phoneUrl: undefined, devices: [] });
    expect(el.textContent).toContain('Phone access is off');
    expect(el.querySelector('svg.pair-qr')).toBeNull();
  });
});
