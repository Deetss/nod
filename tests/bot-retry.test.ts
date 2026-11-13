// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotTag, IssueAction, IssueComment, IssueDetail } from '../shared/issue-types';
import { botTag, retryCommand, retryMarker, retryState } from '../shared/bot';
import { DEFAULT_SETTINGS, type BotSettings, type Settings } from '../shared/settings';
import { FixtureIssues } from '../server/issue-fixtures';
import { toIssueDetail, type RawIssueDetail } from '../server/issue-map';
import { issueHelpKeys } from '../web/keys';
import { setOrgSettings } from '../web/org-settings';
import { TEST_SETTINGS } from './bot-settings';
import { useIssueHotkeys, type IssueHotkeys } from '../web/issues/useIssueHotkeys';
import { useBotRetry, type BotRetry } from '../web/issues/useBotRetry';
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

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  setOrgSettings(TEST_SETTINGS);
});

const HELPER = { __typename: 'Bot', login: 'helper-bot' };
const FAILED = `Helper could not size this issue.\n\n${retryMarker(HELPER_BOT)}`;

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

const detailOf = (comments: IssueComment[]): IssueDetail =>
  ({ summary: { id: 'I_1', repo: 'acme-api', number: 7, state: 'open' }, comments }) as unknown as IssueDetail;

describe('botTag retry marker', () => {
  it('tags the bot with and without the marker', () => {
    expect(botTag(HELPER, FAILED, HELPER_BOT)).toBe('retry');
    expect(botTag(HELPER, 'Helper estimates this at 10 files.', HELPER_BOT)).toBe('plain');
  });

  it('accepts the REST login with its [bot] suffix', () => {
    expect(botTag({ __typename: 'Bot', login: 'helper-bot[bot]' }, FAILED, HELPER_BOT)).toBe('retry');
  });

  it('ignores another bot carrying the marker, and a user named like the bot', () => {
    expect(botTag({ __typename: 'Bot', login: 'github-actions' }, FAILED, HELPER_BOT)).toBeUndefined();
    expect(botTag({ __typename: 'User', login: 'helper-bot' }, FAILED, HELPER_BOT)).toBeUndefined();
    expect(botTag({ __typename: 'User', login: 'acme-dev' }, FAILED, HELPER_BOT)).toBeUndefined();
    expect(botTag(null, FAILED, HELPER_BOT)).toBeUndefined();
  });

  it('treats no one as the bot when bot.login is empty', () => {
    expect(botTag(HELPER, FAILED, DEFAULT_SETTINGS.bot)).toBeUndefined();
  });

  it('reads the marker from the Markdown body, which bodyHTML drops', () => {
    const node = (id: string, author: object, body: string) => ({ id, author, body, bodyHTML: '<p>x</p>', createdAt: '2026-11-11T00:00:00Z' });
    const raw = {
      comments: {
        nodes: [
          node('a', HELPER, FAILED),
          node('b', { __typename: 'Bot', login: 'github-actions' }, FAILED),
          node('c', { __typename: 'User', login: 'acme-dev' }, 'ok'),
        ],
      },
      timelineItems: { nodes: [] },
      closedByPullRequestsReferences: { nodes: [] },
      participants: { nodes: [] },
      assignees: { nodes: [] },
      labels: { nodes: [] },
      commentCount: { totalCount: 3 },
      milestone: null,
      repository: { name: 'acme-api' },
      author: { login: 'acme-dev' },
      id: 'x',
      number: 7,
      title: 't',
      url: 'u',
      state: 'OPEN',
      createdAt: '2026-11-11T00:00:00Z',
      updatedAt: '2026-11-11T00:00:00Z',
      bodyHTML: '',
    } as unknown as RawIssueDetail;
    expect(toIssueDetail(raw, HELPER_SETTINGS).comments.map((c) => c.bot)).toEqual(['retry', undefined, undefined]);
  });
});

describe('retryState', () => {
  it('offers Retry when the bot’s newest comment has the marker', () => {
    expect(retryState([comment('acme-dev'), comment('helper-bot', 'retry')], undefined)).toBe('offered');
  });

  it('hides Retry when the bot’s newest comment lacks the marker', () => {
    expect(retryState([comment('helper-bot', 'plain')], undefined)).toBe('hidden');
    expect(retryState([comment('acme-dev')], undefined)).toBe('hidden');
    expect(retryState([], undefined)).toBe('hidden');
  });

  it('keeps Retry after a later human comment', () => {
    expect(retryState([comment('helper-bot', 'retry'), comment('build-bot'), comment('acme-dev')], undefined)).toBe('offered');
  });

  it('hides Retry after a later bot comment without the marker', () => {
    expect(retryState([comment('helper-bot', 'retry'), comment('helper-bot', 'plain')], undefined)).toBe('hidden');
  });

  it('does not count another bot’s comment that carries the marker', () => {
    // botTag leaves another bot untagged, so its marker never reaches retryState.
    const other = { ...comment('github-actions'), bot: botTag({ __typename: 'Bot', login: 'github-actions' }, FAILED, HELPER_BOT) };
    expect(retryState([comment('helper-bot', 'plain'), other], undefined)).toBe('hidden');
  });
});

describe('fixtures', () => {
  it('cover the three bot threads', async () => {
    const fx = new FixtureIssues();
    const state = async (number: number) => retryState((await fx.detail({ repo: 'acme-co/acme-api', number }, undefined)).comments, undefined);
    expect(await state(441)).toBe('offered');
    expect(await state(442)).toBe('hidden');
    expect(await state(443)).toBe('offered');
  });
});

