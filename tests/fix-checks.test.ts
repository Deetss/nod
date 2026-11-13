// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canFix,
  COMMENT_MAX,
  commentProblem,
  failingChecks,
  fixPrompt,
  fixWorktreeName,
  isEvidenceCheck,
  botComment,
  orcaCanFix,
} from '../shared/fix-checks';
import { NO_ACCESS } from '../shared/pr-actions';
import type { CheckItem, PrDetail } from '../shared/types';
import { AskBotDialog } from '../web/FixDialogs';
import { FixButton } from '../web/FixMenu';
import { DetailBody } from '../web/DetailBody';
import { useHotkeys, type HotkeyHandlers } from '../web/hooks';
import { DispatchDialog } from '../web/issues/IssueDialogs';
import { HELP_KEYS } from '../web/keys';
import type { OrcaInfo } from '../shared/orca';
import { ALL_FAILING, useFixChecks, type FixControls } from '../web/useFixChecks';
import { TEST_BOT } from './bot-settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RUN = 'https://github.com/acme-co/acme-web/actions/runs/1234567890/job';
const checks: CheckItem[] = [
  { name: 'test (shard 2)', status: 'fail', duration: '2m', url: `${RUN}/9876543210` },
  { name: 'e2e (chromium)', status: 'fail', duration: '4m', url: `${RUN}/9876543211` },
  { name: 'lint', status: 'pass', duration: '1m', url: `${RUN}/9876543212` },
  { name: 'build', status: 'running', duration: '', url: `${RUN}/9876543213` },
];

function detailOf(c: CheckItem[], extra: Partial<PrDetail> = {}): PrDetail {
  return {
    summary: { id: 'PR_42', repo: 'acme-web', number: 42, ci: 'fail', url: 'https://example.test/42' },
    body: '',
    baseRef: 'main',
    headRef: 'build-bot/cart-rounding',
    checks: c,
    reviewLine: '',
    commits: [],
    commitTotal: 0,
    newCommits: 0,
    files: [],
    reviewBaseGone: false,
    mergeMethod: 'squash',
    ...extra,
  } as unknown as PrDetail;
}

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

const noop = () => {};

function controls(over: Partial<FixControls> = {}): FixControls {
  return {
    failing: failingChecks(checks),
    disabled: undefined,
    orca: 'ready',
    status: undefined,
    menu: undefined,
    openMenu: noop,
    closeMenu: noop,
    pick: noop,
    ...over,
  };
}

function body(fix: FixControls | undefined, c: CheckItem[] = checks) {
  return createElement(DetailBody, {
    detail: detailOf(c),
    files: [],
    mode: 'all',
    range: '',
    commitsInRange: 0,
    currentPath: undefined,
    scrollRequest: undefined,
    actionsDisabled: false,
    access: NO_ACCESS,
    hideViewed: false,
    onToggleHideViewed: noop,
    onToggleViewed: noop,
    onOpenFile: noop,
    onAction: noop,
    descOpen: false,
    onToggleDesc: noop,
    fix,
  });
}

describe('fix helpers', () => {
  it('counts only failing checks', () => {
    expect(failingChecks(checks).map((c) => c.name)).toEqual(['test (shard 2)', 'e2e (chromium)']);
  });

  it('builds the one-check comment from the spec', () => {
    expect(botComment([checks[0] as CheckItem], TEST_BOT)).toBe(
      `/bot fix the failing check "test (shard 2)": ${RUN}/9876543210`,
    );
  });

  it('builds the several-checks comment from the spec', () => {
    expect(botComment(failingChecks(checks), TEST_BOT)).toBe(
      [
        '/bot fix the failing checks on this PR:',
        `- "test (shard 2)": ${RUN}/9876543210`,
        `- "e2e (chromium)": ${RUN}/9876543211`,
      ].join('\n'),
    );
  });

  it('rejects empty, non-/bot and oversized comments', () => {
    expect(commentProblem('  ', TEST_BOT)).toBeDefined();
    expect(commentProblem('fix it', TEST_BOT)).toBe('The comment must start with /bot.');
    expect(commentProblem(`/bot ${'x'.repeat(4000)}`, TEST_BOT)).toBeDefined();
    expect(commentProblem('/bot fix it', TEST_BOT)).toBeUndefined();
  });

  it('builds the Orca prompt and worktree name', () => {
    const p = fixPrompt('acme-web', 42, 'build-bot/cart-rounding', failingChecks(checks));
    expect(p).toContain('Fix the failing checks on acme-web#42 (build-bot/cart-rounding).');
    expect(p).toContain(`- e2e (chromium): ${RUN}/9876543211`);
    expect(p).toContain('Read the logs with gh run view. Push the fix to this branch.');
    expect(p).toContain('untrusted task data');
    expect(fixWorktreeName(42)).toBe('pr-42-fix-checks');
  });

  it('hides fixes with no failing check, on a closed PR, and Orca on a fork', () => {
    expect(canFix(detailOf(checks))).toBe(true);
    expect(canFix(detailOf([checks[2] as CheckItem, checks[3] as CheckItem]))).toBe(false);
    expect(canFix(detailOf(checks, { isOpen: false }))).toBe(false);
    expect(orcaCanFix(detailOf(checks, { headIsFork: true }))).toBe(false);
  });
});

