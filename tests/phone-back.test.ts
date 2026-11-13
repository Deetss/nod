// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSheetStack, type SheetStack } from '../web/phone/useSheetStack';
import type { Level } from '../web/phone/sheet-stack';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Fake History. Entries are stored like the browser's session history, and back/go queue a
 * popstate that only fires on settle(), like a real browser. Tests call back() and then settle().
 */
interface Entry {
  state: unknown;
  url: string;
}

class FakeHistory {
  entries: Entry[] = [{ state: null, url: '/' }];
  index = 0;
  private queue: number[] = [];

  get length() {
    return this.entries.length;
  }
  get state() {
    return this.entries[this.index]?.state ?? null;
  }
  private here(): Entry {
    return this.entries[this.index] ?? { state: null, url: '/' };
  }
  pushState(state: unknown, _title: string, url?: string) {
    // A push drops the forward entries, as a browser does.
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ state, url: url ?? this.here().url });
    this.index = this.entries.length - 1;
  }
  replaceState(state: unknown, _title: string, url?: string) {
    this.entries[this.index] = { state, url: url ?? this.here().url };
  }
  go(delta: number) {
    const next = this.index + delta;
    // A browser ignores a go() past either end of history.
    if (next < 0 || next >= this.entries.length) return;
    this.queue.push(next);
  }
  back() {
    this.go(-1);
  }
  /** Applies queued traversals and fires popstate, as the browser does after the navigation. */
  settle() {
    while (this.queue.length) {
      this.index = this.queue.shift() as number;
      window.dispatchEvent(new PopStateEvent('popstate', { state: this.state }));
    }
  }
}

let fake: FakeHistory;
let root: Root | undefined;
let host: HTMLElement | undefined;
let sheets: SheetStack | undefined;

function Probe() {
  sheets = useSheetStack([]);
  return null;
}

function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(Probe)));
}

const run = (fn: (s: SheetStack) => void) => act(() => fn(sheets as SheetStack));
const back = () => {
  act(() => fake.back());
  act(() => fake.settle());
};
const pr = (id: string): Level => ({ kind: 'pr', id });
const issue = (id: string): Level => ({ kind: 'issue', id });

