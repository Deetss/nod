import { describe, expect, it } from 'vitest';
import { HELP_KEYS } from '../web/keys';
import type { GroupedThread } from '../web/inline/group-threads';
import { commentText, threadControls, threadKeyAction, threadLabel, threadMode } from '../web/inline/thread-view-state';

const grouped = (over: Partial<GroupedThread> = {}): GroupedThread => ({
  thread: {
    kind: 'thread',
    at: '2026-11-10T10:00:00Z',
    id: 't',
    threadId: 'PRRT_t',
    path: 'src/a.ts',
    line: 41,
    side: 'RIGHT',
    resolved: false,
    comments: [{ id: 'c1', author: 'build-bot', createdAt: '2026-11-10T10:00:00Z', bodyHtml: '<p>x</p>', body: 'x' }],
  },
  draft: false,
  resolved: false,
  outdated: false,
  ...over,
});

describe('thread view state', () => {
  it('an open thread shows the full conversation', () => {
    expect(threadMode(grouped(), false)).toBe('open');
    expect(threadMode(grouped(), true)).toBe('open');
  });

  it('a resolved thread collapses to one row until expanded', () => {
    const r = grouped({ resolved: true });
    expect(threadMode(r, false)).toBe('resolved-collapsed');
    expect(threadMode(r, true)).toBe('resolved-expanded');
  });

  it('an open thread offers reply and resolve, not unresolve', () => {
    const c = threadControls(grouped(), 'open');
    expect(c.reply).toBe(true);
    expect(c.resolve).toBe(true);
    expect(c.unresolve).toBe(false);
    expect(c.edit || c.delete || c.pendingPill).toBe(false);
  });

  it('an expanded resolved thread offers unresolve and no reply', () => {
    const r = grouped({ resolved: true });
    const c = threadControls(r, 'resolved-expanded');
    expect(c.unresolve).toBe(true);
    expect(c.reply).toBe(false);
    expect(c.resolve).toBe(false);
  });

  it('a collapsed resolved thread offers no actions', () => {
    const c = threadControls(grouped({ resolved: true }), 'resolved-collapsed');
    expect(c.reply || c.resolve || c.unresolve).toBe(false);
  });

  it('shows the outdated marker only when the thread is outdated', () => {
    expect(threadControls(grouped({ outdated: true }), 'open').outdatedMarker).toBe(true);
    expect(threadControls(grouped(), 'open').outdatedMarker).toBe(false);
  });

  it('a draft shows Edit, Delete and the pending pill, and no reply or resolve', () => {
    const c = threadControls(grouped({ draft: true }), 'open');
    expect(c.edit).toBe(true);
    expect(c.delete).toBe(true);
    expect(c.pendingPill).toBe(true);
    expect(c.reply || c.resolve || c.unresolve).toBe(false);
  });
});

describe('thread keys', () => {
  it('x resolves a focused thread outside a text field', () => {
    expect(threadKeyAction('x', false, false)).toBe('resolve');
  });

  it('x typed in the reply box does nothing', () => {
    expect(threadKeyAction('x', false, true)).toBe('none');
  });

  it('a Ctrl+x chord does nothing', () => {
    expect(threadKeyAction('x', true, false)).toBe('none');
  });

  it('other keys do nothing', () => {
    expect(threadKeyAction('r', false, false)).toBe('none');
  });

  it('the help sheet lists the thread keys', () => {
    const keys = HELP_KEYS.map((k) => k.keys);
    expect(keys).toContain('x');
    expect(keys).toContain('Ctrl+Enter');
    expect(keys).toContain('Enter');
  });
});

describe('thread labels and text', () => {
  it('labels a single line and a range', () => {
    expect(threadLabel({ line: 41 })).toBe('line 41');
    expect(threadLabel({ line: 42, startLine: 40 })).toBe('lines 40 to 42');
    expect(threadLabel({ line: undefined })).toBe('file');
  });

  it('prefers the Markdown source and strips tags from HTML-only bodies', () => {
    expect(commentText({ body: 'a *b*', bodyHtml: '<p>a <em>b</em></p>' })).toBe('a *b*');
    expect(commentText({ bodyHtml: '<p>a <em>b</em></p>' })).toBe('a b');
  });
});
