// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueAction, IssueDetail, IssueSummary, SubIssue } from '../shared/issue-types';
import { actionItems, type ActionContext } from '../web/phone/action-items';
import { PhoneSheets } from '../web/phone/PhoneSheets';
import { PhoneSubIssuesSection, subMeta } from '../web/phone/PhoneSubIssues';
import { useSheetStack } from '../web/phone/useSheetStack';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sub = (n: number, state: SubIssue['state'], assignee?: string, repo = 'acme-banner'): SubIssue => ({
  id: `I_${n}`,
  repo,
  number: n,
  title: `Child ${n}`,
  state,
  url: `https://github.com/o/${repo}/issues/${n}`,
  ...(assignee ? { assignee } : {}),
});

const SUBS = [sub(14, 'completed', 'build-bot'), sub(17, 'open', 'acme-dev'), sub(15, 'completed', 'build-bot'), sub(421, 'open', 'acme-dev', 'acme-api'), sub(10, 'not-planned')];

const issue = (number: number, title: string): IssueSummary => ({
  id: `I_${number}`,
  repo: 'acme-banner',
  number,
  title,
  author: 'acme-dev',
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  url: `https://github.com/o/acme-banner/issues/${number}`,
  state: 'open',
  labels: [],
  assignees: [],
  commentCount: 0,
  seen: 'seen',
});

const PARENT = issue(12, 'Rebuild the banner export pipeline');
const CHILD = issue(17, 'Banner export times out on large communities');

const issueAction = vi.fn(async (_a: IssueAction) => ({ ok: true, message: 'ok', number: 30 }));
let subsNow: SubIssue[] = SUBS;

vi.mock('../web/api', () => ({
  api: {
    issueDetail: async (_repo: string, number: number): Promise<IssueDetail> =>
      ({
        summary: number === 12 ? PARENT : CHILD,
        bodyHtml: '',
        assignees: [],
        comments: [],
        timeline: [],
        linkedPrs: [],
        participants: [],
        subIssues: number === 12 ? subsNow : [],
        ...(number === 17
          ? { parent: { id: 'I_12', repo: 'acme-banner', number: 12, title: PARENT.title, state: 'open', progress: { total: 5, completed: 3 } } }
          : {}),
        unseenFrom: 0,
      }) as IssueDetail,
    orca: async () => ({ available: false, agents: [], repos: [] }),
    orcaModels: async () => ({}),
    repoMeta: async (repo: string) => ({ repo, labels: [], milestones: [], users: [], fetchedAt: 0 }),
    issueAction: (a: IssueAction) => issueAction(a),
  },
}));

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  host.className = 'phone';
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

