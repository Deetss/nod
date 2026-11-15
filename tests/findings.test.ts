import { describe, expect, it } from 'vitest';
import {
  bannerOf,
  bulkTitle,
  dispatchText,
  findingOf,
  findingsOf,
  groupThreads,
  handBody,
  handStateOf,
  handable,
  reviewerOn,
} from '../shared/findings';
import type { ThreadItem } from '../shared/fix-comments';
import { HELP_KEYS } from '../web/keys';
import { SEND_MAX } from '../shared/orca-sessions';
import { DEFAULT_SETTINGS, SettingsSchema, type ReviewerSettings } from '../shared/settings';
import type { PrDetail, PrThreadItem } from '../shared/types';
import { TEST_BOT } from './bot-settings';

const R: ReviewerSettings = { login: 'review-bot', threadMarker: '<!-- review-bot -->' };
const BOT = { ...TEST_BOT, name: 'review-bot', command: '/review-bot', login: 'review-bot' };

function thread(n: number, author: string, body: string, over: Partial<ThreadItem> = {}): ThreadItem {
  return {
    kind: 'thread',
    at: '2026-11-15T09:00:00Z',
    id: `T${n}`,
    threadId: `PRRT_${n}`,
    path: `db/migrate/file_${n}.rb`,
    line: 10 + n,
    resolved: false,
    isOutdated: false,
    comments: [
      { id: `C${n}`, author, createdAt: '2026-11-15T09:00:00Z', bodyHtml: `<p>${body}</p>`, body, url: `https://example.test/r${n}` },
    ],
    ...over,
  };
}

const blocker = (n = 1, over: Partial<ThreadItem> = {}) =>
  thread(n, 'review-bot', `${R.threadMarker}\n**Blocker**: The diff keeps the old version. Remove it.`, over);
const major = (n = 2, over: Partial<ThreadItem> = {}) =>
  thread(n, 'review-bot', `${R.threadMarker} **Major**: Rollback drops the table.`, over);
const human = (n = 3, over: Partial<ThreadItem> = {}) => thread(n, 'riley-k', 'Can we rename the class too?', over);

describe('findingOf', () => {
  it('reads severity and text from a marked bot comment', () => {
    expect(findingOf(blocker(), R)).toMatchObject({ severity: 'blocker', text: 'The diff keeps the old version. Remove it.' });
    expect(findingOf(major(), R)).toMatchObject({ severity: 'major', text: 'Rollback drops the table.' });
  });

  it('matches the login without case or a [bot] suffix', () => {
    const t = thread(1, 'Review-Bot[bot]', `${R.threadMarker} **Major**: x`);
    expect(findingOf(t, R)?.severity).toBe('major');
  });

  it('ignores a thread by someone else, without the marker, or without a severity prefix', () => {
    expect(findingOf(thread(1, 'riley-k', `${R.threadMarker} **Blocker**: x`), R)).toBeUndefined();
    expect(findingOf(thread(2, 'review-bot', '**Blocker**: x'), R)).toBeUndefined();
    expect(findingOf(thread(3, 'review-bot', `${R.threadMarker} **Minor**: x`), R)).toBeUndefined();
  });

  it('hides everything while the login or marker is empty', () => {
    expect(reviewerOn(DEFAULT_SETTINGS.reviewer)).toBe(false);
    expect(findingOf(blocker(), DEFAULT_SETTINGS.reviewer)).toBeUndefined();
    expect(findingOf(blocker(), { ...R, login: '' })).toBeUndefined();
    expect(findingOf(blocker(), { ...R, threadMarker: '' })).toBeUndefined();
    const items: PrThreadItem[] = [blocker(), major(), human()];
    const g = groupThreads(items, DEFAULT_SETTINGS.reviewer);
    expect(g.open).toHaveLength(0);
    expect(g.humans).toHaveLength(3);
    expect(findingsOf({ thread: items } as PrDetail, DEFAULT_SETTINGS.reviewer)).toEqual([]);
  });
});

describe('groupThreads and bannerOf', () => {
  const items: PrThreadItem[] = [major(2), human(3), blocker(1), blocker(4, { resolved: true }), human(5, { resolved: true })];

  it('orders open findings blocker first and separates human and resolved threads', () => {
    const g = groupThreads(items, R);
    expect(g.open.map((f) => f.thread.id)).toEqual(['T1', 'T2']);
    expect(g.done.map((f) => f.thread.id)).toEqual(['T4']);
    expect(g.humans.map((t) => t.id)).toEqual(['T3']);
    expect(g.humansDone.map((t) => t.id)).toEqual(['T5']);
  });

  it('counts human threads as unresolved but not toward Hand all', () => {
    expect(bannerOf(groupThreads(items, R))).toEqual({ unresolved: 3, findings: 2, blocked: true });
  });

  it('is ready to merge when every thread is resolved', () => {
    const all = [blocker(1, { resolved: true }), major(2, { resolved: true })];
    expect(bannerOf(groupThreads(all, R))).toEqual({ unresolved: 0, findings: 0, blocked: false });
  });
});

