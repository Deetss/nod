// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { botHeld } from '../shared/bot';
import { TEST_BOT } from './bot-settings';

const BOT_HELD = botHeld(TEST_BOT);
import { actionItems, type ActionContext } from '../web/phone/action-items';
import { PhoneActionSheet, PhoneConfirm } from '../web/phone/PhoneActionSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({
  target: 'issue',
  ownPr: false,
  isAdmin: false,
  adminReady: false,
  orcaAvailable: true,
  issueOpen: true,
  assignedToViewer: false,
  writesOff: false,
  repo: 'acme-web',
  ...over,
});

const find = (c: ActionContext, id: string) => actionItems(c).find((i) => i.id === id);

describe('issue action rows', () => {
  it('lists Edit title, Hand to Bot and New issue in order', () => {
    const ids = actionItems(ctx()).map((i) => i.id);
    expect(ids.indexOf('edit-title')).toBe(1);
    expect(ids.slice(0, 4)).toEqual(['start-work', 'edit-title', 'dispatch', 'hand-bot']);
    expect(ids.indexOf('new-issue')).toBe(ids.indexOf('comment') + 1);
  });

  it('describes the rows', () => {
    const c = ctx();
    expect(find(c, 'edit-title')?.sub).toBe('Renames the issue');
    expect(find(c, 'hand-bot')).toMatchObject({ label: 'Hand to Bot', sub: 'Adds the bot label. Asks to confirm', confirm: true });
    expect(find(c, 'new-issue')?.sub).toBe('In acme-web');
    expect(find(c, 'hand-bot')?.disabled).toBeUndefined();
  });

  it('turns Hand to Bot into a disabled With Bot row', () => {
    const row = find(ctx({ withBot: true }), 'hand-bot');
    expect(row).toMatchObject({ label: 'With Bot', disabled: BOT_HELD, dashed: true });
  });

  it('disables Hand to Bot for a closed issue and while a write runs', () => {
    expect(find(ctx({ issueOpen: false }), 'hand-bot')?.disabled).toBe('Issue is closed');
    expect(find(ctx({ busy: true }), 'hand-bot')?.disabled).toBe('Working...');
  });

  it('keeps Edit title enabled on a closed issue', () => {
    expect(find(ctx({ issueOpen: false }), 'edit-title')?.disabled).toBeUndefined();
  });

  it('turns every new row off when writes are off', () => {
    const c = ctx({ writesOff: true });
    for (const id of ['edit-title', 'hand-bot', 'new-issue']) expect(find(c, id)?.disabled).toBe('Offline');
  });

  it('offers none of the new rows on a PR', () => {
    const ids = actionItems(ctx({ target: 'pr' })).map((i) => i.id);
    for (const id of ['edit-title', 'hand-bot', 'new-issue']) expect(ids).not.toContain(id);
  });
});

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

describe('action sheet rendering', () => {
  it('shows the With Bot reason as visible text and a dashed row', () => {
    const el = render(
      createElement(PhoneActionSheet, { title: 'acme-web #42 · actions', items: actionItems(ctx({ withBot: true })), onRun: () => {}, onClose: () => {} }),
    );
    const row = el.querySelector<HTMLButtonElement>('.ph-arow.is-dashed');
    expect(row?.disabled).toBe(true);
    expect(row?.textContent).toContain('With Bot');
    expect(row?.textContent).toContain(BOT_HELD);
  });

  it('runs an enabled row on tap', () => {
    const onRun = vi.fn();
    const el = render(createElement(PhoneActionSheet, { title: 't', items: actionItems(ctx()), onRun, onClose: () => {} }));
    const row = [...el.querySelectorAll<HTMLButtonElement>('.ph-arow')].find((b) => b.textContent?.startsWith('Edit title'));
    act(() => row?.click());
    expect(onRun.mock.calls[0]?.[0].id).toBe('edit-title');
  });
});

describe('Bot confirm dialog', () => {
  it('names the issue and shows the busy state', () => {
    const onConfirm = vi.fn();
    const el = render(
      createElement(PhoneConfirm, { kind: 'bot', subject: 'acme-web #42 x', issue: { repo: 'acme-web', number: 42 }, busy: true, onConfirm, onCancel: () => {} }),
    );
    expect(el.querySelector('h2')?.textContent).toBe('Hand #42 to Bot?');
    expect(el.textContent).toContain('Adds the bot label to acme-web #42');
    const ok = el.querySelector<HTMLButtonElement>('.ph-btn.is-primary');
    expect(ok?.textContent).toContain('Handing to Bot...');
    expect(ok?.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.spinner')).not.toBeNull();
    act(() => ok?.click());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
