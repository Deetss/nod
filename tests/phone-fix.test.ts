// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionItems, type ActionContext } from '../web/phone/action-items';
import { PhoneFixDispatch, PhoneFixBot } from '../web/phone/PhoneFix';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ctx = (over: Partial<ActionContext> = {}): ActionContext => ({
  target: 'pr',
  ownPr: false,
  isAdmin: true,
  adminReady: true,
  orcaAvailable: false,
  issueOpen: true,
  assignedToViewer: false,
  writesOff: false,
  ...over,
});

const ids = (c: ActionContext) => actionItems(c).map((i) => i.id);
const row = (c: ActionContext) => actionItems(c).find((i) => i.id === 'fix-checks');

describe('phone Fix checks row', () => {
  it('is hidden with no failing checks or no fix context', () => {
    expect(ids(ctx())).not.toContain('fix-checks');
    expect(ids(ctx({ fix: { count: 0, orca: true } }))).not.toContain('fix-checks');
  });

  it('sits after Admin merge and before Dispatch with Orca', () => {
    const list = ids(ctx({ fix: { count: 2, orca: true }, orcaAvailable: true }));
    expect(list.indexOf('fix-checks')).toBe(list.indexOf('admin-merge') + 1);
    expect(list.indexOf('fix-checks')).toBe(list.indexOf('dispatch') - 1);
  });

  it('names both choices when Orca can take the PR', () => {
    expect(row(ctx({ fix: { count: 2, orca: true } }))).toMatchObject({
      label: 'Fix checks…',
      sub: '2 failing. Bot or Orca',
      opens: true,
    });
  });

  it('names Bot only when Orca is absent', () => {
    expect(row(ctx({ fix: { count: 1, orca: false } }))?.sub).toBe('1 failing. Asks Bot');
  });

  it('is disabled offline', () => {
    expect(row(ctx({ fix: { count: 2, orca: true }, writesOff: true }))?.disabled).toBe('Offline');
  });

  it('Fix conflicts… shows only for a conflicting PR, before Fix checks…', () => {
    expect(ids(ctx())).not.toContain('fix-conflicts');
    const list = ids(ctx({ conflicts: true, fix: { count: 1, orca: true } }));
    expect(list.indexOf('fix-conflicts')).toBe(list.indexOf('fix-checks') - 1);
    expect(actionItems(ctx({ conflicts: true })).find((i) => i.id === 'fix-conflicts')).toMatchObject({
      label: 'Fix conflicts…',
      opens: true,
    });
  });
});

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function mount(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

const button = (el: HTMLElement, label: string): HTMLButtonElement => {
  const b = [...el.querySelectorAll('button')].find((x) => x.textContent?.includes(label));
  if (!b) throw new Error(`no ${label} button`);
  return b;
};

describe('phone Ask Bot sheet', () => {
  const bot = (initial: string, onPost = vi.fn()) =>
    mount(
      createElement(PhoneFixBot, {
        subject: 'acme-web #42',
        count: 2,
        initial,
        busy: false,
        onPost,
        onCancel: vi.fn(),
      }),
    );

  it('titles the sheet by the failing count and posts the comment', () => {
    const onPost = vi.fn();
    const el = bot('/bot fix the failing checks on this PR:', onPost);
    expect(el.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Ask Bot to fix 2 checks?');
    act(() => button(el, 'Post comment').click());
    expect(onPost).toHaveBeenCalledWith('/bot fix the failing checks on this PR:');
  });

  it('refuses a comment that does not start with /bot', () => {
    const onPost = vi.fn();
    const el = bot('please fix', onPost);
    expect(button(el, 'Post comment').disabled).toBe(true);
    expect(el.textContent).toContain('The comment must start with /bot.');
  });
});