beforeEach(() => {
  issueAction.mockClear();
  subsNow = SUBS;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

function Host({ start }: { start: string }) {
  const sheets = useSheetStack([{ kind: 'issue', id: start }]);
  return createElement(PhoneSheets, {
    sheets,
    prs: [],
    issues: [PARENT, CHILD],
    viewer: 'acme-dev',
    projectStatus: false,
    writesOff: false,
    onChanged: () => undefined,
  });
}

const button = (el: ParentNode, text: string) => {
  const b = [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`no button ${text}`);
  return b;
};

describe('phone sub-issues section', () => {
  it('shows progress and one row per child with its meta line', () => {
    const el = render(createElement(PhoneSubIssuesSection, { parentRepo: 'acme-banner', subs: SUBS, writesOff: false, onOpen: vi.fn(), onLong: vi.fn(), onCreate: vi.fn() }));
    expect(el.querySelector('.ph-subs-done')?.textContent).toBe('3 of 5 done');
    expect([...el.querySelectorAll('.ph-sub-meta')].map((m) => m.textContent)).toEqual([
      '#14 · closed · build-bot',
      '#17 · open · acme-dev',
      '#15 · closed · build-bot',
      'acme-api #421 · open · acme-dev',
      '#10 · not planned',
    ]);
    expect(subMeta(sub(3, 'open'), 'acme-api')).toBe('acme-banner #3 · open');
  });

  it('tap opens, a long press opens the row sheet instead', () => {
    vi.useFakeTimers();
    const onOpen = vi.fn();
    const onLong = vi.fn();
    const el = render(createElement(PhoneSubIssuesSection, { parentRepo: 'acme-banner', subs: SUBS, writesOff: false, onOpen, onLong, onCreate: vi.fn() }));
    const row = el.querySelectorAll<HTMLButtonElement>('.ph-sub-row')[1]!;
    act(() => row.click());
    expect(onOpen).toHaveBeenCalledWith(SUBS[1]);
    act(() => {
      row.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(600);
      row.dispatchEvent(new Event('pointerup', { bubbles: true }));
      row.click();
    });
    vi.useRealTimers();
    expect(onLong).toHaveBeenCalledWith(SUBS[1]);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('says none yet and keeps the create button for a leaf', () => {
    const onCreate = vi.fn();
    const el = render(createElement(PhoneSubIssuesSection, { parentRepo: 'acme-banner', subs: [], writesOff: false, onOpen: vi.fn(), onLong: vi.fn(), onCreate }));
    expect(el.textContent).toContain('None yet. Break this issue into smaller ones.');
    expect(el.querySelector('.ph-subs-bar')).toBeNull();
    act(() => button(el, 'Create sub-issue').click());
    expect(onCreate).toHaveBeenCalled();
  });
});

describe('phone action sheet', () => {
  const ctx: ActionContext = {
    target: 'issue',
    ownPr: false,
    isAdmin: false,
    adminReady: false,
    orcaAvailable: true,
    issueOpen: true,
    assignedToViewer: true,
    writesOff: false,
    repo: 'acme-banner',
    number: 12,
  };

  it('lists Create sub-issue after Edit title, naming the parent', () => {
    const items = actionItems(ctx);
    const ids = items.map((i) => i.id);
    expect(ids.indexOf('new-sub-issue')).toBe(ids.indexOf('edit-title') + 1);
    expect(items.find((i) => i.id === 'new-sub-issue')).toMatchObject({ label: 'Create sub-issue', sub: 'Adds to acme-banner #12', opens: true });
  });

  it('turns it off offline', () => {
    expect(actionItems({ ...ctx, writesOff: true }).find((i) => i.id === 'new-sub-issue')?.disabled).toBe('Offline');
  });
});

describe('phone sheet flows', () => {
  it('creates a sub-issue from the Details section with one createIssue under the parent', async () => {
    const el = render(createElement(Host, { start: 'I_12' }));
    await flush();
    act(() => button(el, 'Create sub-issue').click());
    const sheet = document.querySelector<HTMLElement>('[aria-label="Create sub-issue"]')!;
    expect(sheet.textContent).toContain('under acme-banner #12');
    const create = [...sheet.querySelectorAll<HTMLButtonElement>('.ph-actionbar .ph-btn')][0]!;
    expect(create.disabled).toBe(true);
    const title = sheet.querySelector<HTMLInputElement>('#ph-sub-title')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(title, 'Fill gaps in the elevation photo set');
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => create.click());
    await flush();
    expect(issueAction).toHaveBeenCalledWith({
      type: 'sub-create',
      repo: 'acme-banner',
      number: 12,
      childRepo: 'acme-banner',
      title: 'Fill gaps in the elevation photo set',
      body: '',
    });
    expect(document.querySelector('[aria-label="Create sub-issue"]')).toBeNull();
  });

  it('long press, Remove, confirm: unlinks only and never closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const el = render(createElement(Host, { start: 'I_12' }));
    await flush();
    const row = el.querySelectorAll<HTMLButtonElement>('.ph-sub-row')[2]!;
    act(() => {
      row.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(600);
    });
    vi.useRealTimers();
    const rowSheet = document.querySelector<HTMLElement>('[aria-label="acme-banner #15"]')!;
    expect([...rowSheet.querySelectorAll('.ph-arow-title')].map((t) => t.textContent)).toEqual(['Open #15', 'Open on GitHub', 'Remove from #12']);
    expect(rowSheet.textContent).toContain('Unlinks only. #15 stays closed');
    act(() => button(rowSheet, 'Remove from #12').click());
    const confirm = document.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(confirm.querySelector('h2')?.textContent).toBe('Remove from #12?');
    expect(confirm.textContent).toContain('stays closed');
    await act(async () => button(confirm, 'Remove').click());
    await flush();
    expect(issueAction.mock.calls.map(([a]) => a)).toEqual([{ type: 'sub-remove', repo: 'acme-banner', number: 12, childId: 'I_15' }]);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('a sub-issue shows the parent row, and tapping it opens the parent', async () => {
    const el = render(createElement(Host, { start: 'I_17' }));
    await flush();
    const parentRow = el.querySelector<HTMLButtonElement>('.ph-parent')!;
    expect(parentRow.textContent).toContain('#12');
    expect(parentRow.textContent).toContain('Rebuild the banner export pipeline');
    act(() => parentRow.click());
    await flush();
    expect(document.querySelector('.ph-sheet-title')?.textContent).toBe('acme-banner #12');
  });

  it('has no reorder on the phone', async () => {
    render(createElement(Host, { start: 'I_12' }));
    await flush();
    expect(document.querySelector('.sub-grip, [draggable="true"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Move up');
  });
});
