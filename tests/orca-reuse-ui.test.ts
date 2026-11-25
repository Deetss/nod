// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThreadItem } from '../shared/fix-comments';
import { dispatchedMessage } from '../shared/orca';
import type { WorktreeView } from '../shared/orca-sessions';
import { DispatchAllDialog } from '../web/DispatchAll';
import { DispatchDialog } from '../web/issues/IssueDialogs';
import { LOCAL_ONLY } from '../web/orca/hosts';
import { OrcaSessionsContext } from '../web/orca/OrcaContext';
import { PhoneDispatchAll } from '../web/phone/PhoneDispatchAll';
import type { DispatchAllView, DispatchOffer } from '../web/useFindings';

vi.mock('../web/api', () => ({ api: { orcaModels: () => new Promise(() => undefined) } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
function render(node: ReactNode): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
});

const idle: WorktreeView = {
  worktreeId: 'w1',
  host: 'laptop',
  name: 'pr-365-fix-checks',
  branch: 'feature/365',
  via: 'pr',
  reason: 'linked PR #365',
};

const click = (el: Element | null | undefined): void => act(() => (el as HTMLElement).click());
const primary = (): HTMLButtonElement => document.body.querySelector('.btn-primary') as HTMLButtonElement;
const newRow = (): Element | null => document.body.querySelector('.orca-new-row');

describe('dispatchedMessage', () => {
  it('names the host when the worktree was reused', () => {
    expect(dispatchedMessage({ worktree: 'pr-365-fix-checks', host: 'laptop', reused: true })).toBe('Reused pr-365-fix-checks on laptop');
  });
  it('falls back to local for a reused worktree with no host', () => {
    expect(dispatchedMessage({ worktree: 'pr-365-fix-checks', reused: true })).toBe('Reused pr-365-fix-checks on local');
  });
  it('keeps the plain message for a new worktree', () => {
    expect(dispatchedMessage({ worktree: 'pr-365-fix-checks', host: 'laptop' })).toBe('Dispatched to pr-365-fix-checks');
  });
});

describe('Fix dialog with an idle worktree', () => {
  function fixDialog(withIdle: boolean, onConfirm = vi.fn()) {
    const value = {
      available: true,
      byPr: { 'pr-1': { related: [], possible: [], ...(withIdle ? { idle: [idle] } : {}) } },
      byIssue: {},
      hosts: LOCAL_ONLY,
      hostPrefs: {},
      setRepoHost: vi.fn(),
    };
    render(
      createElement(
        OrcaSessionsContext.Provider,
        { value },
        createElement(DispatchDialog, {
          issue: { repo: 'acme-co/orders-api', number: 365, title: '', url: '' },
          agents: ['claude'],
          busy: false,
          error: undefined,
          onConfirm,
          onCancel: vi.fn(),
          pr: { id: 'pr-1', headRef: 'feature/365', name: 'pr-365-fix-checks-2', prompt: 'Fix it' },
        }),
      ),
    );
    return onConfirm;
  }

  it('offers the idle worktree by default and asks for no new one', () => {
    const onConfirm = fixDialog(true);
    expect(document.body.textContent).toContain('pr-365-fix-checks');
    expect(document.body.textContent).toContain('No agent');
    expect(document.body.querySelector('#dp-name')).toBeNull();
    click(primary());
    const req = onConfirm.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(req.pr).toBe(true);
    expect(req).not.toHaveProperty('newWorktree');
    expect(req).not.toHaveProperty('host');
  });

  it('sends newWorktree only after New worktree is picked', () => {
    const onConfirm = fixDialog(true);
    click(newRow());
    expect(document.body.querySelector('#dp-name')).not.toBeNull();
    click(primary());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ newWorktree: true, name: 'pr-365-fix-checks-2', pr: true });
  });

  it('shows no reuse row when the PR has no worktree', () => {
    const onConfirm = fixDialog(false);
    expect(document.body.textContent).not.toContain('No agent');
    click(primary());
    expect(onConfirm.mock.calls[0]?.[0]).not.toHaveProperty('newWorktree');
  });
});

const row = {
  finding: { thread: { id: 't1', path: 'src/orders.ts', line: 3 } as ThreadItem, severity: 'blocker' as const, text: 'Null check' },
  checked: true,
};
function view(offer: Partial<DispatchOffer> = {}): DispatchAllView {
  return {
    repo: 'acme-co/orders-api',
    number: 365,
    rows: [row],
    text: '[nod] one finding',
    edited: false,
    stale: false,
    busy: false,
    error: undefined,
    offer: { related: [], possible: [], agents: ['claude'], headRef: 'feature/365', ...offer },
    picked: undefined,
  };
}
const allDialog = (v: DispatchAllView, onConfirm = vi.fn()) =>
  createElement(DispatchAllDialog, { v, onToggle: vi.fn(), onEdit: vi.fn(), onRebuild: vi.fn(), onCancel: vi.fn(), onConfirm });

describe('Dispatch all with an idle worktree', () => {
  it('defaults to reusing it and sends no newWorktree', () => {
    const onConfirm = vi.fn();
    render(allDialog(view({ idle }), onConfirm));
    expect(document.body.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain('pr-365-fix-checks');
    click(primary());
    const t = onConfirm.mock.calls[0]?.[0] as { kind: string; request: Record<string, unknown> };
    expect(t.kind).toBe('worktree');
    expect(t.request).not.toHaveProperty('newWorktree');
    expect(t.request).not.toHaveProperty('host');
  });

  it('sends newWorktree when New worktree is picked', () => {
    const onConfirm = vi.fn();
    render(allDialog(view({ idle }), onConfirm));
    click(newRow());
    click(primary());
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ kind: 'worktree', request: { newWorktree: true, pr: true } });
  });

  it('keeps the plain new worktree without an idle one', () => {
    const onConfirm = vi.fn();
    render(allDialog(view(), onConfirm));
    expect(document.body.textContent).not.toContain('No agent');
    click(primary());
    expect((onConfirm.mock.calls[0]?.[0] as { request: object }).request).not.toHaveProperty('newWorktree');
  });
});

describe('phone Dispatch all', () => {
  it('says which worktree it reuses', () => {
    render(createElement(PhoneDispatchAll, { v: view({ idle }), onToggle: vi.fn(), onEdit: vi.fn(), onRebuild: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn() }));
    expect(document.body.querySelector('.ph-fit-note')?.textContent).toBe('No agent on PR #365. Reuses pr-365-fix-checks on laptop.');
  });
});