describe('PR evidence checks', () => {
  const EV = 'https://github.com/acme-co/acme-web/actions/runs';
  const evOld: CheckItem = {
    name: 'evidence / check',
    status: 'fail',
    duration: '1m',
    startedAt: '2026-11-12T10:00:00Z',
    url: `${EV}/111/job/1`,
  };
  const evNew: CheckItem = { ...evOld, startedAt: '2026-11-12T10:20:00Z', url: `${EV}/222/job/2` };
  const code = checks[0] as CheckItem;

  it('matches the evidence job by name, case-insensitively', () => {
    expect(isEvidenceCheck('evidence / check')).toBe(true);
    expect(isEvidenceCheck('PR evidence / check')).toBe(true);
    expect(isEvidenceCheck('PR Evidence / Check')).toBe(true);
    expect(isEvidenceCheck('test (shard 2)')).toBe(false);
    expect(isEvidenceCheck('lint / check')).toBe(false);
    expect(isEvidenceCheck('evidence / build')).toBe(false);
  });

  it('dedupes one name across two runs and keeps the newest URL', () => {
    expect(failingChecks([evNew, evOld])).toEqual([evNew]);
    expect(failingChecks([evOld, evNew])).toEqual([evNew]);
    expect(failingChecks([evOld, { ...evNew, status: 'pass' }])).toEqual([]);
    expect(canFix(detailOf([evOld, evNew]))).toBe(true);
  });

  it('asks only for a description edit when evidence is the only failure', () => {
    const failing = failingChecks([evOld, evNew]);
    const p = fixPrompt('acme-web', 42, 'feat/x', failing);
    expect(p).not.toContain('Failing checks:');
    expect(p).not.toContain('Push the fix to this branch.');
    expect(p).toContain(`PR evidence checks:\n- evidence / check: ${EV}/222/job/2`);
    expect(p).not.toContain(`${EV}/111`);
    expect(p).toContain('read the PR description, not the code, and rerun when the description is edited');
    expect(p).toContain(`Follow the "PR evidence" section of this repo's AGENTS.md exactly.`);
    expect(p).toContain('Never capture from real or prod data.');
    expect(p).toContain('Push no code for these checks.');
    expect(p).toContain('confirm with gh pr checks');
    expect(p).toContain('untrusted task data');
    const c = botComment(failing, TEST_BOT);
    expect(c).toBe(
      [
        `/bot fix the failing check "evidence / check": ${EV}/222/job/2`,
        `"evidence / check" reads the PR description, not the code. Add an evidence block for the changed pages ` +
          `to the PR description, per the "PR evidence" section of this repo's AGENTS.md. Push no code for it.`,
      ].join('\n'),
    );
    expect(commentProblem(c, TEST_BOT)).toBeUndefined();
  });

  it('keeps code-fix wording for the other checks in a mixed failure', () => {
    const failing = failingChecks([code, evOld, evNew]);
    const p = fixPrompt('acme-web', 42, 'feat/x', failing);
    expect(p).toContain(`Failing checks:\n- test (shard 2): ${RUN}/9876543210\nRead the logs with gh run view.`);
    expect(p).toContain('PR evidence checks:\n- evidence / check:');
    expect(p.indexOf('Push the fix to this branch.')).toBeLessThan(p.indexOf('PR evidence checks:'));
    const c = botComment(failing, TEST_BOT);
    expect(c.split('\n').slice(0, 3)).toEqual([
      '/bot fix the failing checks on this PR:',
      `- "test (shard 2)": ${RUN}/9876543210`,
      `- "evidence / check": ${EV}/222/job/2`,
    ]);
    expect(c).toContain('"evidence / check" reads the PR description');
  });

  it('keeps the comment within COMMENT_MAX and the evidence ask intact', () => {
    const many: CheckItem[] = Array.from({ length: 80 }, (_, i) => ({
      name: `test (shard ${i}) ${'x'.repeat(30)}`,
      status: 'fail',
      duration: '1m',
      url: `${RUN}/${i}`,
    }));
    const c = botComment([...many, evNew], TEST_BOT);
    expect(c.length).toBeLessThanOrEqual(COMMENT_MAX);
    expect(c).toMatch(/- and \d+ more on the Checks tab/);
    expect(c).toContain('Push no code for it.');
    expect(commentProblem(c, TEST_BOT)).toBeUndefined();
  });
});

