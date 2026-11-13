// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrcaInfo } from '../shared/orca';
import type { PrDetail, PrSummary } from '../shared/types';
import { FixButton } from '../web/FixMenu';
import { fixRowsFor } from '../web/fix-rows';
import { phoneFixItems } from '../web/phone/phone-fix';
import { PhoneSheets } from '../web/phone/PhoneSheets';
import { useSheetStack } from '../web/phone/useSheetStack';
import type { MenuControls, OrcaChoice } from '../web/useFixChecks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mock = vi.hoisted(() => ({
  detail: undefined as unknown,
  orca: { available: true, agents: ['claude', 'codex'], repos: ['acme-web'] } as OrcaInfo,
  fail: undefined as Error | undefined,
  release: undefined as (() => void) | undefined,
}));

const orcaDispatch = vi.fn(async (_req: unknown) => {
  if (mock.fail) throw mock.fail;
  await new Promise<void>((r) => (mock.release = r));
  return { ok: true, worktree: 'pr-42-resolve-conflicts' };
});

vi.mock('../web/api', () => ({
  api: {
    detail: async () => mock.detail,
    diff: async () => ({ files: [] }),
    orca: async () => mock.orca,
    orcaModels: async () => ({ models: {}, remembered: { codex: { model: 'gpt-6-astra', effort: 'high' } }, lastAgent: 'codex' }),
    orcaDispatch: (req: unknown) => orcaDispatch(req),
  },
}));

const PR: PrSummary = {
  id: 'PR_42',
  repo: 'acme-web',
  number: 42,
  title: 'Round cart totals',
  author: 'build-bot',
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  headSha: 'abc',
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  commitCount: 1,
  ci: 'fail',
  reviewStatus: '',
  seen: 'seen',
  url: 'https://example.test/acme-web/pull/42',
};

function detailOf(extra: Partial<PrDetail> = {}): PrDetail {
  return {
    summary: { ...PR },
    body: '',
    baseRef: 'main',
    headRef: 'build-bot/cart-rounding',
    checks: [],
    reviewLine: '',
    commits: [],
    commitTotal: 0,
    newCommits: 0,
    files: [],
    reviewBaseGone: false,
    mergeMethod: 'squash',
    mergeable: 'CONFLICTING',
    mergeStateStatus: 'DIRTY',
    ...extra,
  } as unknown as PrDetail;
}

const FAILING = [{ name: 'lint', status: 'fail', url: 'https://example.test/run/1' }];

let root: Root | undefined;
let host: HTMLElement | undefined;

function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

