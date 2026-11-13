// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotTag, IssueAction, IssueComment, IssueDetail, SplitPart } from '../shared/issue-types';
import {
  SPLIT_MAX_BYTES,
  botTag,
  decodeSplit,
  proposedSplit,
  retryMarker,
  retryState,
  splitCommand,
  splitHeld,
  splitState,
} from '../shared/bot';
import { DEFAULT_SETTINGS, type BotSettings, type Settings } from '../shared/settings';
import { FixtureIssues } from '../server/issue-fixtures';
import { SPLIT_PARTS, splitMarker } from '../server/bot-fixtures';
import { issueHelpKeys } from '../web/keys';
import { setOrgSettings } from '../web/org-settings';
import { TEST_SETTINGS } from './bot-settings';
import { SplitButton } from '../web/issues/IssueDetailPane';
import { SplitDialog, SplitParts } from '../web/issues/SplitDialog';
import { useIssueHotkeys, type IssueHotkeys } from '../web/issues/useIssueHotkeys';
import { subIssueCount, useBotSplit, type BotSplit } from '../web/issues/useBotSplit';
import { actionItems, type ActionContext } from '../web/phone/action-items';

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
  root = undefined;
  vi.restoreAllMocks();
});

// The Acme values, set on purpose: these tests prove the Helper settings still reproduce today's behaviour.
const HELPER_BOT: BotSettings = {
  ...DEFAULT_SETTINGS.bot,
  enabled: true,
  name: 'Helper',
  command: '/helper',
  label: 'helper-bot',
  login: 'helper-bot',
  marker: 'helper-bot',
};
const HELPER_SETTINGS: Settings = { ...DEFAULT_SETTINGS, bot: HELPER_BOT };

beforeEach(() => setOrgSettings(HELPER_SETTINGS));

afterEach(() => setOrgSettings(TEST_SETTINGS));

const HELPER = { __typename: 'Bot', login: 'helper-bot' };
const b64 = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64');
const marker = (payload: string) => `Too broad.\n\n<!-- helper-bot:split ${payload} -->`;
const PARTS: SplitPart[] = [
  { title: 'One', acceptanceCriteria: ['a'] },
  { title: 'Two', acceptanceCriteria: [] },
];
const SPLIT: BotTag = { kind: 'split', parts: PARTS };

let n = 0;
const comment = (author: string, bot?: BotTag): IssueComment => {
  n += 1;
  return {
    id: `C${n}`,
    author,
    createdAt: new Date(Date.UTC(2026, 10, 11, 0, n)).toISOString(),
    bodyHtml: '<p>x</p>',
    ...(bot ? { bot } : {}),
  };
};

const detailOf = (comments: IssueComment[], subs = 0): IssueDetail =>
  ({
    summary: { id: 'I_1', repo: 'acme-co/acme-api', number: 7, state: 'open', ...(subs ? { subIssues: { total: subs, completed: 0 } } : {}) },
    comments,
    subIssues: [],
  }) as unknown as IssueDetail;

describe('botTag split marker', () => {
  it('tags a bot comment with the decoded parts', () => {
    const tag = botTag(HELPER, splitMarker(SPLIT_PARTS, HELPER_BOT), HELPER_BOT);
    expect(tag).toEqual({
      kind: 'split',
      parts: SPLIT_PARTS.map((p) => ({ title: p.title, acceptanceCriteria: p.acceptance_criteria })),
    });
  });

  it('ignores another bot or a person carrying the marker', () => {
    const body = splitMarker(SPLIT_PARTS, HELPER_BOT);
    expect(botTag({ __typename: 'Bot', login: 'github-actions' }, body, HELPER_BOT)).toBeUndefined();
    expect(botTag({ __typename: 'User', login: 'helper-bot' }, body, HELPER_BOT)).toBeUndefined();
  });

  it('keeps the retry tag when the retry marker is present', () => {
    expect(botTag(HELPER, `${retryMarker(HELPER_BOT)}\n${splitMarker(SPLIT_PARTS, HELPER_BOT)}`, HELPER_BOT)).toBe('retry');
  });

  it('falls back to plain and warns once for a malformed marker', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const body = marker('bm90IGpzb24x');
    expect(botTag(HELPER, body, HELPER_BOT)).toBe('plain');
    expect(botTag(HELPER, body, HELPER_BOT)).toBe('plain');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('not JSON');
  });
});

