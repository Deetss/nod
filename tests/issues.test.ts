// @vitest-environment node
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { runBulk } from '../shared/bulk';
import { deriveIssueSections } from '../shared/issue-sections';
import type { IssueInboxData, IssueSummary } from '../shared/issue-types';
import { chipColors, contrast } from '../shared/label-chip';
import { computeNotifications, DEFAULT_SETTINGS } from '../shared/notify-rules';
import { DEFAULT_SETTINGS as APP_DEFAULT_SETTINGS, type BotSettings } from '../shared/settings';
import type { InboxData } from '../shared/types';
import { toTimeline, type RawTimelineItem } from '../server/issue-map';
import { applyIssuesDelta, applyIssuesFull, EMPTY_ISSUE_STATE } from '../server/issue-state';
import { SeenStore } from '../server/seen';
import { createSanitizer } from '../web/sanitize';
import { clampWidth, fitWidths } from '../web/pane-widths';

function issue(over: Partial<IssueSummary> & { id: string }): IssueSummary {
  return {
    repo: 'acme-api',
    number: 1,
    title: 't',
    author: 'build-bot',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    url: 'u',
    state: 'open',
    labels: [{ name: 'bug', color: 'd73a4a' }],
    assignees: ['build-bot'],
    commentCount: 0,
    seen: 'seen',
    ...over,
  };
}