describe('useBotRetry', () => {
  function mount(detail: IssueDetail, post: (a: IssueAction) => Promise<boolean>) {
    let api: BotRetry | undefined;
    function H({ d }: { d: IssueDetail }) {
      api = useBotRetry(d, 'acme-dev', post);
      return null;
    }
    render(createElement(H, { d: detail }));
    return {
      get: () => api!,
      rerender: (d: IssueDetail) => act(() => root?.render(createElement(H, { d }))),
    };
  }

  const offered = () => detailOf([comment('acme-dev'), comment('helper-bot', 'retry')]);

  it('posts exactly /helper retry as a comment, once per double tap', async () => {
    const post = vi.fn(async () => true);
    const d = offered();
    const h = mount(d, post);
    await act(async () => {
      h.get().request();
      h.get().request();
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: 'comment', repo: 'acme-api', number: 7, body: '/helper retry' });
    expect(retryCommand(HELPER_BOT)).toBe('/helper retry');
  });

  it('goes pending with the comment in the thread, until the bot comments again', async () => {
    const d = offered();
    const h = mount(d, async () => true);
    await act(async () => h.get().request());
    expect(h.get().state).toBe('pending');
    const shown = h.get().detail!.comments;
    expect(shown).toHaveLength(3);
    expect(shown[2]).toMatchObject({ author: 'acme-dev', bodyHtml: '<p>/helper retry</p>' });

    // The reload brings the real comment: no duplicate, still pending.
    const posted = comment('acme-dev');
    h.rerender(detailOf([...d.comments, posted]));
    expect(h.get().state).toBe('pending');
    expect(h.get().detail!.comments.map((c) => c.id)).toEqual([...d.comments.map((c) => c.id), posted.id]);

    // The bot answers without the marker: pending ends and Retry hides.
    h.rerender(detailOf([...d.comments, posted, comment('helper-bot', 'plain')]));
    expect(h.get().state).toBe('hidden');
  });

  it('offers Retry again when the bot fails again with the marker', async () => {
    const d = offered();
    const h = mount(d, async () => true);
    await act(async () => h.get().request());
    h.rerender(detailOf([...d.comments, comment('acme-dev'), comment('helper-bot', 'retry')]));
    expect(h.get().state).toBe('offered');
  });

  it('rolls back when the post fails', async () => {
    let fail: (ok: boolean) => void = () => {};
    const d = offered();
    const h = mount(d, () => new Promise<boolean>((r) => (fail = r)));
    act(() => h.get().request());
    expect(h.get().state).toBe('pending');
    expect(h.get().detail!.comments).toHaveLength(3);
    await act(async () => fail(false));
    expect(h.get().state).toBe('offered');
    expect(h.get().detail!.comments).toHaveLength(2);
  });

  it('does nothing when Retry is hidden', async () => {
    const post = vi.fn(async () => true);
    const h = mount(detailOf([comment('helper-bot', 'plain')]), post);
    await act(async () => h.get().request());
    expect(post).not.toHaveBeenCalled();
  });
});

describe('phone action sheet', () => {
  const ctx = (over: Partial<ActionContext>): ActionContext => ({
    target: 'issue',
    ownPr: false,
    isAdmin: false,
    adminReady: false,
    orcaAvailable: false,
    issueOpen: true,
    assignedToViewer: false,
    writesOff: false,
    repo: 'acme-api',
    ...over,
  });
  const ids = (c: ActionContext) => actionItems(c).map((i) => i.id);

  it('lists Retry Helper right after Start work when offered', () => {
    const items = actionItems(ctx({ botRetry: 'offered' }));
    expect(items.slice(0, 2).map((i) => i.id)).toEqual(['start-work', 'bot-retry']);
    expect(items[1]).toMatchObject({ label: 'Retry Helper', sub: 'Posts /helper retry. Helper reruns from the start' });
    expect(items[1]?.disabled).toBeUndefined();
    expect(items[1]?.confirm).toBeUndefined();
  });

  it('leaves the row out when hidden', () => {
    expect(ids(ctx({ botRetry: 'hidden' }))).not.toContain('bot-retry');
    expect(ids(ctx({}))).not.toContain('bot-retry');
  });

  it('shows a disabled Retry requested while pending', () => {
    expect(actionItems(ctx({ botRetry: 'pending' })).find((i) => i.id === 'bot-retry')).toMatchObject({
      label: 'Retry requested',
      disabled: 'Waiting for Helper',
    });
  });

  it('is off while offline', () => {
    expect(actionItems(ctx({ botRetry: 'offered', writesOff: true })).find((i) => i.id === 'bot-retry')?.disabled).toBe('Offline');
  });
});

describe('Retry key', () => {
  it('T reaches only the bot retry handler, and L and S keep theirs', () => {
    for (const [k, name] of [['T', 'botRetry'], ['L', 'bot'], ['S', 'toggleWork']] as const) {
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
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      });
      expect([...spies.entries()].filter(([, f]) => f.mock.calls.length > 0).map(([p]) => p)).toEqual([name]);
      act(() => root?.unmount());
      host?.remove();
    }
  });

  it('is listed once in the ? help and clashes with no other key', () => {
    const keys = issueHelpKeys(HELPER_BOT).flatMap((k) => k.keys.split(' / '));
    expect(keys.filter((k) => k === 'T')).toHaveLength(1);
    expect(issueHelpKeys(HELPER_BOT).find((k) => k.keys === 'T')?.label).toBe('ask Helper to retry');
  });
});
