// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueAction, IssueDetail, IssueSummary } from '../shared/issue-types';
import type { PrSummary } from '../shared/types';

vi.mock('../web/phone/haptics', () => ({ BUZZ: { success: 10, tick: 5 }, buzz: vi.fn() }));

const mock = vi.hoisted(() => ({
  review: { ok: true, message: 'ok' } as { ok: boolean; message: string },
  issueAction: { ok: true, message: 'ok' } as { ok: boolean; message: string },
}));

const ISSUE: IssueSummary = {
  id: 'I_17',
  repo: 'acme-banner',
  number: 17,
  title: 'Banner export times out',
  author: 'acme-dev',
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  url: 'https://github.com/o/acme-banner/issues/17',
  state: 'open',
  labels: [],
  assignees: [],
  commentCount: 0,
  seen: 'seen',
};

vi.mock('../web/api', () => ({
  api: {
    review: async () => mock.review,
    issueAction: async (_a: IssueAction) => mock.issueAction,
    issueDetail: async (): Promise<IssueDetail> =>
      ({ summary: ISSUE, bodyHtml: '', assignees: [], comments: [], timeline: [], linkedPrs: [], participants: [], subIssues: [], unseenFrom: 0 }) as unknown as IssueDetail,
    orca: async () => ({ available: true, agents: ['claude'], repos: ['acme-banner'] }),
    orcaModels: async () => ({ models: {}, remembered: {}, lastAgent: 'claude' }),
    orcaSessions: async () => ({ available: false }),
    orcaDispatch: async () => ({ ok: true, worktree: 'issue-17-banner-export' }),
    repoMeta: async (repo: string) => ({ repo, labels: [], milestones: [], users: [], fetchedAt: 0 }),
  },
}));

import { buzz } from '../web/phone/haptics';
import { PhoneSheets } from '../web/phone/PhoneSheets';
import { usePhoneWrites, type PhoneWrites } from '../web/phone/usePhoneWrites';
import { useSheetStack } from '../web/phone/useSheetStack';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const button = (el: ParentNode, text: string) => {
  const b = [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`no button ${text}`);
  return b;
};

beforeEach(() => {
  vi.mocked(buzz).mockClear();
  mock.review = { ok: true, message: 'ok' };
  mock.issueAction = { ok: true, message: 'ok' };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('approve haptic', () => {
  let writes: PhoneWrites | undefined;
  function Probe() {
    writes = usePhoneWrites(() => undefined);
    return null;
  }
  const PR = { repo: 'acme-co/orders-api', number: 372 } as PrSummary;

  it('buzzes 10 when an approve succeeds', async () => {
    render(createElement(Probe));
    await act(async () => void (await writes?.review(PR, 'APPROVE', '')));
    expect(buzz).toHaveBeenCalledWith(10);
  });

  it('stays still when the approve fails, or for a plain comment', async () => {
    render(createElement(Probe));
    mock.review = { ok: false, message: 'Forbidden' };
    await act(async () => void (await writes?.review(PR, 'APPROVE', '')));
    mock.review = { ok: true, message: 'ok' };
    await act(async () => void (await writes?.review(PR, 'COMMENT', 'Looks fine')));
    expect(buzz).not.toHaveBeenCalled();
  });
});

describe('issue dispatch haptic', () => {
  function Host() {
    const sheets = useSheetStack([{ kind: 'issue', id: ISSUE.id }]);
    return createElement(PhoneSheets, { sheets, prs: [], issues: [ISSUE], viewer: 'acme-dev', projectStatus: false, writesOff: false, onChanged: () => undefined });
  }

  async function dispatchFromMenu(el: HTMLElement) {
    await flush();
    act(() => button(el, 'Dispatch with Orca').click());
    await act(async () => new Promise((r) => setTimeout(r, 650)));
    await act(async () => button(el, 'Dispatch').click());
    await flush();
  }

  async function openMenu() {
    const el = render(createElement(Host));
    await flush();
    act(() => (el.querySelector('button[aria-label="More actions"]') as HTMLButtonElement).click());
    return el;
  }

  it('buzzes 10 when the dispatch and Start work both succeed', async () => {
    const el = await openMenu();
    await dispatchFromMenu(el);
    expect(buzz).toHaveBeenCalledWith(10);
  });

  it('stays still when Start work fails after the dispatch', async () => {
    mock.issueAction = { ok: false, message: 'Forbidden' };
    const el = await openMenu();
    await dispatchFromMenu(el);
    expect(el.querySelector('.ph-toast')?.textContent).toContain('Start work failed');
    expect(buzz).not.toHaveBeenCalled();
  });
});