beforeEach(() => {
  fake = new FakeHistory();
  Object.defineProperty(window, 'history', { configurable: true, value: fake });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

/** The invariant the fix guarantees: the history depth of the top entry is the stack length. */
function expectDepthMatchesStack() {
  const depth = (fake.state as { phDepth?: number } | null)?.phDepth ?? 0;
  expect(depth).toBe(sheets?.stack.length);
}

describe('case 1: a PR or issue opened from a list row', () => {
  it('gets one entry, and Back returns to the list', () => {
    mount();
    run((s) => s.push(pr('P1')));
    expect(fake.length).toBe(2);
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([]);
    expect(fake.index).toBe(0);
  });
});

describe('case 2: nested sheets over a root', () => {
  it('gets one entry per level and Back closes one level at a time', () => {
    mount();
    run((s) => s.push(pr('P1')));
    run((s) => s.push({ kind: 'actions' }));
    run((s) => s.push({ kind: 'picker', field: 'labels' }));
    expect(fake.length).toBe(4);
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([pr('P1'), { kind: 'actions' }]);
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([pr('P1')]);
    back();
    expect(sheets?.stack).toEqual([]);
  });

  it('keeps the entry count when replaceTop swaps a nested level', () => {
    mount();
    run((s) => s.push(pr('P1')));
    run((s) => s.push({ kind: 'actions' }));
    run((s) => s.replaceTop({ kind: 'composer', mode: 'comment' }));
    expect(fake.length).toBe(3);
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([pr('P1')]);
  });
});

describe('case 3: a root opened from a link inside another sheet', () => {
  it('replaces the covered entries, so history depth equals stack length', () => {
    mount();
    run((s) => s.push(pr('A')));
    run((s) => s.push({ kind: 'actions' }));
    run((s) => s.push(issue('B')));
    act(() => fake.settle());
    expect(sheets?.stack).toEqual([issue('B')]);
    expect(fake.index).toBe(1);
    expectDepthMatchesStack();
  });

  it('Back from the linked root returns to the list in one press', () => {
    mount();
    run((s) => s.push(pr('A')));
    run((s) => s.push(issue('B')));
    back();
    expect(sheets?.stack).toEqual([]);
    expect(fake.index).toBe(0);
  });
});

describe('case 4: replaceRoot and replaceTop', () => {
  it('replaceRoot after a new issue keeps exactly one entry for the root', () => {
    mount();
    run((s) => s.push(issue('I42')));
    run((s) => s.push({ kind: 'new-issue' }));
    run((s) => s.push({ kind: 'form-picker', field: 'labels' }));
    run((s) => s.pop());
    run((s) => s.replaceRoot(issue('I43')));
    expect(sheets?.stack).toEqual([issue('I43')]);
    act(() => fake.settle());
    expectDepthMatchesStack();
    expect(fake.index).toBe(1);
    back();
    expect(sheets?.stack).toEqual([]);
    expect(fake.index).toBe(0);
  });

  it('replaceRoot from a root at depth 1 rewrites that entry', () => {
    mount();
    run((s) => s.push(pr('P1')));
    run((s) => s.replaceRoot(issue('I1')));
    expect(sheets?.stack).toEqual([issue('I1')]);
    expect(fake.length).toBe(2);
    expectDepthMatchesStack();
  });

  it('replaceRoot from the list adds a root entry', () => {
    mount();
    run((s) => s.replaceRoot(issue('I1')));
    expect(sheets?.stack).toEqual([issue('I1')]);
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([]);
  });

  it('replaceTop after a link root keeps the history consistent', () => {
    mount();
    run((s) => s.push(pr('A')));
    run((s) => s.push(issue('B')));
    run((s) => s.push({ kind: 'actions' }));
    run((s) => s.replaceTop({ kind: 'confirm', action: 'dispatch' }));
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([issue('B')]);
    expectDepthMatchesStack();
  });
});

describe('case 5: a sheet opened without a user gesture', () => {
  it('writes into the navigation entry instead of pushing one', () => {
    mount();
    act(() => fake.replaceState({ phDepth: 0 }, '', '/?open=pr/x/1'));
    const before = fake.length;
    run((s) => s.openFromNavigation(pr('N1')));
    expect(fake.length).toBe(before);
    expect(sheets?.stack).toEqual([pr('N1')]);
    expectDepthMatchesStack();
  });

  it('Close drops the depth itself and does not step history back out of the app', () => {
    mount();
    run((s) => s.openFromNavigation(pr('N1')));
    const back = vi.spyOn(window.history, 'back');
    const go = vi.spyOn(window.history, 'go');
    run((s) => s.pop());
    expect(sheets?.stack).toEqual([]);
    expect(back).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    expect((fake.state as { phDepth: number }).phDepth).toBe(0);
  });

  it('a user-opened sheet on top of a navigation sheet still gets an entry', () => {
    mount();
    run((s) => s.openFromNavigation(pr('N1')));
    run((s) => s.push({ kind: 'actions' }));
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([pr('N1')]);
    expectDepthMatchesStack();
  });
});

describe('case 6: overlays in the history stack', () => {
  it('Back closes search, then leaves the sheet stack alone', () => {
    mount();
    run((s) => s.push(pr('P1')));
    const onBack = vi.fn();
    run((s) => s.openLayer('search', onBack));
    expectDepthMatchesStack();
    back();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(sheets?.stack).toEqual([pr('P1')]);
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([]);
  });

  it('Back closes the app bar menu before a sheet under it', () => {
    mount();
    run((s) => s.push(pr('P1')));
    const onBack = vi.fn();
    run((s) => s.openLayer('menu', onBack));
    expectDepthMatchesStack();
    back();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(sheets?.stack).toEqual([pr('P1')]);
    expectDepthMatchesStack();
    back();
    expect(sheets?.stack).toEqual([]);
  });

  it('closing the menu from its own items runs no onBack and leaves no entry', () => {
    mount();
    const onBack = vi.fn();
    run((s) => s.openLayer('menu', onBack));
    run((s) => s.closeLayer('menu'));
    act(() => fake.settle());
    expect(onBack).not.toHaveBeenCalled();
    expect(fake.index).toBe(0);
  });

  it('closing search from the UI runs no onBack callback and leaves no entry', () => {
    mount();
    const onBack = vi.fn();
    run((s) => s.openLayer('search', onBack));
    run((s) => s.closeLayer('search'));
    act(() => fake.settle());
    expect(onBack).not.toHaveBeenCalled();
    expect(fake.index).toBe(0);
  });

  it('closeLayer ignores a layer that is not on top', () => {
    mount();
    const onBack = vi.fn();
    run((s) => s.openLayer('search', onBack));
    run((s) => s.closeLayer('tab'));
    act(() => fake.settle());
    expect(fake.index).toBe(1);
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('case 7: a non-default tab with nothing open', () => {
  it('Back from the tab returns to the PRs tab once', () => {
    mount();
    const onBack = vi.fn();
    run((s) => s.openLayer('tab', onBack));
    back();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(fake.index).toBe(0);
  });

  it('a tab entry is not left behind when returning to PRs from the tab bar', () => {
    mount();
    run((s) => s.openLayer('tab', vi.fn()));
    run((s) => s.closeLayer('tab'));
    act(() => fake.settle());
    expect(fake.index).toBe(0);
  });

  it('Back on the PRs tab with nothing open has no entry to step to', () => {
    mount();
    back();
    expect(fake.index).toBe(0);
    expect(sheets?.stack).toEqual([]);
  });
});