beforeEach(() => {
  mock.detail = detailOf();
  mock.orca = { available: true, agents: ['claude', 'codex'], repos: ['acme-web'] };
  mock.fail = undefined;
  orcaDispatch.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.useRealTimers();
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

const shown = (items: { label: string; sub?: string; disabled?: string }[]) =>
  items.map((i) => ({ title: i.label, sub: i.disabled ?? i.sub, disabled: i.disabled !== undefined }));

describe('phone fix sheet rows match the desktop FixMenu', () => {
  const cases: [string, 'checks' | 'conflicts', OrcaChoice][] = [
    ['conflicts', 'conflicts', 'ready'],
    ['failing checks', 'checks', 'ready'],
    ['conflicts, unmapped repo', 'conflicts', 'unmapped'],
    ['checks, unmapped repo', 'checks', 'unmapped'],
    ['conflicts, Orca absent', 'conflicts', 'absent'],
    ['checks, Orca absent', 'checks', 'absent'],
  ];
  for (const [name, mode, orca] of cases) {
    it(name, () => {
      const rows = fixRowsFor({ mode, orca, busy: false, disabled: undefined });
      expect(shown(phoneFixItems({ mode, orca, writesOff: false, busy: false }))).toEqual(
        rows.map((r) => ({ title: r.title, sub: r.sub, disabled: r.disabled })),
      );
    });
  }

  it('conflicts: Orca first, the bot disabled with its reason', () => {
    expect(shown(phoneFixItems({ mode: 'conflicts', orca: 'ready', writesOff: false, busy: false }))).toEqual([
      {
        title: 'Dispatch with Orca',
        sub: 'New worktree on the PR branch. The agent merges the base branch and resolves conflicts.',
        disabled: false,
      },
      { title: 'Ask Bot', sub: 'Bot cannot resolve conflicts yet. It has no git merge.', disabled: true },
    ]);
  });

  it('an unmapped repo disables the Orca row with Repo not in Orca', () => {
    const orcaRow = phoneFixItems({ mode: 'conflicts', orca: 'unmapped', writesOff: false, busy: false })[0];
    expect(orcaRow).toMatchObject({ id: 'fix-dispatch', disabled: 'Repo not in Orca' });
  });

  it('Orca absent leaves the Orca row out', () => {
    const ids = (mode: 'checks' | 'conflicts') =>
      phoneFixItems({ mode, orca: 'absent', writesOff: false, busy: false }).map((i) => i.id);
    expect(ids('conflicts')).toEqual(['fix-bot']);
    expect(ids('checks')).toEqual(['fix-bot']);
  });

  it('busy shows Dispatching... on the conflicts Orca row', () => {
    expect(phoneFixItems({ mode: 'conflicts', orca: 'ready', writesOff: false, busy: true })[0]?.sub).toBe('Dispatching...');
  });

  it('offline turns every row off', () => {
    for (const mode of ['checks', 'conflicts'] as const) {
      const items = phoneFixItems({ mode, orca: 'ready', writesOff: true, busy: false });
      expect(items.every((i) => i.disabled !== undefined)).toBe(true);
    }
  });
});

describe('desktop FixMenu is unchanged', () => {
  const controls = (over: Partial<MenuControls>): MenuControls => ({
    disabled: undefined,
    orca: 'ready',
    menu: 'x',
    openMenu: () => undefined,
    closeMenu: () => undefined,
    pick: () => undefined,
    ...over,
  });
  const menuText = (fix: MenuControls) => {
    render(createElement(FixButton, { fix, scope: 'x', label: 'Fix', className: 'c', children: 'Fix' }));
    // Comments mode portals its menu to the body.
    const el = document.body;
    const rows = [...el.querySelectorAll('[role="menuitem"]')].map((r) => ({
      title: r.querySelector('.fix-menu-title')?.textContent,
      sub: r.querySelector('.fix-menu-sub')?.textContent,
      disabled: r.getAttribute('aria-disabled') === 'true',
    }));
    return { label: el.querySelector('[role="menu"]')?.getAttribute('aria-label'), rows };
  };

  it('conflicts menu', () => {
    expect(menuText(controls({ mode: 'conflicts' }))).toEqual({
      label: 'Resolve conflicts',
      rows: [
        {
          title: 'Dispatch with Orca',
          sub: 'New worktree on the PR branch. The agent merges the base branch and resolves conflicts.',
          disabled: false,
        },
        { title: 'Ask Bot', sub: 'Bot cannot resolve conflicts yet. It has no git merge.', disabled: true },
      ],
    });
  });

  it('checks menu, unmapped repo', () => {
    expect(menuText(controls({ mode: 'checks', orca: 'unmapped' }))).toEqual({
      label: 'Fix failing checks',
      rows: [
        { title: 'Ask Bot', sub: 'Posts a /bot comment on the PR', disabled: false },
        { title: 'Dispatch with Orca', sub: 'Repo not in Orca', disabled: true },
      ],
    });
  });

  it('comments menu, busy dispatching', () => {
    expect(menuText(controls({ mode: 'comments', all: true, count: 3, busy: true, busyKind: 'dispatch' })).rows).toEqual([
      { title: 'Ask Bot', sub: 'Posts one /bot comment listing 3 comments', disabled: false },
      { title: 'Dispatch with Orca', sub: 'Dispatching...', disabled: false },
    ]);
  });
});

function Host() {
  const sheets = useSheetStack([{ kind: 'pr', id: PR.id }]);
  return createElement(PhoneSheets, {
    sheets,
    prs: [PR],
    issues: [],
    viewer: 'acme-dev',
    projectStatus: false,
    writesOff: false,
    onChanged: () => undefined,
  });
}

const button = (el: ParentNode, text: string): HTMLButtonElement => {
  const b = [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`no button ${text}`);
  return b;
};

async function openOverview(): Promise<HTMLElement> {
  const el = render(createElement(Host));
  await flush();
  await flush();
  act(() => button(el, 'Overview').click());
  return el;
}

describe('phone fix sheet from the PR Overview', () => {
  it('the conflicts row opens the sheet; Orca confirms, names the agent, dispatches, then shows Done', async () => {
    const el = await openOverview();
    act(() => button(el, 'This branch has conflicts').click());
    const sheet = el.querySelector('[role="dialog"][aria-label="Resolve conflicts"]');
    expect(sheet).not.toBeNull();
    expect(button(sheet!, 'Ask Bot').disabled).toBe(true);
    expect(button(sheet!, 'Resolve on GitHub')).toBeTruthy();

    act(() => button(sheet!, 'Dispatch with Orca').click());
    const confirm = el.querySelector('[role="alertdialog"]');
    expect(confirm?.getAttribute('aria-label')).toBe('Dispatch with Orca?');
    expect(confirm?.textContent).toContain('codex · gpt-6-astra · high effort');
    expect(orcaDispatch).not.toHaveBeenCalled();

    await act(async () => new Promise((r) => setTimeout(r, 650)));
    act(() => button(el, 'Dispatch').click());
    expect(button(el, 'Dispatching...').getAttribute('aria-busy')).toBe('true');
    expect(orcaDispatch).toHaveBeenCalledWith({
      repo: 'acme-web',
      number: 42,
      agent: 'codex',
      name: 'pr-42-resolve-conflicts',
      baseBranch: 'build-bot/cart-rounding',
      prompt: expect.stringContaining('Resolve the merge conflicts on acme-web#42'),
      pr: true,
    });

    await act(async () => mock.release?.());
    expect(el.querySelector('.ph-done')?.textContent).toContain('Dispatched to pr-42-resolve-conflicts');
    expect(el.querySelector('.ph-toast')?.textContent).toBe('Dispatched to pr-42-resolve-conflicts');
    act(() => button(el, 'Done').click());
    // Done goes back in history, and the sheet closes on the async popstate, so wait for it.
    await vi.waitFor(() => expect(el.querySelector('[role="alertdialog"]')).toBeNull());
  });

  it('a failing-checks row opens the checks sheet, whose Orca row sends the checks prompt', async () => {
    mock.detail = detailOf({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', checks: FAILING } as Partial<PrDetail>);
    const el = await openOverview();
    act(() => el.querySelector<HTMLButtonElement>('.msb-row-checks')?.click());
    const sheet = el.querySelector('[role="dialog"][aria-label="Fix failing checks"]');
    expect(sheet).not.toBeNull();
    act(() => button(sheet!, 'Dispatch with Orca').click());
    await act(async () => new Promise((r) => setTimeout(r, 650)));
    act(() => button(el, 'Dispatch').click());
    expect(orcaDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'pr-42-fix-checks', pr: true, prompt: expect.stringContaining('- lint: https://example.test/run/1') }),
    );
  });

  it('a failed dispatch re-arms the confirm and says why', async () => {
    mock.fail = new Error('Orca is not available');
    const el = await openOverview();
    act(() => button(el, 'This branch has conflicts').click());
    act(() => button(el, 'Dispatch with Orca').click());
    await act(async () => new Promise((r) => setTimeout(r, 650)));
    await act(async () => button(el, 'Dispatch').click());
    await flush();
    expect(el.querySelector('.ph-toast')?.textContent).toBe('Could not dispatch: Orca is not available');
    expect(button(el, 'Dispatch').disabled).toBe(false);
    expect(el.querySelector('.ph-done')).toBeNull();
  });

  it('with Orca unavailable the conflicts sheet offers no Orca row', async () => {
    mock.orca = { available: false, agents: [] };
    const el = await openOverview();
    act(() => button(el, 'This branch has conflicts').click());
    const sheet = el.querySelector('[role="dialog"][aria-label="Resolve conflicts"]')!;
    expect([...sheet.querySelectorAll('.ph-arow-title')].map((t) => t.textContent)).toEqual(['Ask Bot', 'Resolve on GitHub']);
  });

  it('the More sheet lists Fix conflicts… and opens the same sheet', async () => {
    const el = await openOverview();
    act(() => button(el, 'More').click());
    act(() => button(el, 'Fix conflicts…').click());
    expect(el.querySelector('[role="dialog"][aria-label="Resolve conflicts"]')).not.toBeNull();
  });
});