describe('deriveIssueSections', () => {
  const issues = [
    issue({ id: 'a', assignees: ['me'], updatedAt: '2026-11-06T11:00:00Z' }),
    issue({ id: 'b', author: 'me', assignees: [], updatedAt: '2026-11-06T12:00:00Z' }),
    issue({ id: 'c', labels: [], assignees: [], updatedAt: '2026-11-06T09:00:00Z' }),
    issue({ id: 'd', labels: [], assignees: ['build-bot'] }),
    issue({ id: 'e', labels: [{ name: 'bug', color: 'x' }], assignees: [] }),
  ];
  const sections = deriveIssueSections('me', issues, ['e']);
  const ids = (key: string) => sections.find((s) => s.key === key)?.issues.map((i) => i.id);

  it('puts assigned, created and mentioned issues in their sections', () => {
    expect(ids('assigned')).toEqual(['a']);
    expect(ids('created')).toEqual(['b']);
    expect(ids('mentioned')).toEqual(['e']);
  });

  it('places an issue in the first fitting group only, so the group counts add up', () => {
    const both = deriveIssueSections('me', [issue({ id: 'x', author: 'me', assignees: ['me'] })], ['x']);
    expect(both.map((s) => s.count)).toEqual([0, 1, 0, 0, 0, 1]);
  });

  it('lists In progress first: status In progress and assigned to the viewer', () => {
    const mine = issue({ id: 'p', author: 'me', assignees: ['me'], status: 'In progress' });
    const theirs = issue({ id: 'q', assignees: ['other'], status: 'In progress' });
    const ready = issue({ id: 'r', assignees: ['me'], status: 'Ready' });
    const s = deriveIssueSections('me', [mine, theirs, ready]);
    expect(s[0]?.key).toBe('progress');
    expect(s[0]?.title).toBe('In progress');
    expect(s[0]?.issues.map((i) => i.id)).toEqual(['p']);
    // p is claimed by In progress, so Assigned and Created skip it.
    expect(s.find((x) => x.key === 'assigned')?.issues.map((i) => i.id)).toEqual(['r']);
    expect(s.find((x) => x.key === 'created')?.count).toBe(0);
    expect(s.find((x) => x.key === 'all')?.count).toBe(3);
  });

  it('counts an issue as untriaged only with no labels and no assignees', () => {
    expect(ids('untriaged')).toEqual(['c']);
  });

  it('lists every issue under All open, newest update first', () => {
    expect(ids('all')).toEqual(['b', 'a', 'd', 'e', 'c']);
    expect(sections.find((s) => s.key === 'all')?.count).toBe(5);
  });

  describe('With bot section', () => {
    const bot: BotSettings = { ...APP_DEFAULT_SETTINGS.bot, enabled: true, name: 'Helper', label: 'helper-bot' };
    const botIssues = [
      issue({ id: 'p', author: 'me', assignees: ['me'], status: 'In progress', labels: [{ name: 'helper-bot', color: 'x' }] }),
      issue({ id: 'b1', author: 'me', assignees: ['me'], labels: [{ name: 'Helper-Bot', color: 'x' }], updatedAt: '2026-11-06T13:00:00Z' }),
      issue({ id: 'a1', assignees: ['me'], labels: [{ name: 'helper-bot', color: 'x' }], updatedAt: '2026-11-06T12:00:00Z' }),
      issue({ id: 'c1', author: 'me', labels: [{ name: 'helper-bot', color: 'x' }], assignees: [], updatedAt: '2026-11-06T11:00:00Z' }),
      issue({ id: 'x1', author: 'me', labels: [{ name: 'helper-bot', color: 'x' }], assignees: [], state: 'closed', updatedAt: '2026-11-06T10:00:00Z' }),
      issue({ id: 'o1', author: 'me', assignees: [], labels: [{ name: 'bug', color: 'x' }], updatedAt: '2026-11-06T09:00:00Z' }),
    ];
    const withBot = deriveIssueSections('me', botIssues, [], APP_DEFAULT_SETTINGS.project.options.inProgress, bot);
    const keys = withBot.map((s) => s.key);
    const at = (key: string) => withBot.find((s) => s.key === key);

    it('sits between In progress and Assigned, with the bot name in the title', () => {
      expect(keys).toEqual(['progress', 'bot', 'assigned', 'created', 'mentioned', 'untriaged', 'all']);
      expect(at('bot')?.title).toBe('With Helper');
    });

    it('is absent when the bot is disabled or has no label', () => {
      const off = deriveIssueSections('me', botIssues, [], undefined, { ...bot, enabled: false });
      const noLabel = deriveIssueSections('me', botIssues, [], undefined, { ...bot, label: '' });
      expect(off.map((s) => s.key)).toEqual(['progress', 'assigned', 'created', 'mentioned', 'untriaged', 'all']);
      expect(noLabel.map((s) => s.key)).toEqual(off.map((s) => s.key));
      expect(off.map((s) => s.count)).toEqual(
        deriveIssueSections('me', botIssues, [], undefined, APP_DEFAULT_SETTINGS.bot).map((s) => s.count),
      );
    });

    it('takes open bot-labelled issues, newest first, ahead of Assigned and Created', () => {
      expect(at('bot')?.issues.map((i) => i.id)).toEqual(['b1', 'a1', 'c1']);
      expect(at('bot')?.count).toBe(3);
    });

    it('keeps an issue the viewer is working on in In progress, not With bot', () => {
      expect(at('progress')?.issues.map((i) => i.id)).toEqual(['p']);
      expect(at('bot')?.issues.map((i) => i.id)).not.toContain('p');
    });

    it('leaves a bot-labelled issue the viewer created out of Created by me', () => {
      // b1 is bot-labelled and created by the viewer, so it sits in With bot. The closed x1 is not
      // open, so With bot skips it and it falls to Created by me.
      expect(at('created')?.issues.map((i) => i.id)).toEqual(['x1', 'o1']);
      expect(at('bot')?.issues.map((i) => i.id)).toContain('b1');
    });

    it('keeps the counts adding up across the non-All sections', () => {
      const total = withBot.filter((s) => s.key !== 'all').reduce((n, s) => n + s.count, 0);
      expect(total).toBe(botIssues.length);
      expect(at('all')?.count).toBe(botIssues.length);
    });
  });
});

describe('issue incremental merge', () => {
  const base = applyIssuesFull(
    EMPTY_ISSUE_STATE,
    'me',
    [issue({ id: 'a', number: 1 }), issue({ id: 'b', number: 2 })],
    ['b'],
    1000,
  );

  it('replaces updated issues, adds new ones and drops closed ones', () => {
    const next = applyIssuesDelta(
      base,
      'me',
      [
        { issue: issue({ id: 'a', number: 1, title: 'changed' }), open: true },
        { issue: issue({ id: 'c', number: 3 }), open: true },
        { issue: issue({ id: 'b', number: 2 }), open: false, closedAt: '2026-11-06T11:00:00Z' },
      ],
      [{ id: 'b', open: false }],
      2000,
    );
    expect(Object.keys(next.issues).sort()).toEqual(['a', 'c']);
    expect(next.issues.a?.title).toBe('changed');
    expect(next.mentioned).toEqual([]);
    expect(next.closed['acme-api#2']).toBe(Date.parse('2026-11-06T11:00:00Z'));
    expect(next.lastSync).toBe(2000);
  });

  it('adds a newly mentioning issue and keeps the rest', () => {
    const next = applyIssuesDelta(
      base,
      'me',
      [{ issue: issue({ id: 'a', number: 1 }), open: true }],
      [{ id: 'a', open: true }],
      2000,
    );
    expect([...next.mentioned].sort()).toEqual(['a', 'b']);
  });

  it('treats a full sweep absence as closed and keeps only mentions that are open', () => {
    const next = applyIssuesFull(base, 'me', [issue({ id: 'a', number: 1 })], ['a', 'b'], 3000);
    expect(next.closed['acme-api#2']).toBe(3000);
    expect(next.mentioned).toEqual(['a']);
  });
});

