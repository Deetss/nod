// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { SheetTarget } from '../web/phone/PhoneSheet';
import { verbFor, type ActivityEvent, type ActivityFeed, type ActivityGroup, type ActivityKind } from '../shared/activity-types';
import type { ActivityHandle } from '../web/activity-ui';
import { PhoneApp } from '../web/phone/PhoneApp';
import type { Inbox } from '../web/useInbox';
import type { IssuesState } from '../web/issues/useIssues';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Entry {
  state: unknown;
  url: string;
}

/** A session history that applies back() only when settle() runs, like a browser. */
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
  pushState(state: unknown, _t: string, url?: string) {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ state, url: url ?? '/' });
    this.index = this.entries.length - 1;
  }
  replaceState(state: unknown, _t: string, url?: string) {
    this.entries[this.index] = { state, url: url ?? '/' };
  }
  go(delta: number) {
    const next = this.index + delta;
    if (next >= 0 && next < this.entries.length) this.queue.push(next);
  }
  back() {
    this.go(-1);
  }
  settle() {
    while (this.queue.length) {
      this.index = this.queue.shift() as number;
      window.dispatchEvent(new PopStateEvent('popstate', { state: this.state }));
    }
  }
}

const NOW = Date.now();
const MIN = 60_000;
const at = (m: number) => new Date(NOW - m * MIN).toISOString();

function ev(kind: ActivityKind, m: number, over: Partial<ActivityEvent> = {}): ActivityEvent {
  return { id: `${kind}-${m}-${over.actor ?? ''}`, kind, verb: verbFor(kind, over.detail), at: at(m), needsMe: false, ...over };
}

const ref = (n: number, kind: 'pr' | 'issue' = 'pr') => ({
  kind,
  id: `acme-web#${n}`,
  repo: 'acme-web',
  number: n,
  title: `Item ${n}`,
  url: `https://example.test/${n}`,
});

const groups: ActivityGroup[] = [
  {
    item: ref(1354),
    events: [
      ev('ci', 4, { detail: 'fail' }),
      ev('commits', 21, { actor: 'build-bot', detail: '2' }),
      ev('opened', 52, { actor: 'build-bot' }),
    ],
  },
  { item: ref(1348, 'issue'), events: [ev('mention', 12, { actor: 'dependabot[bot]', needsMe: true })] },
  { item: ref(1330), events: [ev('commits', 30, { actor: 'acme-dev', detail: '1' })] },
];

const feedOf = (g: ActivityGroup[], over: Partial<ActivityFeed> = {}): ActivityFeed => ({
  viewer: 'acme-dev',
  syncedAt: NOW,
  days: 7,
  hasOlder: false,
  lastVisit: NOW - 15 * MIN,
  groups: g,
  ...over,
});

let fake: FakeHistory;
let root: Root;
let host: HTMLElement;
let onSheet: Mock<(t: SheetTarget | undefined) => void>;
let reload: Mock<() => void>;
let loadOlder: Mock<() => void>;

function mount(over: Partial<ActivityHandle> = {}) {
  reload = vi.fn<() => void>();
  loadOlder = vi.fn<() => void>();
  onSheet = vi.fn<(t: SheetTarget | undefined) => void>();
  const activity: ActivityHandle = { feed: feedOf(groups), error: undefined, lastVisit: NOW - 15 * MIN, reload, loadOlder, ...over };
  const inbox = { data: undefined, error: undefined, loading: false, ready: true, reload: vi.fn(), refreshing: false, syncing: false } as unknown as Inbox;
  const issues = { data: undefined, error: undefined, reload: vi.fn() } as IssuesState;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      createElement(PhoneApp, {
        tab: 'activity',
        onTab: vi.fn(),
        inbox,
        issues,
        activity,
        seenLocal: new Set<string>(),
        issueSeen: new Set<string>(),
        sheet: undefined,
        onSheet,
        onSeenPr: vi.fn(),
        onSeenIssue: vi.fn(),
        onRefresh: vi.fn(),
        theme: 'dark',
        onToggleTheme: vi.fn(),
        density: 'comfortable',
        onDensity: vi.fn(),
      }),
    ),
  );
}

// Chip labels and counts are separate spans, so the text node has no space between them.
const text = () => (host.textContent ?? '').replace(/(All|Needs me|Mentions|CI|Merged)(\d+|--)/g, '$1 $2');
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label));
const rows = () => [...host.querySelectorAll('.ph-arow')];
const back = () => {
  act(() => fake.back());
  act(() => fake.settle());
};

