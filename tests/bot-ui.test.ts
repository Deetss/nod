// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { botHeld } from '../shared/bot';
import { issueHelpKeys } from '../web/keys';
import { BotDialog } from '../web/issues/IssueDialogs';
import { ActionsPanel } from '../web/issues/IssueSidebar';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { setOrgSettings } from '../web/org-settings';
import { TEST_BOT, TEST_SETTINGS } from './bot-settings';

const BOT_HELD = botHeld(TEST_BOT);
const ISSUE_HELP_KEYS = issueHelpKeys(TEST_BOT);
import { useIssueHotkeys, type IssueHotkeys } from '../web/issues/useIssueHotkeys';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
const panel = (bot: { held: boolean; onClick: () => void }) =>
  createElement(ActionsPanel, {
    disabled: false,
    closed: false,
    onComment: noop,
    onEditTitle: noop,
    onClose: noop,
    onReopen: noop,
    onNew: noop,
    bot,
  });

const buttons = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('button')];
const byText = (el: HTMLElement, text: string) => buttons(el).find((b) => b.textContent?.startsWith(text));

describe('Hand to Bot button', () => {
  it('is enabled and runs the handler when the issue lacks the bot label', () => {
    const onClick = vi.fn();
    const el = render(panel({ held: false, onClick }));
    const btn = byText(el, 'Hand to Bot');
    expect(btn?.disabled).toBe(false);
    act(() => btn?.click());
    expect(onClick).toHaveBeenCalled();
  });

  it('reads With Bot, is disabled and carries its tooltip when the label is set', () => {
    const el = render(panel({ held: true, onClick: noop }));
    const btn = byText(el, 'With Bot');
    expect(btn?.disabled).toBe(true);
    expect(btn?.title).toBe(BOT_HELD);
    const described = btn?.getAttribute('aria-describedby');
    expect(described && el.querySelector(`#${described}`)?.textContent).toBe(BOT_HELD);
    expect(byText(el, 'Hand to Bot')).toBeUndefined();
  });
});

describe('BotDialog', () => {
  const issue = { repo: 'acme-web', number: 42, title: 'Checkout page flickers on resize' };

  it('uses the spec copy', () => {
    const el = render(createElement(BotDialog, { issue, busy: false, onConfirm: noop, onCancel: noop }));
    expect(el.querySelector('h2')?.textContent).toBe('Hand #42 to Bot?');
    expect(el.textContent).toContain('Adds the bot label to acme-web #42');
  });

  it('shows the busy state, disables Cancel and ignores Escape', () => {
    const onCancel = vi.fn();
    const el = render(createElement(BotDialog, { issue, busy: true, onConfirm: noop, onCancel }));
    const primary = el.querySelector<HTMLButtonElement>('.btn-primary');
    expect(primary?.textContent).toBe('Handing to Bot...');
    expect(primary?.getAttribute('aria-busy')).toBe('true');
    expect(primary?.getAttribute('aria-disabled')).toBe('true');
    expect(primary?.querySelector('.spinner')).not.toBeNull();
    expect(byText(el, 'Cancel')?.disabled).toBe(true);
    act(() => {
      el.querySelector('.dialog')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).not.toHaveBeenCalled();
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Handing acme-web #42 to Bot');
  });

  it('confirms on Enter and cancels on Escape', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const el = render(createElement(BotDialog, { issue, busy: false, onConfirm, onCancel }));
    const dialog = el.querySelector('.dialog');
    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('L shortcut', () => {
  function hotkeys(bot: () => void, labels: () => void): void {
    const noopKeys = new Proxy({ bot, labels } as unknown as IssueHotkeys, {
      get: (t, k: keyof IssueHotkeys) => t[k] ?? noop,
    });
    render(
      createElement(function Host() {
        useIssueHotkeys(noopKeys, true);
        return createElement('input', { id: 'box', type: 'text' });
      }),
    );
  }

  const press = (target: EventTarget, init: KeyboardEventInit) =>
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
    });

  it('Shift+l hands to Bot and lowercase l stays labels', () => {
    const bot = vi.fn();
    const labels = vi.fn();
    hotkeys(bot, labels);
    press(document.body, { key: 'L', shiftKey: true });
    expect(bot).toHaveBeenCalledTimes(1);
    press(document.body, { key: 'l' });
    expect(labels).toHaveBeenCalledTimes(1);
    expect(bot).toHaveBeenCalledTimes(1);
  });

  it('does nothing while typing in a text box', () => {
    const bot = vi.fn();
    hotkeys(bot, noop);
    const box = document.getElementById('box');
    if (!box) throw new Error('no box');
    press(box, { key: 'L', shiftKey: true });
    expect(bot).not.toHaveBeenCalled();
  });

  it('is listed in the help sheet after D', () => {
    const keys = ISSUE_HELP_KEYS.map((k) => k.keys);
    expect(keys[keys.indexOf('D') + 1]).toBe('L');
    expect(ISSUE_HELP_KEYS.find((k) => k.keys === 'L')?.label).toBe('hand to Bot');
  });
});

describe('bot settings', () => {
  afterEach(() => setOrgSettings(TEST_SETTINGS));

  it('names the configured bot and its label', () => {
    setOrgSettings({ ...TEST_SETTINGS, bot: { ...TEST_BOT, name: 'Fixer', label: 'fixer' } });
    const el = render(panel({ held: true, onClick: noop }));
    expect(byText(el, 'With Fixer')).toBeDefined();
    expect(el.textContent).toContain('Fixer already has this issue. The fixer label is set.');
  });

  it('hides Hand to and the L key when no bot is configured', () => {
    setOrgSettings(DEFAULT_SETTINGS);
    const el = render(panel({ held: false, onClick: noop }));
    expect(byText(el, 'Hand to')).toBeUndefined();
    expect(issueHelpKeys(DEFAULT_SETTINGS.bot).some((k) => k.keys === 'L')).toBe(false);
  });
});
