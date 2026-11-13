// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_TRIGGERS_ON, TRIGGER_KEYS, TRIGGER_LABELS } from '../shared/notify-rules';
import type { PushState } from '../web/phone/usePush';
import { PhoneNotifySheet } from '../web/phone/PhoneNotifySheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

async function mount(state: PushState, calls: { method: string; body?: unknown }[] = []): Promise<HTMLElement> {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, boolean>) : undefined;
      calls.push({ method: init?.method ?? 'GET', ...(body ? { body } : {}) });
      return Promise.resolve(new Response(JSON.stringify({ ...ALL_TRIGGERS_ON, ...body })));
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const push = { state, busy: false, toggle: async () => undefined };
  await act(async () => {
    root?.render(createElement(PhoneNotifySheet, { push, onClose: () => {} }));
  });
  await act(async () => {});
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.unstubAllGlobals();
});

const switches = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('[role="switch"]')];

describe('phone notification sheet', () => {
  it('shows the master switch and one switch per type, all on by default', async () => {
    const el = await mount('on');
    const rows = switches(el);
    expect(rows).toHaveLength(TRIGGER_KEYS.length + 1);
    for (const key of TRIGGER_KEYS) expect(el.textContent).toContain(TRIGGER_LABELS[key]);
    expect(rows.every((r) => r.getAttribute('aria-checked') === 'true')).toBe(true);
  });

  it('sends only the type tapped', async () => {
    const calls: { method: string; body?: unknown }[] = [];
    const el = await mount('on', calls);
    const ci = switches(el).find((r) => r.textContent?.includes(TRIGGER_LABELS.ci))!;
    await act(async () => ci.click());
    expect(calls.at(-1)).toEqual({ method: 'POST', body: { ci: false } });
    expect(ci.getAttribute('aria-checked')).toBe('false');
  });

  it('disables the type switches while the phone has notifications off', async () => {
    const el = await mount('off');
    const [master, ...types] = switches(el);
    expect(master!.disabled).toBe(false);
    expect(types.every((r) => r.disabled)).toBe(true);
  });
});