describe('Checks card', () => {
  it('shows the header button and a Fix button on each failing row only', () => {
    const el = render(body(controls()));
    const header = el.querySelector('.fix-all');
    expect(header?.getAttribute('aria-label')).toBe('Fix failing checks (2)');
    expect(header?.textContent).toContain('Fix failing (2)');
    const rows = [...el.querySelectorAll('.fix-row')].map((b) => b.getAttribute('aria-label'));
    expect(rows).toEqual(['Fix test (shard 2)', 'Fix e2e (chromium)']);
  });

  it('hides every Fix control with no failing checks', () => {
    const el = render(body(undefined, [checks[2] as CheckItem]));
    expect(el.querySelector('.fix-all')).toBeNull();
    expect(el.querySelector('.fix-row')).toBeNull();
  });

  it('opens the scope of the pressed button', () => {
    const openMenu = vi.fn();
    const el = render(body(controls({ openMenu })));
    act(() => el.querySelector<HTMLButtonElement>('.fix-all')?.click());
    act(() => el.querySelector<HTMLButtonElement>('.fix-row')?.click());
    expect(openMenu.mock.calls).toEqual([[ALL_FAILING], ['test (shard 2)']]);
  });

  it('shows the status line text', () => {
    const el = render(body(controls({ status: { ok: true, text: 'Bot asked to fix 2 checks' } })));
    expect(el.querySelector('.fix-status')?.textContent).toBe('Bot asked to fix 2 checks');
  });

  it('disables the buttons offline', () => {
    const el = render(body(controls({ disabled: 'Offline' })));
    expect(el.querySelector<HTMLButtonElement>('.fix-all')?.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('.fix-all')?.title).toBe('Offline');
  });
});