describe('decodeSplit', () => {
  it('decodes valid parts and trims titles', () => {
    expect(decodeSplit(b64([{ title: '  Part  ', acceptance_criteria: ['x', 'y'] }]))).toEqual({
      ok: true,
      parts: [{ title: 'Part', acceptanceCriteria: ['x', 'y'] }],
    });
  });

  it('defaults missing acceptance criteria to none', () => {
    expect(decodeSplit(b64([{ title: 'Only' }]))).toEqual({ ok: true, parts: [{ title: 'Only', acceptanceCriteria: [] }] });
  });

  it('refuses malformed input', () => {
    expect(decodeSplit('%%%').ok).toBe(false);
    expect(decodeSplit(b64('not json'))).toEqual({ ok: false, error: 'not JSON' });
    expect(decodeSplit(b64({ title: 'x' })).ok).toBe(false);
    expect(decodeSplit(b64([])).ok).toBe(false);
    expect(decodeSplit(b64([{ title: '   ' }])).ok).toBe(false);
    expect(decodeSplit(b64([{ title: 7 }])).ok).toBe(false);
    expect(decodeSplit(b64([{ title: 'x', acceptance_criteria: [1] }])).ok).toBe(false);
    expect(decodeSplit(Buffer.from([0xff, 0xfe, 0x5b]).toString('base64'))).toEqual({ ok: false, error: 'not base64 UTF-8' });
  });

  it('refuses a payload over 64 KB', () => {
    const big = [{ title: 'x', acceptance_criteria: ['y'.repeat(SPLIT_MAX_BYTES)] }];
    expect(decodeSplit(b64(big))).toEqual({ ok: false, error: 'over 64 KB' });
  });

  it('accepts 20 parts and refuses 21', () => {
    const parts = (k: number) => Array.from({ length: k }, (_, i) => ({ title: `P${i}`, acceptance_criteria: [] }));
    expect(decodeSplit(b64(parts(20))).ok).toBe(true);
    expect(decodeSplit(b64(parts(21)))).toEqual({ ok: false, error: 'over 20 parts' });
  });
});

describe('splitState', () => {
  it('offers Split when the bot’s newest comment proposes one', () => {
    const cs = [comment('acme-dev'), comment('helper-bot', SPLIT), comment('acme-dev')];
    expect(splitState(cs, 0, undefined)).toBe('offered');
    expect(proposedSplit(cs)).toEqual(PARTS);
  });

  it('hides Split after a newer bot comment without the marker', () => {
    expect(splitState([comment('helper-bot', SPLIT), comment('helper-bot', 'plain')], 0, undefined)).toBe('hidden');
    expect(splitState([], 0, undefined)).toBe('hidden');
  });

  it('never shows with Retry: only the newest bot comment counts', () => {
    const retryNewest = [comment('helper-bot', SPLIT), comment('helper-bot', 'retry')];
    expect([splitState(retryNewest, 0, undefined), retryState(retryNewest, undefined)]).toEqual(['hidden', 'offered']);
    const splitNewest = [comment('helper-bot', 'retry'), comment('helper-bot', SPLIT)];
    expect([splitState(splitNewest, 0, undefined), retryState(splitNewest, undefined)]).toEqual(['offered', 'hidden']);
  });

  it('holds when the issue already has sub-issues', () => {
    expect(splitState([comment('helper-bot', SPLIT)], 2, undefined)).toBe('held');
  });
});

