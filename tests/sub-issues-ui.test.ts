// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IssueAction, IssueDetail, SubIssue } from '../shared/issue-types';
import { FOOTER_ISSUES_WIDE, FOOTER_SUB_ISSUE_ROW, issueHelpKeys } from '../web/keys';
import { TEST_BOT } from './bot-settings';
import { addRows } from '../web/issues/SubIssueDialogs';
import { SubIssuesCard, type SubIssuesCardProps } from '../web/issues/SubIssuesCard';
import { useIssueHotkeys, type IssueHotkeys } from '../web/issues/useIssueHotkeys';
import { useSubIssues, type SubIssuesApi } from '../web/issues/useSubIssues';

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

const sub = (n: number, state: SubIssue['state'] = 'open', repo = 'acme-banner'): SubIssue => ({
  id: `I_${n}`,
  repo,
  number: n,
  title: `Child ${n}`,
  state,
  url: `https://github.com/o/${repo}/issues/${n}`,
});

const ROWS = [sub(14, 'completed'), sub(17), sub(15, 'completed'), sub(421, 'open', 'acme-api'), sub(10, 'not-planned')];

const detail = (subIssues: SubIssue[]): IssueDetail =>
  ({
    summary: { id: 'I_12', repo: 'acme-banner', number: 12, title: 'Parent', state: 'open' },
    subIssues,
  }) as unknown as IssueDetail;

function hookHarness(write: (a: IssueAction) => Promise<{ ok: true; message: string }>, fail = vi.fn(), refresh = vi.fn()) {
  const out: { api?: SubIssuesApi } = {};
  const d = detail(ROWS);
  function H() {
    out.api = useSubIssues({ detail: d, write, refresh, fail });
    return null;
  }
  render(createElement(H));
  return { out, fail, refresh };
}

describe('useSubIssues', () => {
  it('moves at once and sends the anchor GitHub needs', async () => {
    const write = vi.fn(async () => ({ ok: true as const, message: 'ok' }));
    const { out, refresh } = hookHarness(write);
    await act(async () => {
      await out.api?.move('I_15', 'up');
    });
    expect(write).toHaveBeenCalledWith({ type: 'sub-move', repo: 'acme-banner', number: 12, childId: 'I_15', afterId: 'I_14' });
    expect(out.api?.rows.map((r) => r.number)).toEqual([14, 15, 17, 421, 10]);
    expect(refresh).toHaveBeenCalled();
  });

  it('sends beforeId for the top and afterId for the bottom', async () => {
    const write = vi.fn(async () => ({ ok: true as const, message: 'ok' }));
    const { out } = hookHarness(write);
    await act(async () => {
      await out.api?.move('I_421', 'top');
    });
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ childId: 'I_421', beforeId: 'I_14' }));
    await act(async () => {
      await out.api?.move('I_17', 4);
    });
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ childId: 'I_17', afterId: 'I_10' }));
  });

  it('restores the order and raises the spec toast when the write fails', async () => {
    const write = vi.fn(async () => {
      throw new Error('boom');
    });
    const { out, fail, refresh } = hookHarness(write);
    await act(async () => {
      await out.api?.move('I_15', 'up');
    });
    expect(out.api?.rows.map((r) => r.number)).toEqual([14, 17, 15, 421, 10]);
    expect(fail).toHaveBeenCalledWith('Could not move #15: order restored. Try again.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('remove only sends sub-remove', async () => {
    const write = vi.fn(async (_a: IssueAction) => ({ ok: true as const, message: 'ok' }));
    const { out } = hookHarness(write);
    await act(async () => {
      await out.api?.remove('I_15');
    });
    expect(write.mock.calls.map(([a]) => a.type)).toEqual(['sub-remove']);
    expect(out.api?.rows.map((r) => r.number)).toEqual([14, 17, 421, 10]);
  });

  it('runs one write at a time', async () => {
    let finish: () => void = () => undefined;
    const write = vi.fn(() => new Promise<{ ok: true; message: string }>((res) => (finish = () => res({ ok: true, message: 'ok' }))));
    const { out } = hookHarness(write);
    let first: Promise<boolean> | undefined;
    let second: boolean | undefined;
    await act(async () => {
      first = out.api?.move('I_15', 'up');
      second = await out.api?.remove('I_17');
    });
    expect(second).toBe(false);
    await act(async () => {
      finish();
      await first;
    });
    expect(write).toHaveBeenCalledTimes(1);
  });
});