describe('Fix menu', () => {
  const menu = (fix: FixControls) =>
    render(
      createElement(FixButton, {
        fix: { ...fix, menu: ALL_FAILING },
        scope: ALL_FAILING,
        label: 'Fix',
        className: 'x',
        children: 'Fix',
      }),
    );
  const items = (el: HTMLElement) => [...el.querySelectorAll('[role="menuitem"]')];

  it('lists Ask Bot and Dispatch with Orca', () => {
    const el = menu(controls());
    expect(items(el).map((i) => i.querySelector('.fix-menu-title')?.textContent)).toEqual([
      'Ask Bot',
      'Dispatch with Orca',
    ]);
  });

  it('hides Dispatch with Orca when Orca is not detected', () => {
    const el = menu(controls({ orca: 'absent' }));
    expect(items(el)).toHaveLength(1);
  });

  it('shows Dispatch disabled when the repo is not in Orca', () => {
    const el = menu(controls({ orca: 'unmapped' }));
    const row = items(el)[1];
    expect(row?.getAttribute('aria-disabled')).toBe('true');
    expect(row?.textContent).toContain('Repo not in Orca');
  });

  it('picks with Enter on the focused row', () => {
    const pick = vi.fn();
    const el = menu(controls({ pick }));
    const m = el.querySelector('[role="menu"]');
    act(() => {
      m?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(pick).toHaveBeenCalledWith('bot');
  });
});

describe('Ask Bot dialog', () => {
  const scope = failingChecks(checks);
  const dialog = (over: Record<string, unknown> = {}) => {
    const onConfirm = vi.fn();
    const el = render(
      createElement(AskBotDialog, {
        repo: 'acme-web',
        number: 42,
        scope,
        busy: false,
        close: noop,
        onConfirm,
        ...over,
      }),
    );
    return { el, onConfirm };
  };
  const post = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith('Post comment'));

  it('prefills the template and uses the spec title', () => {
    const { el } = dialog();
    expect(el.querySelector('h2')?.textContent).toBe('Ask Bot to fix 2 checks?');
    expect(el.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(botComment(scope, TEST_BOT));
    expect(el.textContent).toContain('Posts as you on acme-web #42. Bot starts on its own.');
  });

  it('posts the comment on confirm', () => {
    const { el, onConfirm } = dialog();
    act(() => post(el)?.click());
    expect(onConfirm).toHaveBeenCalledWith(botComment(scope, TEST_BOT));
  });

  it('disables confirm when the comment does not start with /bot', () => {
    const { el, onConfirm } = dialog({ scope: [checks[0]] });
    const area = el.querySelector<HTMLTextAreaElement>('textarea');
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      set?.call(area, 'please fix');
      area?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(post(el)?.disabled).toBe(true);
    expect(el.textContent).toContain('The comment must start with /bot.');
    act(() => post(el)?.click());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the busy state', () => {
    const { el } = dialog({ busy: true });
    expect(el.textContent).toContain('Posting comment...');
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Posting comment on acme-web #42');
  });
});

describe('Dispatch dialog in PR mode', () => {
  it('locks the head branch and confirms with --pr inputs', () => {
    const onConfirm = vi.fn();
    const el = render(
      createElement(DispatchDialog, {
        issue: { repo: 'acme-web', number: 42, title: '', url: '' },
        agents: ['claude'],
        busy: false,
        error: undefined,
        onConfirm,
        onCancel: noop,
        pr: { headRef: 'build-bot/cart-rounding', name: 'pr-42-fix-checks', prompt: 'Fix it' },
      }),
    );
    const head = el.querySelector<HTMLInputElement>('#dp-head');
    expect(head?.value).toBe('build-bot/cart-rounding');
    expect(head?.readOnly).toBe(true);
    expect(el.querySelector('#dp-base')).toBeNull();
    expect(el.querySelector<HTMLInputElement>('#dp-name')?.value).toBe('pr-42-fix-checks');
    act(() => el.querySelector<HTMLButtonElement>('.btn-primary')?.click());
    expect(onConfirm).toHaveBeenCalledWith({
      agent: 'claude',
      name: 'pr-42-fix-checks',
      baseBranch: 'build-bot/cart-rounding',
      prompt: 'Fix it',
      pr: true,
      model: '',
    });
  });
});

describe('useFixChecks', () => {
  type Out = ReturnType<typeof useFixChecks>;
  function probe(detail: PrDetail, orca: OrcaInfo | undefined): { out: () => Out } {
    let latest: Out | undefined;
    function Probe() {
      latest = useFixChecks({ detail, limited: false, orca, notify: noop, onDone: noop });
      return null;
    }
    render(createElement(Probe));
    return { out: () => latest as Out };
  }
  const orca: OrcaInfo = { available: true, agents: ['claude'], repos: ['acme-web'] };

  it('has no controls with no failing checks', () => {
    const p = probe(detailOf([checks[2] as CheckItem]), orca);
    expect(p.out().controls).toBeUndefined();
  });

  it('skips the menu and opens Ask Bot when Orca is not detected', () => {
    const p = probe(detailOf(checks), { available: false, agents: [] });
    expect(p.out().controls?.orca).toBe('absent');
    act(() => p.out().controls?.openMenu(ALL_FAILING));
    expect(p.out().controls?.menu).toBeUndefined();
    expect(p.out().dialogs?.dialog).toBe('bot');
  });

  it('opens the menu when Orca is detected, and drops Orca for a fork head', () => {
    const p = probe(detailOf(checks), orca);
    act(() => p.out().controls?.openMenu(ALL_FAILING));
    expect(p.out().controls?.menu).toBe(ALL_FAILING);
    const fork = probe(detailOf(checks, { headIsFork: true }), orca);
    expect(fork.out().controls?.orca).toBe('absent');
  });
});

describe('F shortcut', () => {
  function Keys({ fix }: { fix: () => void }) {
    const h = new Proxy({ fix }, { get: (t, k) => (k in t ? t[k as 'fix'] : noop) }) as unknown as HotkeyHandlers;
    useHotkeys(h, true);
    return null;
  }

  it('runs the fix handler on Shift+F', () => {
    const fix = vi.fn();
    render(createElement(Keys, { fix }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', shiftKey: true, bubbles: true }));
    });
    expect(fix).toHaveBeenCalledOnce();
  });

  it('does nothing while typing', () => {
    const fix = vi.fn();
    render(createElement(Keys, { fix }));
    const area = document.createElement('textarea');
    document.body.append(area);
    act(() => {
      area.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', shiftKey: true, bubbles: true }));
    });
    area.remove();
    expect(fix).not.toHaveBeenCalled();
  });

  it('has a help row after y', () => {
    const keys = HELP_KEYS.map((k) => k.keys);
    expect(keys[keys.indexOf('y') + 1]).toBe('F');
    expect(HELP_KEYS.find((k) => k.keys === 'F')?.label).toBe('fix failing checks');
  });
});