describe('fixtures', () => {
  it('cover the split, malformed and held threads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fx = new FixtureIssues();
    const state = async (number: number) => {
      const d = await fx.detail({ repo: 'acme-co/acme-api', number }, undefined);
      return splitState(d.comments, subIssueCount(d), undefined);
    };
    const d444 = await fx.detail({ repo: 'acme-co/acme-api', number: 444 }, undefined);
    expect(proposedSplit(d444.comments)).toHaveLength(3);
    expect(await state(444)).toBe('offered');
    expect(await state(445)).toBe('hidden');
    expect(await state(446)).toBe('held');
    expect(await state(441)).toBe('hidden');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('preview', () => {
  it('renders script and HTML in a title or criterion as inert text', () => {
    const evil = '<script>window.pwned = 1</script><img src=x onerror="window.pwned = 1">';
    const el = render(createElement(SplitParts, { parts: [{ title: evil, acceptanceCriteria: [evil] }] }));
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.split-title')?.textContent).toBe(evil);
    expect(el.querySelector('details li')?.textContent).toBe(evil);
    expect((window as { pwned?: number }).pwned).toBeUndefined();
  });

  it('names the count and issue, and collapses criteria', () => {
    const onConfirm = vi.fn();
    const el = render(createElement(SplitDialog, { issue: { repo: 'acme-co/acme-api', number: 7, title: 't' }, parts: PARTS, onConfirm, onCancel: () => {} }));
    expect(el.querySelector('h2')?.textContent).toBe('Helper will open 2 issues as sub-issues of #7');
    expect(el.querySelectorAll('.split-parts > li')).toHaveLength(2);
    expect(el.querySelector('details')?.open).toBe(false);
    act(() => [...el.querySelectorAll('button')].find((b) => b.textContent === 'Split')?.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Split button', () => {
  it('shows the held line instead of the button when sub-issues exist', () => {
    const el = render(createElement(SplitButton, { state: 'held', disabled: false, onClick: () => {} }));
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).toBe(splitHeld(HELPER_BOT));
    expect(splitHeld(HELPER_BOT)).toBe("Helper won't split an issue that already has sub-issues.");
  });

  it('reads Split requested and is disabled while pending', () => {
    const el = render(createElement(SplitButton, { state: 'pending', disabled: false, onClick: () => {} }));
    expect(el.querySelector('button')?.textContent).toBe('Split requested');
    expect(el.querySelector('button')?.disabled).toBe(true);
  });
});

describe('useBotSplit', () => {
  function mount(detail: IssueDetail, post: (a: IssueAction) => Promise<boolean>, onAnswered = vi.fn()) {
    let api: BotSplit | undefined;
    function H({ d }: { d: IssueDetail }) {
      api = useBotSplit(d, 'acme-dev', post, onAnswered);
      return null;
    }
    render(createElement(H, { d: detail }));
    return {
      get: () => api!,
      onAnswered,
      rerender: (d: IssueDetail) => act(() => root?.render(createElement(H, { d }))),
    };
  }

  const offered = () => detailOf([comment('acme-dev'), comment('helper-bot', SPLIT)]);

  it('posts exactly /helper split, once per double tap', async () => {
    const post = vi.fn(async () => true);
    const h = mount(offered(), post);
    await act(async () => {
      h.get().request();
      h.get().request();
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: 'comment', repo: 'acme-co/acme-api', number: 7, body: '/helper split' });
    expect(splitCommand(HELPER_BOT)).toBe('/helper split');
  });

  it('does not post when held by existing sub-issues', async () => {
    const post = vi.fn(async () => true);
    const h = mount(detailOf([comment('helper-bot', SPLIT)], 1), post);
    expect(h.get().state).toBe('held');
    await act(async () => h.get().request());
    expect(post).not.toHaveBeenCalled();
  });

  it('stays pending until the bot comments, then refreshes sub-issues once', async () => {
    const d = offered();
    const h = mount(d, async () => true);
    await act(async () => h.get().request());
    expect(h.get().state).toBe('pending');
    expect(h.get().detail!.comments.at(-1)).toMatchObject({ author: 'acme-dev', bodyHtml: '<p>/helper split</p>' });

    const posted = comment('acme-dev');
    h.rerender(detailOf([...d.comments, posted]));
    expect(h.get().state).toBe('pending');
    expect(h.onAnswered).not.toHaveBeenCalled();

    h.rerender(detailOf([...d.comments, posted, comment('helper-bot', 'plain')], 2));
    expect(h.get().state).toBe('hidden');
    expect(h.onAnswered).toHaveBeenCalledTimes(1);

    h.rerender(detailOf([...d.comments, posted, comment('helper-bot', 'plain')], 3));
    expect(h.onAnswered).toHaveBeenCalledTimes(1);
  });

  it('rolls back on a failed post without refreshing', async () => {
    let finish: (ok: boolean) => void = () => {};
    const h = mount(offered(), () => new Promise<boolean>((r) => (finish = r)));
    act(() => h.get().request());
    expect(h.get().state).toBe('pending');
    expect(h.get().detail!.comments).toHaveLength(3);
    await act(async () => finish(false));
    expect(h.get().state).toBe('offered');
    expect(h.get().detail!.comments).toHaveLength(2);
    expect(h.onAnswered).not.toHaveBeenCalled();
  });
});

describe('phone action sheet', () => {
  const ctx = (botSplit: ActionContext['botSplit']): ActionContext => ({
    target: 'issue',
    ownPr: false,
    isAdmin: false,
    adminReady: false,
    orcaAvailable: false,
    issueOpen: true,
    assignedToViewer: false,
    writesOff: false,
    repo: 'acme-api',
    botSplit,
  });
  const row = (c: ActionContext) => actionItems(c).find((i) => i.id === 'bot-split');

  it('lists Split beside Retry’s spot, opening the preview sheet', () => {
    const items = actionItems(ctx({ state: 'offered', parts: 3 }));
    expect(items.slice(0, 2).map((i) => i.id)).toEqual(['start-work', 'bot-split']);
    expect(items[1]).toMatchObject({ label: 'Split', sub: 'Previews 3 parts, then posts /helper split', opens: true });
  });

  it('shows the held line, the pending row, or nothing', () => {
    expect(row(ctx({ state: 'held', parts: 2 }))).toMatchObject({ disabled: splitHeld(HELPER_BOT) });
    expect(row(ctx({ state: 'pending', parts: 2 }))).toMatchObject({ label: 'Split requested', disabled: 'Waiting for Helper' });
    expect(row(ctx({ state: 'hidden', parts: 0 }))).toBeUndefined();
    expect(row(ctx(undefined))).toBeUndefined();
  });
});

describe('Split key', () => {
  it('B reaches only the split handler', () => {
    const spies = new Map<string, ReturnType<typeof vi.fn>>();
    const handlers = new Proxy({} as IssueHotkeys, {
      get: (_t, p: string) => {
        if (!spies.has(p)) spies.set(p, vi.fn());
        return spies.get(p);
      },
    });
    function H() {
      useIssueHotkeys(handlers, true);
      return null;
    }
    render(createElement(H));
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', bubbles: true }));
    });
    expect([...spies.entries()].filter(([, f]) => f.mock.calls.length > 0).map(([p]) => p)).toEqual(['botSplit']);
  });

  it('is listed once in the ? help and clashes with no other key', () => {
    const keys = issueHelpKeys(HELPER_BOT).flatMap((k) => k.keys.split(/ \/ | /));
    expect(keys.filter((k) => k === 'B')).toHaveLength(1);
    expect(new Set(issueHelpKeys(HELPER_BOT).map((k) => k.keys)).size).toBe(issueHelpKeys(HELPER_BOT).length);
    expect(issueHelpKeys(HELPER_BOT).find((k) => k.keys === 'B')?.label).toBe('split as Helper proposes');
  });
});