function card(over: Partial<SubIssuesCardProps> = {}) {
  const props: SubIssuesCardProps = {
    parent: { repo: 'acme-banner', number: 12 },
    rows: ROWS,
    busyId: undefined,
    disabled: false,
    onOpen: vi.fn(),
    onMove: vi.fn(),
    onRemove: vi.fn(),
    onCreate: vi.fn(),
    onAdd: vi.fn(),
    onRowFocus: vi.fn(),
    ...over,
  };
  const el = render(createElement(SubIssuesCard, props));
  return { el, props };
}

const rowAt = (el: HTMLElement, i: number) => el.querySelectorAll<HTMLElement>('li.sub-row')[i]!;
const key = (target: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  });

describe('sub-issues card', () => {
  it('shows progress, refs, glyph states and the count', () => {
    const { el } = card();
    expect(el.querySelector('.sub-done')?.textContent).toBe('3 of 5 done');
    expect([...el.querySelectorAll('.sub-ref')].map((x) => x.textContent)).toEqual(['#14', '#17', '#15', 'acme-api #421', '#10']);
    expect(el.querySelector('.sub-glyph-not-planned')?.getAttribute('aria-label')).toBe('Closed as not planned');
    expect(el.querySelector('.sub-count')?.textContent).toBe('5 of 100');
    expect(el.querySelector('.icard-hint')?.textContent).toContain('reorder');
  });

  it('keeps the card with both buttons when there are no sub-issues', () => {
    const { el } = card({ rows: [] });
    expect(el.querySelector('.sub-done')?.textContent).toBe('none');
    expect(el.textContent).toContain('No sub-issues yet. Break this issue into smaller ones, in this repo or another.');
    expect([...el.querySelectorAll('.sub-foot .btn')].map((b) => b.textContent)).toEqual(['Create sub-issueN', 'Add existingE']);
    expect(el.querySelector('.icard-hint')).toBeNull();
  });

  it('turns both buttons off at the GitHub limit', () => {
    const many = Array.from({ length: 100 }, (_, i) => sub(i + 1));
    const { el } = card({ rows: many });
    expect([...el.querySelectorAll<HTMLButtonElement>('.sub-foot .btn')].every((b) => b.disabled)).toBe(true);
    expect(el.querySelector('.sub-count')?.textContent).toBe('100 of 100, the GitHub limit');
  });

  it('Alt+Up and Alt+Down move the focused row', () => {
    const { el, props } = card();
    key(rowAt(el, 2), 'ArrowUp', { altKey: true });
    key(rowAt(el, 2), 'ArrowDown', { altKey: true });
    expect(props.onMove).toHaveBeenNthCalledWith(1, 'I_15', 'up');
    expect(props.onMove).toHaveBeenNthCalledWith(2, 'I_15', 'down');
  });

  it('Del asks to remove and names the row to focus next', () => {
    const { el, props } = card();
    key(rowAt(el, 2), 'Delete');
    key(rowAt(el, 4), 'Delete');
    expect(props.onRemove).toHaveBeenNthCalledWith(1, ROWS[2], 'I_421');
    expect(props.onRemove).toHaveBeenNthCalledWith(2, ROWS[4], 'I_421');
  });

  it('Enter opens the row and does not reach the window keys', () => {
    const { el, props } = card();
    const windowKey = vi.fn();
    window.addEventListener('keydown', windowKey);
    key(rowAt(el, 1), 'Enter');
    window.removeEventListener('keydown', windowKey);
    expect(props.onOpen).toHaveBeenCalledWith(ROWS[1]);
    expect(windowKey).not.toHaveBeenCalled();
  });

  it('is one tab stop with roving focus', () => {
    const { el } = card();
    expect([...el.querySelectorAll('li.sub-row')].map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1']);
    act(() => rowAt(el, 0).focus());
    key(rowAt(el, 0), 'ArrowDown');
    expect(document.activeElement).toBe(rowAt(el, 1));
    expect(rowAt(el, 1).getAttribute('tabindex')).toBe('0');
  });

  it('Shift+F10 opens the row menu with the first row moves inert', () => {
    const { el, props } = card();
    key(rowAt(el, 0), 'F10', { shiftKey: true });
    const menu = document.querySelector<HTMLElement>('.sub-menu')!;
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((i) => i.textContent)).toEqual([
      'Open #14Enter',
      'Move upAlt+↑',
      'Move downAlt+↓',
      'Move to top',
      'Move to bottom',
      'Remove from #12Del',
    ]);
    expect(items.filter((i) => i.getAttribute('aria-disabled') === 'true').map((i) => i.textContent)).toEqual(['Move upAlt+↑', 'Move to top']);
    act(() => items[4]!.click());
    expect(props.onMove).toHaveBeenCalledWith('I_14', 'bottom');
  });

  it('reports row focus so the footer can swap', () => {
    const { el, props } = card();
    act(() => rowAt(el, 0).focus());
    expect(props.onRowFocus).toHaveBeenLastCalledWith(true);
    act(() => rowAt(el, 0).blur());
    expect(props.onRowFocus).toHaveBeenLastCalledWith(false);
  });
});

