// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueSection, IssueSummary } from '../shared/issue-types';
import type { PrSummary, Section } from '../shared/types';
import type { ActivityHandle } from '../web/activity-ui';
import type { IssuesState } from '../web/issues/useIssues';
import { PhoneApp } from '../web/phone/PhoneApp';
import type { PhoneTab } from '../web/phone/phone-logic';
import type { Inbox } from '../web/useInbox';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pr = (n: number, seen: PrSummary['seen']): PrSummary => ({
  id: `acme-api#${n}`,
  repo: 'acme-api',
  number: n,
  title: `PR ${n}`,
  author: 'build-bot',
  createdAt: '2026-11-06T10:00:00Z',
  updatedAt: '2026-11-06T11:00:00Z',
  headSha: 'a1b2c3d',
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  commitCount: 1,
  ci: 'pass',
  reviewStatus: 'needs review',
  seen,
  url: '',
});

const issue = (n: number, seen: IssueSummary['seen']): IssueSummary => ({
  id: `acme-api#i${n}`,
  repo: 'acme-api',
  number: n,
  title: `Issue ${n}`,
  author: 'build-bot',
  createdAt: '2026-11-06T10:00:00Z',
  updatedAt: '2026-11-06T11:00:00Z',
  url: '',
  state: 'open',
  labels: [],
  assignees: [],
  commentCount: 0,
  seen,
});

const sec = (key: Section['key'], prs: PrSummary[]): Section => ({ key, title: key, count: prs.length, prs });
const isec = (key: IssueSection['key'], issues: IssueSummary[], count = issues.length): IssueSection => ({
  key,
  title: key,
  count,
  issues,
});
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

/** 3 count: 2 unseen in Needs, 1 updated in Mine. Counting every unseen PR would give 13. */
const PR_SECTIONS = [
  sec('needs', [pr(1, 'new'), pr(2, 'updated'), pr(3, 'seen')]),
  sec('mine', [pr(4, 'updated'), pr(5, 'new'), pr(6, 'seen')]),
  sec('org', range(10, 8).map((n) => pr(n, 'new'))),
  sec('dependabot', [pr(30, 'new')]),
];

/** 3 count: one each in progress, assigned and mentioned. The bot, created and untriaged rows do not. */
const ISSUE_SECTIONS = [
  isec('progress', [issue(1, 'updated')]),
  isec('bot', [issue(2, 'new')]),
  isec('assigned', [issue(3, 'new'), issue(4, 'seen')]),
  isec('created', [issue(5, 'new')]),
  isec('mentioned', [issue(6, 'new')]),
  isec('untriaged', [issue(7, 'new')]),
  isec('all', [], 153),
];

let host: HTMLElement;
let root: Root;

function mount(o: { tab?: PhoneTab; prs?: Section[]; issues?: IssueSection[] } = {}) {
  const prSections = o.prs ?? PR_SECTIONS;
  const issueSections = o.issues ?? ISSUE_SECTIONS;
  const inbox = {
    data: { viewer: 'acme-dev', prs: prSections.flatMap((s) => s.prs), sections: prSections, syncedAt: Date.now(), follows: {} },
    error: undefined,
    loading: false,
    ready: true,
    reload: vi.fn(),
  } as unknown as Inbox;
  const issues = {
    data: { viewer: 'acme-dev', issues: issueSections.flatMap((s) => s.issues), mentionedIds: [], syncedAt: Date.now(), sections: issueSections },
    error: undefined,
    reload: vi.fn(),
  } as unknown as IssuesState;
  const activity = { feed: undefined, error: undefined, lastVisit: 0, reload: vi.fn(), loadOlder: vi.fn() } as ActivityHandle;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      createElement(PhoneApp, {
        tab: o.tab ?? 'prs',
        onTab: vi.fn(),
        connections: { data: undefined, busy: false, check: vi.fn(), reload: vi.fn() },
        inbox,
        issues,
        activity,
        seenLocal: new Set<string>(),
        issueSeen: new Set<string>(),
        sheet: undefined,
        onSheet: vi.fn(),
        onSeenPr: vi.fn(),
        onSeenIssue: vi.fn(),
        onRefresh: vi.fn(),
        connection: { connection: undefined, result: undefined, busy: false, check: async () => {}, clearResult: () => {} },
        theme: 'dark',
        onToggleTheme: vi.fn(),
        density: 'comfortable',
        onDensity: vi.fn(),
      }),
    ),
  );
}

const tab = (label: string) =>
  [...host.querySelectorAll('.ph-tab')].find((t) => t.querySelector('.ph-tab-label')?.textContent === label);
const badge = (label: string) => tab(label)?.querySelector('.ph-count');

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('tab badges', () => {
  it('counts only what needs you on PRs and Issues', () => {
    mount();
    expect(badge('PRs')?.textContent).toBe('3');
    expect(badge('Issues')?.textContent).toBe('3');
  });

  it('hides the badge from screen readers and names the tab instead', () => {
    mount();
    expect(badge('Issues')?.getAttribute('aria-hidden')).toBe('true');
    expect(badge('Issues')?.hasAttribute('aria-label')).toBe(false);
    expect(tab('Issues')?.getAttribute('aria-label')).toBe('Issues, 3 need you');
    expect(tab('PRs')?.getAttribute('aria-label')).toBe('PRs, 3 need you');
  });

  it('shows no badge and no aria-label at 0', () => {
    mount({ issues: [isec('created', [issue(5, 'new')]), isec('all', [], 1)] });
    expect(tab('Issues')).toBeDefined();
    expect(badge('Issues')).toBeNull();
    expect(tab('Issues')?.hasAttribute('aria-label')).toBe(false);
    expect(badge('Activity')).toBeNull();
  });

  it('caps the number at 99+', () => {
    mount({ prs: [sec('needs', range(100, 120).map((n) => pr(n, 'new')))] });
    expect(badge('PRs')?.textContent).toBe('99+');
    expect(tab('PRs')?.getAttribute('aria-label')).toBe('PRs, more than 99 need you');
  });
});

describe('header total', () => {
  it('shows every open PR after the title', () => {
    mount();
    expect(host.querySelector('.ph-apptitle-total')?.textContent).toBe('15 open');
    expect(host.querySelector('.ph-apptitle')?.textContent).toBe('Pull requests15 open');
  });

  it('shows the All open count on Issues, formatted', () => {
    mount({ tab: 'issues' });
    expect(host.querySelector('.ph-apptitle-total')?.textContent).toBe('153 open');
  });

  it('formats a large total', () => {
    mount({ tab: 'issues', issues: [isec('all', [], 1204)] });
    expect(host.querySelector('.ph-apptitle-total')?.textContent).toBe('1,204 open');
  });
});

describe('tab label size', () => {
  it('selects the tab with .phone .ph-tab so it beats the button font reset', () => {
    const css = readFileSync('web/phone/phone-shell.css', 'utf8');
    expect(css).toContain('.phone .ph-tab {');
    expect(css).toMatch(/\.phone \.ph-tab \{[^}]*font-size: 13px;/);
  });
});