beforeEach(() => {
  fake = new FakeHistory();
  Object.defineProperty(window, 'history', { configurable: true, value: fake });
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('B1 default', () => {
  it('lists items newest first with chip counts and hides the viewer own events', () => {
    mount();
    expect(rows().map((r) => r.querySelector('.ph-atext')?.textContent)).toEqual(['Item 1354', 'Item 1348']);
    expect(text()).toContain('All 2');
    expect(text()).toContain('Needs me 1');
    expect(text()).toContain('Mentions 1');
    expect(text()).toContain('CI 1');
    expect(text()).toContain('Merged 0');
    expect(text()).toContain('Mine hidden (1) · Show');
    expect(text()).toContain('3 updates');
  });

  it('shows the latest event on the meta line and an unread dot only for new events', () => {
    mount({ lastVisit: NOW - 15 * MIN });
    expect(rows()[0]?.textContent).toContain('PR · acme-web #1354 · CI failed on #1354');
    expect(rows()[0]?.querySelector('.ph-dot')).not.toBeNull();
    expect(rows()[1]?.querySelector('.ph-dot')).not.toBeNull();
    mount({ lastVisit: NOW });
    expect(host.querySelectorAll('.ph-dot').length).toBe(0);
  });

  it('shows hidden own events with Show and hides them again with Hide', () => {
    mount();
    click(button('Show'));
    expect(rows().length).toBe(3);
    expect(text()).toContain('Showing mine · Hide');
    click(button('Hide'));
    expect(rows().length).toBe(2);
  });

  it('puts the unseen count on the Activity tab', () => {
    mount();
    expect(host.querySelector('.ph-tab.is-active .ph-count')?.textContent).toBe('2');
  });
});

describe('B2 filter', () => {
  it('filters to a chip, explains it, and clears by tapping the chip again', () => {
    mount();
    click(button('Mentions'));
    expect(rows().length).toBe(1);
    expect(text()).toContain('Showing 1 of 2 · Clear filter');
    expect(text()).toContain('Only items with a mention of you.');
    expect(text()).toContain('Tap the chip again to clear.');
    click(button('Mentions'));
    expect(rows().length).toBe(2);
    click(button('CI'));
    click(button('Clear filter'));
    expect(rows().length).toBe(2);
  });
});

describe('B3 expanded group', () => {
  it('expands a row in place with its events newest first and an Open button', () => {
    mount();
    click(rows()[0]);
    const events = [...host.querySelectorAll('.tl-text')].map((e) => e.textContent);
    expect(events).toEqual(['CI failed on #1354', 'build-bot pushed 2 commits', 'build-bot opened PR']);
    expect(rows()[0]?.getAttribute('aria-expanded')).toBe('true');
    click(button('Open #1354'));
    expect(onSheet).toHaveBeenCalledWith({ kind: 'pr', id: 'acme-web#1354' });
  });

  it('keeps one expanded row at a time', () => {
    mount();
    click(rows()[0]);
    click(rows()[1]);
    expect(host.querySelectorAll('.ph-atimeline').length).toBe(1);
    expect(rows()[1]?.getAttribute('aria-expanded')).toBe('true');
    expect(fake.length).toBe(2);
  });

  it('collapses on tapping the row again and leaves no history entry behind', () => {
    mount();
    click(rows()[0]);
    click(rows()[0]);
    expect(host.querySelectorAll('.ph-atimeline').length).toBe(0);
  });

  it('collapses an expanded row first on Back, and stays on the tab', () => {
    mount();
    click(rows()[0]);
    expect(host.querySelectorAll('.ph-atimeline').length).toBe(1);
    back();
    expect(host.querySelectorAll('.ph-atimeline').length).toBe(0);
    expect(rows().length).toBe(2);
    expect(host.querySelector('.ph-tab.is-active')?.textContent).toContain('Activity');
  });
});

describe('B4 empty', () => {
  it('says caught up and offers the viewer own events', () => {
    mount({ feed: feedOf([groups[2] as ActivityGroup]) });
    expect(text()).toContain("You're caught up");
    expect(text()).toContain('Nothing has moved since your last visit.');
    expect(text()).toContain('All 0');
    click(button('Show my own (1)'));
    expect(rows().length).toBe(1);
  });
});

describe('B5 loading', () => {
  it('shows placeholder chips, skeleton rows and no tab badge', () => {
    mount({ feed: undefined });
    expect(text()).toContain('Loading activity…');
    expect(text()).toContain('All --');
    expect(text()).toContain('Needs me --');
    expect(host.querySelectorAll('.ph-askel').length).toBeGreaterThan(0);
    expect(host.querySelector('.ph-tab.is-active .ph-count')).toBeNull();
  });
});

describe('B6 error', () => {
  it('without a cache shows the failure and retries', () => {
    mount({ feed: undefined, error: 'GitHub did not answer' });
    expect(text()).toContain('Not synced yet');
    expect(text()).toContain("Couldn't load activity");
    expect(text()).toContain('Showing nothing because no cache exists yet.');
    expect(text()).toContain('All --');
    click(button('Retry'));
    expect(reload).toHaveBeenCalled();
  });

  it('with a cache keeps the rows under a banner', () => {
    mount({ error: 'GitHub did not answer' });
    expect(text()).toContain("Couldn't refresh activity");
    expect(text()).toContain('Showing the cached list from');
    expect(rows().length).toBe(2);
    expect(text()).toContain('All 2');
  });
});

describe('B7 low data and Load older', () => {
  it('ends with the everything line when nothing older is stored', () => {
    mount();
    expect(text()).toContain("That's everything from the last 7 days.");
  });

  it('offers Load older when the store holds more', () => {
    mount({ feed: feedOf(groups, { hasOlder: true }) });
    expect(text()).toContain('Showing the last 7 days');
    click(button('Load older'));
    expect(loadOlder).toHaveBeenCalled();
  });

  it('keeps the chips visible with zero counts on a quiet week', () => {
    mount({ feed: feedOf([groups[1] as ActivityGroup]) });
    expect(text()).toContain('All 1');
    expect(text()).toContain('CI 0');
    expect(text()).toContain('Merged 0');
  });
});