describe('issue seen markers', () => {
  it('marks new, updated with a comment note, and seen', async () => {
    const store = new SeenStore(null);
    const i = issue({ id: 'a', commentCount: 3 });
    expect((await store.annotateIssues([i]))[0]?.seen).toBe('new');

    await store.mark({ id: 'a', updatedAt: i.updatedAt, commentCount: 3 });
    expect((await store.annotateIssues([i]))[0]?.seen).toBe('seen');

    const later = issue({ id: 'a', commentCount: 4, updatedAt: '2026-11-06T12:00:00Z' });
    const [updated] = await store.annotateIssues([later]);
    expect(updated?.seen).toBe('updated');
    expect(updated?.updatedNote).toBe('1 new comment');

    const edited = issue({ id: 'a', commentCount: 3, updatedAt: '2026-11-06T13:00:00Z' });
    expect((await store.annotateIssues([edited]))[0]?.updatedNote).toBe('updated since you looked');
    expect(await store.seenCommentCount('a')).toBe(3);
  });
});

describe('runBulk', () => {
  it('keeps successes, lists failures and never exceeds the concurrency', async () => {
    let live = 0;
    let peak = 0;
    const result = await runBulk([1, 2, 3, 4, 5, 6, 7], async (n) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 3));
      live -= 1;
      if (n % 3 === 0) throw new Error(`422 on ${n}`);
    });
    expect(peak).toBe(3);
    expect(result.done).toEqual([1, 2, 4, 5, 7]);
    expect(result.failed).toEqual([
      { item: 3, message: '422 on 3' },
      { item: 6, message: '422 on 6' },
    ]);
  });

  it('handles an empty selection', async () => {
    expect(await runBulk([], async () => undefined)).toEqual({ done: [], failed: [] });
  });
});