describe('sub-issue keys', () => {
  function hotkeys() {
    const spies = new Map<string, ReturnType<typeof vi.fn>>();
    const handlers = new Proxy({} as IssueHotkeys, {
      get: (_t, k: string) => {
        if (!spies.has(k)) spies.set(k, vi.fn());
        return spies.get(k);
      },
    });
    function H() {
      useIssueHotkeys(handlers, true);
      useEffect(() => undefined, []);
      return null;
    }
    render(createElement(H));
    const press = (k: string) => key(document.body, k);
    const called = () => [...spies.entries()].filter(([, f]) => f.mock.calls.length > 0).map(([k]) => k);
    return { press, called, spies };
  }

  it('N, E and u reach only their own handlers', () => {
    for (const [k, name] of [['N', 'newSubIssue'], ['E', 'addSubIssue'], ['u', 'goParent']] as const) {
      const h = hotkeys();
      h.press(k);
      expect(h.called()).toEqual([name]);
      act(() => root?.unmount());
    }
  });

  it('leaves the keys they sit beside unchanged', () => {
    for (const [k, name] of [['n', 'newIssue'], ['s', 'status'], ['S', 'toggleWork'], ['e', 'editTitle']] as const) {
      const h = hotkeys();
      h.press(k);
      expect(h.called()).toEqual([name]);
      act(() => root?.unmount());
    }
  });

  it('g then p still goes to PRs', () => {
    const h = hotkeys();
    h.press('g');
    h.press('p');
    expect(h.called()).toEqual(['goPrs']);
  });

  it('help lists every key once, with the new ones', () => {
    const keys = issueHelpKeys(TEST_BOT).map((k) => k.keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ['N', 'E', 'u', 'Alt+↑ / ↓', 'Del']) expect(keys).toContain(k);
    const footer = FOOTER_ISSUES_WIDE.map((k) => k.keys);
    expect(footer.indexOf('N')).toBe(footer.indexOf('n') + 1);
    expect(FOOTER_SUB_ISSUE_ROW.map((k) => k.keys)).toEqual(['↑↓', 'Enter', 'Alt+↑ Alt+↓', 'Del', 'Shift+F10', 'E', 'Esc']);
  });
});

describe('add existing rows', () => {
  const issue = (repo: string, number: number, title: string, parent?: { repo: string; number: number }) =>
    ({ id: `I_${repo}_${number}`, repo, number, title, ...(parent ? { parent } : {}) }) as never;
  const list = [
    issue('acme-banner', 19, 'Banner export filename uses the unit number'),
    issue('acme-web', 288, 'CSV export drops elevation column', { repo: 'acme-web', number: 250 }),
    issue('acme-banner', 17, 'Banner export times out', { repo: 'acme-banner', number: 12 }),
    issue('acme-banner', 12, 'Rebuild the banner export pipeline'),
  ];

  it('says no parent, moves it here, or already a sub-issue, and leaves out the parent itself', () => {
    const rows = addRows(list, { repo: 'acme-banner', number: 12 }, 'export');
    expect(rows.map((r) => [r.number, r.note, r.tone, r.moves])).toEqual([
      [19, 'No parent', 'plain', false],
      [288, 'Has parent acme-web #250. Adding moves it here.', 'attention', true],
      [17, 'Already a sub-issue of #12', 'inert', false],
    ]);
  });

  it('matches a number query and adds lookup hits that are not listed', () => {
    const rows = addRows(list, { repo: 'acme-banner', number: 12 }, 'acme-api#433', [
      { repo: 'acme-api', number: 433, title: 'Export job retries forever' },
    ]);
    expect(rows.map((r) => [r.repo, r.number, r.note])).toEqual([['acme-api', 433, 'Found on GitHub']]);
  });
});