describe('hand to bot', () => {
  it('builds the existing bot command on the finding text, not the marker', () => {
    const f = findingOf(blocker(), R)!;
    const body = handBody(f, BOT);
    expect(body.startsWith('/review-bot fix this review comment on db/migrate/file_1.rb:11')).toBe(true);
    expect(body).toContain('"The diff keeps the old version."');
    expect(body).not.toContain('<!--');
    expect(body).not.toContain('**Blocker**');
  });

  it('replies on the finding thread id, and skips resolved and unsent threads', () => {
    const f = findingOf(blocker(), R)!;
    expect(f.thread.threadId).toBe('PRRT_1');
    expect(handable(f)).toBe(true);
    expect(handable(findingOf(blocker(1, { resolved: true }), R)!)).toBe(false);
    expect(handable(findingOf(blocker(1, { threadId: undefined }), R)!)).toBe(false);
  });

  it('hands all unresolved findings and leaves human threads out', () => {
    const g = groupThreads([blocker(1), major(2), human(3)], R);
    const bodies = g.open.filter(handable).map((f) => ({ id: f.thread.threadId, body: handBody(f, BOT) }));
    expect(bodies.map((b) => b.id)).toEqual(['PRRT_1', 'PRRT_2']);
    expect(bodies.every((b) => b.body.startsWith('/review-bot '))).toBe(true);
    expect(bulkTitle(2, 'review-bot')).toBe('Hand 2 findings to review-bot?');
    expect(bulkTitle(1, 'review-bot')).toBe('Hand 1 finding to review-bot?');
  });

  it('reads handed state and the bot reply with its run link from the thread', () => {
    const t = blocker();
    expect(handStateOf(t, BOT)).toBeUndefined();
    const sent = {
      id: 'C9',
      author: 'sam-lee',
      createdAt: '2026-11-15T09:42:00Z',
      bodyHtml: '',
      body: handBody(findingOf(t, R)!, BOT),
    };
    const waiting = { ...t, comments: [...t.comments, sent] };
    expect(handStateOf(waiting, BOT)).toEqual({ at: '2026-11-15T09:42:00Z' });
    const reply = {
      id: 'C10',
      author: 'review-bot',
      createdAt: '2026-11-15T09:44:00Z',
      bodyHtml: '',
      body: 'Fixing the migration, run https://example.test/acme/actions/runs/8841',
    };
    const answered = handStateOf({ ...t, comments: [...waiting.comments, reply] }, BOT);
    expect(answered?.reply).toMatchObject({ author: 'review-bot', runUrl: 'https://example.test/acme/actions/runs/8841' });
  });
});

describe('dispatchText', () => {
  it('carries the file and the finding on one line within the send limit', () => {
    const text = dispatchText(findingOf(blocker(), R)!, 'acme-co/orders-api', 365);
    expect(text).toContain('db/migrate/file_1.rb:11');
    expect(text).toContain('The diff keeps the old version.');
    expect(text).not.toContain('\n');
    const long = thread(1, 'review-bot', `${R.threadMarker} **Major**: ${'word '.repeat(300)}`);
    expect(dispatchText(findingOf(long, R)!, 'acme-co/orders-api', 365).length).toBeLessThanOrEqual(SEND_MAX);
  });
});

describe('settings and keys', () => {
  it('defaults the reviewer section to empty and validates the login', () => {
    expect(SettingsSchema.parse({}).reviewer).toEqual({ login: '', threadMarker: '' });
    expect(SettingsSchema.safeParse({ reviewer: { login: 'bad login!' } }).success).toBe(false);
    expect(SettingsSchema.parse({ reviewer: { login: 'github-actions', threadMarker: '<!-- x -->' } }).reviewer.login).toBe('github-actions');
  });

  it('keeps the reviewer keys apart from the bot keys', () => {
    expect(Object.keys(DEFAULT_SETTINGS.reviewer)).toEqual(['login', 'threadMarker']);
    const bot = Object.keys(DEFAULT_SETTINGS.bot);
    expect(bot).toContain('login');
    expect(bot.filter((k) => k === 'threadMarker')).toEqual([]);
  });

  it('lists the finding keys once in the help sheet and leaves the existing ones alone', () => {
    const count = (keys: string) => HELP_KEYS.filter((k) => k.keys === keys).length;
    expect(count('b')).toBe(1);
    expect(count('H')).toBe(1);
    expect(count('s')).toBe(1);
    expect(count('x')).toBe(1);
    expect(count('c')).toBe(1);
  });
});