describe('sanitizeHtml', () => {
  const clean = createSanitizer(new JSDOM('').window as unknown as Window & typeof globalThis);

  it('strips script tags and their content', () => {
    expect(clean('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
  });

  it('strips event handler attributes', () => {
    const out = clean('<img src="https://x.test/a.png" onerror="alert(1)"><a href="https://github.com" onclick="x()">l</a>');
    expect(out).not.toMatch(/onerror|onclick/);
    expect(out).toContain('src="https://x.test/a.png"');
  });

  it('removes javascript: URLs', () => {
    expect(clean('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });

  it('opens links in a new tab with no opener', () => {
    const out = clean('<a href="https://github.com/acme-co">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('sanitizes a PR body with a script tag and keeps its formatting', () => {
    const body =
      '<h2>Changes</h2><p><strong>bold</strong> and <code>code</code></p><script>alert(1)</script>' +
      '<img src="https://x.test/a.png" onerror="alert(2)">';
    const out = clean(body);
    expect(out).not.toMatch(/script|alert|onerror/);
    expect(out).toContain('<h2>Changes</h2>');
    expect(out).toContain('<strong>bold</strong>');
  });

  it('keeps GitHub rendered markdown structure', () => {
    const html = '<h2>Summary</h2><ol><li>one</li></ol><pre><code>GET /x</code></pre>';
    expect(clean(html)).toBe(html);
  });
});

describe('label chips', () => {
  it('reaches 4.8:1 text contrast on the fill in both themes', () => {
    for (const theme of ['dark', 'light'] as const) {
      for (const c of ['d73a4a', 'a2eeef', 'b60205', 'fbca04', 'ededed']) {
        const { fill, text } = chipColors(c, theme);
        const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
        expect(contrast(rgb(text), rgb(fill))).toBeGreaterThanOrEqual(4.8);
      }
    }
  });

  it('falls back to gray for an unusable colour', () => {
    expect(chipColors('zzz', 'dark').fill).toBe(chipColors('6e7167', 'dark').fill);
  });
});

describe('thread timeline', () => {
  const ev = (type: string, extra: Partial<RawTimelineItem>, at = '2026-11-06T08:00:00Z'): RawTimelineItem => ({
    __typename: type,
    id: type + (extra.label?.name ?? extra.assignee?.login ?? ''),
    createdAt: at,
    actor: { login: 'acme-dev' },
    ...extra,
  });

  it('folds label and self-assign events by one actor into one line', () => {
    const out = toTimeline([
      ev('LabeledEvent', { label: { name: 'bug' } }),
      ev('AssignedEvent', { assignee: { login: 'acme-dev' } }, '2026-11-06T08:00:05Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe('acme-dev added label bug and self-assigned');
  });

  it('keeps events far apart on separate lines', () => {
    const out = toTimeline([
      ev('LabeledEvent', { label: { name: 'bug' } }),
      ev('UnlabeledEvent', { label: { name: 'bug' } }, '2026-11-06T09:00:00Z'),
    ]);
    expect(out.map((e) => e.text)).toEqual(['acme-dev added label bug', 'acme-dev removed label bug']);
  });
});

describe('issue notifications', () => {
  const pr: InboxData = { viewer: 'me', prs: [], syncedAt: 0, follows: {} };
  const data = (issues: IssueSummary[], mentionedIds: string[] = []): IssueInboxData => ({
    viewer: 'me',
    issues,
    mentionedIds,
    syncedAt: 0,
  });
  const run = (prev: IssueInboxData | undefined, next: IssueInboxData, over = {}) =>
    computeNotifications({
      prev: pr,
      next: pr,
      prevIssues: prev,
      nextIssues: next,
      settings: DEFAULT_SETTINGS,
      windowFocused: false,
      ...over,
    });

  it('notifies when an issue is newly assigned to the viewer, targeting that issue', () => {
    const before = data([issue({ id: 'a', assignees: [] })]);
    const after = data([issue({ id: 'a', number: 412, assignees: ['me'] })]);
    const items = run(before, after);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Issue assigned: acme-api #412');
    expect(items[0]?.target).toEqual({ kind: 'issue', repo: 'acme-api', number: 412 });
  });

  it('notifies for a newly arrived issue already assigned, but not for one assigned before', () => {
    const had = data([issue({ id: 'a', assignees: ['me'] })]);
    expect(run(had, had)).toEqual([]);
    expect(run(data([]), had)).toHaveLength(1);
  });

  it('notifies when an issue newly mentions the viewer', () => {
    const before = data([issue({ id: 'a' })]);
    const after = data([issue({ id: 'a', number: 405 })], ['a']);
    const items = run(before, after);
    expect(items[0]?.title).toBe('Issue mentions you: acme-api #405');
    expect(run(after, after)).toEqual([]);
  });

  it('stays silent on the first sync, when muted, when a toggle is off or the issue was opened', () => {
    const after = data([issue({ id: 'a', assignees: ['me'] })], ['a']);
    expect(run(undefined, after)).toEqual([]);
    expect(run(data([]), after, { settings: { ...DEFAULT_SETTINGS, muted: true } })).toEqual([]);
    expect(
      run(data([]), after, { settings: { ...DEFAULT_SETTINGS, issueAssigned: false, issueMention: false } }),
    ).toEqual([]);
    expect(run(data([]), after, { seenIds: new Set(['a']) })).toEqual([]);
  });
});

describe('issue pane widths', () => {
  it('stops the list at 280 and the detail at 400', () => {
    expect(clampWidth('issues', [520, 960], 0, 100, 1920)).toEqual([280, 960]);
    expect(clampWidth('issues', [520, 960], 1, 100, 1920)).toEqual([520, 400]);
  });

  it('keeps 280 for the sidebar', () => {
    expect(clampWidth('issues', [520, 960], 1, 5000, 1920)[1]).toBe(1920 - 2 - 280 - 520);
  });

  it('keeps 400 for the detail at two panes', () => {
    expect(clampWidth('issues-two', [300], 0, 5000, 960)).toEqual([559]);
    expect(fitWidths('issues', [520, 960], 1100)).toEqual([418, 400]);
  });
});
