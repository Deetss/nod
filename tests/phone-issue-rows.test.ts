// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IssueDetail, IssueSummary, RepoMeta } from '../shared/issue-types';
import { pickerAction, pickerDone, pickerItems } from '../web/phone/picker-items';
import { PhoneIssueSheet } from '../web/phone/PhoneIssueSheet';
import { PhoneIssuePicker } from '../web/phone/PhoneIssuePicker';
import type { PhoneWrites } from '../web/phone/usePhoneWrites';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const META: RepoMeta = {
  repo: 'acme-web',
  labels: [
    { id: 'L1', name: 'flaky-ci', color: 'ff0000' },
    { id: 'L2', name: 'bug', color: 'd73a4a' },
  ],
  milestones: [{ id: 'M1', title: 'v2.4 launch' }],
  users: [
    { id: 'U1', login: 'build-bot' },
    { id: 'U2', login: 'acme-dev' },
  ],
  fetchedAt: 0,
};

vi.mock('../web/api', () => ({
  api: { repoMeta: async () => META, issueAction: vi.fn() },
}));

const ISSUE: IssueSummary = {
  id: 'I_42',
  repo: 'acme-web',
  number: 42,
  title: 'Checkout page flickers',
  author: 'build-bot',
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  url: 'https://github.com/acme/acme-web/issues/42',
  state: 'open',
  labels: [{ name: 'bug', color: 'd73a4a' }],
  assignees: ['acme-dev', 'build-bot'],
  commentCount: 0,
  seen: 'seen',
};

const remote = (milestone?: string) =>
  ({
    data: { summary: ISSUE, bodyHtml: '', assignees: [], milestone, comments: [], timeline: [], linkedPrs: [], participants: [], subIssues: [], unseenFrom: 0 } as IssueDetail,
    error: undefined,
    loading: false,
    reload: () => {},
  }) as const;

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const sheet = (over: Partial<Parameters<typeof PhoneIssueSheet>[0]> = {}) =>
  createElement(PhoneIssueSheet, {
    issue: ISSUE,
    viewer: 'acme-dev',
    projectStatus: false,
    detail: remote('v2.4 launch'),
    writesOff: false,
    busy: false,
    depth: 0,
    covered: false,
    onClose: () => {},
    onMore: () => {},
    onPrimary: () => {},
    onComment: () => {},
    onPick: () => {},
    sub: { onOpen: () => {}, onLong: () => {}, onCreate: () => {}, onParent: () => {} },
    ...over,
  });

describe('issue sheet detail rows', () => {
  it('render current values with spoken names', () => {
    const el = render(sheet());
    const names = [...el.querySelectorAll('button.ph-field')].map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Assignees, acme-dev and build-bot. Edit',
      'Labels, bug. Edit',
      'Milestone, v2.4 launch. Edit',
    ]);
    expect(el.textContent).toContain('v2.4 launch');
  });

  it('read none when empty', () => {
    const el = render(sheet({ issue: { ...ISSUE, labels: [], assignees: [] }, detail: remote() }));
    const names = [...el.querySelectorAll('button.ph-field')].map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Assignees, none. Edit', 'Labels, none. Edit', 'Milestone, none. Edit']);
  });

  it('open the picker for their field', () => {
    const onPick = vi.fn();
    const el = render(sheet({ onPick }));
    for (const b of el.querySelectorAll<HTMLElement>('button.ph-field')) act(() => b.click());
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(['assignees', 'labels', 'milestone']);
  });

  it('are inert with an Offline note when writes are off', () => {
    const el = render(sheet({ writesOff: true }));
    expect(el.querySelectorAll('button.ph-field')).toHaveLength(0);
    expect(el.querySelectorAll('div.ph-field')).toHaveLength(3);
    expect(el.textContent).toContain('Offline');
  });
});

describe('picker actions', () => {
  const ref = { repo: 'acme-web', number: 42 };

  it('send only the changed labels', () => {
    expect(pickerAction('labels', ref, new Set(['bug']), new Set(['flaky-ci', 'bug']))).toEqual({
      type: 'labels',
      ...ref,
      add: ['flaky-ci'],
      remove: [],
    });
    expect(pickerAction('assignees', ref, new Set(['a', 'b']), new Set(['a']))).toEqual({
      type: 'assignees',
      ...ref,
      add: [],
      remove: ['b'],
    });
  });

  it('send nothing when unchanged', () => {
    expect(pickerAction('labels', ref, new Set(['bug']), new Set(['bug']))).toBeUndefined();
    expect(pickerAction('milestone', ref, new Set(['']), new Set(['']))).toBeUndefined();
  });

  it('set a milestone and clear it with None', () => {
    expect(pickerAction('milestone', ref, new Set(['']), new Set(['v2.4 launch']))).toMatchObject({ milestone: 'v2.4 launch' });
    expect(pickerAction('milestone', ref, new Set(['v2.4 launch']), new Set(['']))).toMatchObject({ milestone: null });
    expect(pickerDone('milestone', 'acme-web #42', new Set(['v2.4 launch']))).toBe('Milestone set to v2.4 launch on acme-web #42');
  });

  it('sort the viewer first among assignees and list No milestone first', () => {
    expect(pickerItems('assignees', META, 'acme-dev').map((i) => i.value)).toEqual(['acme-dev', 'build-bot']);
    expect(pickerItems('milestone', META, 'acme-dev').map((i) => i.value)).toEqual(['', 'v2.4 launch']);
  });
});

describe('PhoneIssuePicker', () => {
  const flush = () => act(async () => {});

  it('sends the labels action with the changed values and closes on success', async () => {
    const issue = vi.fn(async () => true);
    const onClose = vi.fn();
    const writes = { busy: false, notify: () => {}, issue } as unknown as PhoneWrites;
    const el = render(
      createElement(PhoneIssuePicker, {
        field: 'labels',
        issue: ISSUE,
        detail: remote(),
        viewer: 'acme-dev',
        writes,
        depth: 1,
        covered: false,
        onClose,
      }),
    );
    await flush();
    const rows = [...el.querySelectorAll<HTMLElement>('.ph-pk-row')];
    const flaky = rows.find((r) => r.getAttribute('aria-label')?.startsWith('flaky-ci,'));
    act(() => flaky?.click());
    const apply = el.querySelector<HTMLElement>('.ph-btn.is-primary');
    expect(apply?.textContent).toBe('Apply (1 change)');
    await act(async () => apply?.click());
    expect(issue).toHaveBeenCalledWith(
      { type: 'labels', repo: 'acme-web', number: 42, add: ['flaky-ci'], remove: [] },
      'Labels updated on acme-web #42',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open when the write fails', async () => {
    const issue = vi.fn(async () => false);
    const onClose = vi.fn();
    const writes = { busy: false, notify: () => {}, issue } as unknown as PhoneWrites;
    const el = render(
      createElement(PhoneIssuePicker, {
        field: 'milestone',
        issue: ISSUE,
        detail: remote(),
        viewer: 'acme-dev',
        writes,
        depth: 1,
        covered: false,
        onClose,
      }),
    );
    await flush();
    act(() => [...el.querySelectorAll<HTMLElement>('.ph-pk-row')][1]?.click());
    await act(async () => el.querySelector<HTMLElement>('.ph-btn.is-primary')?.click());
    expect(issue).toHaveBeenCalledWith({ type: 'milestone', repo: 'acme-web', number: 42, milestone: 'v2.4 launch' }, expect.any(String));
    expect(onClose).not.toHaveBeenCalled();
  });
});
