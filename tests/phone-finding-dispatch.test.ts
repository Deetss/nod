// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrSessions, SessionView } from '../shared/orca-sessions';
import type { PrDetail } from '../shared/types';
import { useOrca, type OrcaController } from '../web/orca/useOrca';
import { sendFailure } from '../web/useFindings';

const mocks = vi.hoisted(() => ({
  sessions: { related: [], possible: [] } as { related: unknown[]; possible: unknown[] },
  orcaSend: vi.fn(),
  orcaChoose: vi.fn(),
  orcaDispatch: vi.fn(),
}));

vi.mock('../web/api', () => ({
  api: {
    orcaSessions: vi.fn(() => new Promise(() => undefined)),
    orcaModels: vi.fn(() => new Promise(() => undefined)),
    orcaSend: mocks.orcaSend,
    orcaChoose: mocks.orcaChoose,
    orcaDispatch: mocks.orcaDispatch,
  },
}));

vi.mock('../web/useRemote', () => ({
  useRemote: () => ({
    data: { available: true, at: 1, byPr: { 'pr-1': mocks.sessions }, byIssue: {}, prefs: { enabled: true, repos: {} } },
    reload: () => undefined,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;

beforeEach(() => {
  mocks.sessions = { related: [], possible: [] };
  mocks.orcaSend.mockReset();
  mocks.orcaChoose.mockReset().mockResolvedValue({});
  mocks.orcaDispatch.mockReset().mockResolvedValue({ ok: true, worktree: 'pr-7' });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const detail = { summary: { id: 'pr-1', repo: 'acme/app', number: 7 }, headRef: 'feature/7', checks: [], thread: [] } as unknown as PrDetail;
const TAG = 'pr-1|t1';
const TEXT = 'Fix the coverage summary';

const session = (name: string, reason: string): SessionView => ({ id: name, host: 'local', name, state: 'working', branch: name, via: 'pr', reason });

function mount(phone: boolean) {
  const onFindingDispatched = vi.fn();
  const onFindingResult = vi.fn();
  let ctl: OrcaController | undefined;
  function Harness() {
    ctl = useOrca({
      detail,
      orca: { available: true, agents: ['claude', 'codex'] },
      active: true,
      syncedAt: undefined,
      repoNames: [],
      toast: () => undefined,
      onDetails: () => undefined,
      onFindingDispatched,
      onFindingResult,
      phone,
    });
    return createElement('div', null, ctl.overlays);
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(Harness)));
  const send = (where?: string) => {
    let started = false;
    act(() => {
      started = (ctl as OrcaController).findingSender?.send(TEXT, TAG, where) ?? false;
    });
    return started;
  };
  // Primer renders dialogs in a portal on document.body, outside the host.
  return { el: document.body, send, onFindingDispatched, onFindingResult };
}

const btn = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement;
const flush = () => act(async () => void (await Promise.resolve()));

describe('phone finding dispatch, no linked session (Job 3)', () => {
  it('opens a bottom sheet, not a centred modal, with the spec defaults', () => {
    const { el, send } = mount(true);
    expect(send()).toBe(true);

    expect(el.querySelector('.ph-scrim.is-center, .ph-confirm, .scrim, .dialog')).toBeNull();
    const sheet = el.querySelector('.ph-sheet.is-fit');
    expect(sheet?.getAttribute('aria-label')).toBe('Dispatch with Orca');
    expect(el.querySelector('.ph-sheet-sub')?.textContent).toBe('acme/app #7');
    expect((el.querySelector('#ph-fix-name') as HTMLInputElement).value).toBe('pr-7');
    expect((el.querySelector('#ph-fix-head') as HTMLInputElement).value).toBe('feature/7');
    expect((el.querySelector('#ph-fix-prompt') as HTMLTextAreaElement).value).toBe(TEXT);
    expect(el.querySelector('.ph-fit-counter')?.textContent).toContain(`${TEXT.length} / 600`);
    expect(el.querySelector('.ph-actionbar')).not.toBeNull();
  });

  it('keeps the desktop dialog and its worktree name off the phone', () => {
    const { el, send } = mount(false);
    send();
    expect(el.querySelector('.ph-sheet')).toBeNull();
    expect(el.querySelector('.dialog')).not.toBeNull();
    expect(el.querySelector('input[value="pr-7-finding"]')).not.toBeNull();
  });

  it('posts the PR dispatch, closes, and tells the card', async () => {
    const { el, send, onFindingDispatched } = mount(true);
    send();
    act(() => btn(el, 'Dispatch').click());
    await flush();

    expect(mocks.orcaDispatch).toHaveBeenCalledWith({
      repo: 'acme/app',
      number: 7,
      agent: 'claude',
      name: 'pr-7',
      baseBranch: 'feature/7',
      prompt: TEXT,
      pr: true,
    });
    expect(onFindingDispatched).toHaveBeenCalledWith(TAG, 'pr-7');
    expect(el.querySelector('.ph-sheet')).toBeNull();
  });

  it('locks the fields while dispatching', async () => {
    let finish: (v: unknown) => void = () => undefined;
    mocks.orcaDispatch.mockReturnValue(new Promise((r) => (finish = r)));
    const { el, send } = mount(true);
    send();
    act(() => btn(el, 'Dispatch').click());

    expect(btn(el, 'Dispatching...').getAttribute('aria-busy')).toBe('true');
    expect(btn(el, 'Cancel').disabled).toBe(true);
    expect((el.querySelector('#ph-fix-prompt') as HTMLTextAreaElement).readOnly).toBe(true);
    expect(el.querySelector('.ph-fit-counter')?.textContent).toContain('Fields are locked while dispatching.');
    expect(el.querySelector<HTMLButtonElement>('[aria-label="Back"]')?.disabled).toBe(true);

    await act(async () => finish({ ok: true, worktree: 'pr-7' }));
  });

  it('keeps the sheet and text on failure, and offers Retry', async () => {
    mocks.orcaDispatch.mockRejectedValue(new Error('Dispatch failed: Worktree pr-7 already exists'));
    const { el, send, onFindingDispatched } = mount(true);
    send();
    act(() => btn(el, 'Dispatch').click());
    await flush();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Dispatch failed: Worktree pr-7 already exists');
    expect(btn(el, 'Retry')).toBeTruthy();
    expect((el.querySelector('#ph-fix-prompt') as HTMLTextAreaElement).value).toBe(TEXT);
    expect(onFindingDispatched).not.toHaveBeenCalled();
  });
});

describe('phone finding dispatch, one linked session (Job 1)', () => {
  beforeEach(() => {
    mocks.sessions = { related: [session('fix-7', 'linked PR #7')], possible: [] };
  });

  it('opens the Send sheet with the finding text and file line', () => {
    const { el, send } = mount(true);
    send('db/a.rb:12');

    expect(el.querySelector('.ph-sheet.is-fit')?.getAttribute('aria-label')).toBe('Send to Orca session');
    expect(el.querySelector('.ph-sheet-sub')?.textContent).toBe('db/a.rb:12');
    expect(el.querySelector('.ph-fit-session-name')?.textContent).toBe('fix-7');
    expect(el.querySelector('.ph-fit-pill')?.textContent).toBe('Linked');
    expect((el.querySelector('#ph-send-text') as HTMLTextAreaElement).value).toBe(TEXT);
    expect(el.querySelector('.ph-fit-counter')?.textContent).toContain('Nothing is sent until you press Send.');
    expect(el.querySelector('.dialog')).toBeNull();
  });

  it('closes on a confirmed send and reports it to the finding', async () => {
    mocks.orcaSend.mockResolvedValue({ status: 'sent' });
    const { el, send, onFindingResult } = mount(true);
    send('db/a.rb:12');
    act(() => btn(el, 'Send').click());
    await flush();

    expect(mocks.orcaSend).toHaveBeenCalledWith(expect.objectContaining({ id: 'fix-7', host: 'local' }), TEXT, undefined);
    expect(onFindingResult).toHaveBeenCalledWith(TAG, expect.objectContaining({ status: 'sent' }));
    expect(el.querySelector('.ph-sheet')).toBeNull();
  });

  it('stays open with the error and Retry when the send is not confirmed', async () => {
    mocks.orcaSend.mockResolvedValue({ status: 'unconfirmed' });
    const { el, send } = mount(true);
    send('db/a.rb:12');
    act(() => btn(el, 'Send').click());
    await flush();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Not confirmed: fix-7 may not have the message. Your text is kept.');
    expect(btn(el, 'Retry')).toBeTruthy();
    expect((el.querySelector('#ph-send-text') as HTMLTextAreaElement).value).toBe(TEXT);
  });

  it('locks while sending', () => {
    mocks.orcaSend.mockReturnValue(new Promise(() => undefined));
    const { el, send } = mount(true);
    send('db/a.rb:12');
    act(() => btn(el, 'Send').click());

    expect(btn(el, 'Sending...').getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.ph-fit-counter')?.textContent).toContain('Sending to fix-7. Fields are locked.');
    expect(btn(el, 'Cancel').disabled).toBe(true);
  });
});

describe('phone finding dispatch, several sessions (Job 2)', () => {
  beforeEach(() => {
    mocks.sessions = {
      related: [session('fix-7', 'linked PR #7')],
      possible: [session('crew-310', 'branch crew/x'), session('crew-305-a', 'branch feature/305')],
    } satisfies PrSessions;
  });

  const pickerTwo = () => {
    // A single related row goes straight to Send, so drop it to make the picker show.
    mocks.sessions = { ...mocks.sessions, related: [session('fix-7', 'linked PR #7'), session('fix-7b', 'linked PR #7')] };
  };

  it('opens the picker sheet with the first related row selected', () => {
    pickerTwo();
    const { el, send } = mount(true);
    send('db/a.rb:12');

    expect(el.querySelector('.ph-sheet.is-fit')?.getAttribute('aria-label')).toBe('Choose a session for #7');
    expect(el.querySelector('.ph-sheet-sub')?.textContent).toBe('2 related, 2 possible');
    expect(el.querySelectorAll('[role="radio"]').length).toBe(4);
    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain('fix-7');
    expect(btn(el, 'Remember and continue')).toBeTruthy();
    expect(el.querySelector('.scrim, .picker')).toBeNull();
  });

  it('turns the primary into Send once for a possible row, then opens Send', async () => {
    pickerTwo();
    const { el, send } = mount(true);
    send('db/a.rb:12');
    const rows = [...el.querySelectorAll<HTMLElement>('[role="radio"]')];
    act(() => rows[2]?.click());

    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain('crew-310');
    expect(el.textContent).toContain('Send once');
    act(() => btn(el, 'Send once').click());
    await flush();

    expect(mocks.orcaChoose).not.toHaveBeenCalled();
    expect(el.querySelector('.ph-sheet')?.getAttribute('aria-label')).toBe('Send to Orca session');
    expect(el.querySelector('.ph-fit-pill')?.textContent).toBe('Possible');
    expect(el.querySelector('.ph-sheet-sub')?.textContent).toBe('db/a.rb:12');
  });

  it('remembers a related choice and opens Send', async () => {
    pickerTwo();
    const { el, send } = mount(true);
    send('db/a.rb:12');
    act(() => btn(el, 'Remember and continue').click());
    await flush();

    expect(mocks.orcaChoose).toHaveBeenCalledWith('pr-1', expect.objectContaining({ id: 'fix-7', host: 'local' }));
    expect(el.querySelector('.ph-sheet')?.getAttribute('aria-label')).toBe('Send to Orca session');
    expect(el.querySelector('.ph-fit-pill')?.textContent).toBe('Linked');
  });
});

describe('sendFailure', () => {
  it('is undefined for a confirmed send and names the session otherwise', () => {
    expect(sendFailure('sent', 'fix-7')).toBeUndefined();
    expect(sendFailure('unconfirmed', 'fix-7')).toBe('Not confirmed: fix-7 may not have the message');
    expect(sendFailure('unreachable', 'fix-7')).toBe('Not confirmed: Orca is down');
    expect(sendFailure('blocked', 'fix-7')).toBe('Not sent: fix-7 is showing a prompt');
  });
});
