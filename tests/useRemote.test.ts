// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useRemote, type Remote } from '../web/useRemote';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

interface Probe {
  key: string;
  load: () => Promise<string>;
}

/** Renders the hook and records every value it returns, in order. */
function mount(first: Probe): { seen: Remote<string>[]; set: (p: Probe) => Promise<void> } {
  const seen: Remote<string>[] = [];
  function Host({ p }: { p: Probe }) {
    const r = useRemote<string>(p.key, p.load);
    seen.push(r);
    return null;
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(Host, { p: first })));
  return {
    seen,
    set: async (p) => {
      await act(async () => root!.render(createElement(Host, { p })));
    },
  };
}

const flush = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('useRemote cache', () => {
  it('returns cached data on the first render of a second visit to a key', async () => {
    const a = mount({ key: 'cache-visit-a', load: async () => 'A1' });
    await flush();
    expect(a.seen.at(-1)?.data).toBe('A1');

    const b = mount({ key: 'cache-visit-b', load: async () => 'B1' });
    await flush();
    // Switch to key a again with a loader that never resolves: only the cache can supply data.
    await b.set({ key: 'cache-visit-a', load: () => new Promise<string>(() => undefined) });
    const first = b.seen.at(-1);
    expect(first?.data).toBe('A1');
    expect(first?.loading).toBe(true);
  });

  it('keeps cached data when a refresh fails and shows the error', async () => {
    const a = mount({ key: 'cache-fail', load: async () => 'OK' });
    await flush();
    await a.set({ key: 'cache-fail-other', load: async () => 'X' });
    await flush();
    await a.set({ key: 'cache-fail', load: () => Promise.reject(new Error('boom')) });
    await flush();
    const last = a.seen.at(-1);
    expect(last?.data).toBe('OK');
    expect(last?.error).toBe('boom');
    expect(last?.loading).toBe(false);
  });

  it('drops the oldest entry past 100 keys', async () => {
    const first = mount({ key: 'cap-0', load: async () => 'v0' });
    await flush();
    for (let i = 1; i <= 100; i++) {
      await first.set({ key: `cap-${i}`, load: async () => `v${i}` });
      await flush();
    }
    // cap-0 is the oldest of 101 entries and must have been evicted.
    await first.set({ key: 'cap-0', load: () => new Promise<string>(() => undefined) });
    expect(first.seen.at(-1)?.data).toBeUndefined();
    // cap-1 is still cached.
    await first.set({ key: 'cap-1', load: () => new Promise<string>(() => undefined) });
    expect(first.seen.at(-1)?.data).toBe('v1');
  });
});
