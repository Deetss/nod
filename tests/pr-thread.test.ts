import { describe, expect, it } from 'vitest';
import { toPrThread, type RawPrThread } from '../server/pr-thread';

const author = (login: string) => ({ login, avatarUrl: `https://example.test/${login}.png` });

function raw(over: Partial<RawPrThread> = {}): RawPrThread {
  return {
    comments: { nodes: [] },
    threadReviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    ...over,
  };
}

describe('toPrThread', () => {
  it('merges comments, reviews and threads oldest first', () => {
    const items = toPrThread(
      raw({
        comments: {
          nodes: [{ id: 'c2', author: author('ada'), bodyHTML: '<p>later</p>', createdAt: '2026-01-03T00:00:00Z' }],
        },
        threadReviews: {
          nodes: [
            {
              id: 'r1',
              author: author('bob'),
              state: 'APPROVED',
              bodyHTML: '',
              submittedAt: '2026-01-02T00:00:00Z',
            },
          ],
        },
        reviewThreads: {
          nodes: [
            {
              isResolved: false,
              path: 'src/a.ts',
              line: 4,
              comments: {
                nodes: [
                  { id: 't1', author: author('cy'), bodyHTML: '<p>first</p>', createdAt: '2026-01-01T00:00:00Z' },
                ],
              },
            },
          ],
        },
      }),
    );
    expect(items.map((i) => i.kind)).toEqual(['thread', 'review', 'comment']);
  });

  it('keeps a review with a body or a verdict, drops a bare COMMENTED one', () => {
    const review = (id: string, state: string, bodyHTML: string) => ({
      id,
      author: author('bob'),
      state,
      bodyHTML,
      submittedAt: '2026-01-02T00:00:00Z',
    });
    const items = toPrThread(
      raw({
        threadReviews: {
          nodes: [
            review('bare', 'COMMENTED', ''),
            review('spaces', 'COMMENTED', '  '),
            review('words', 'COMMENTED', '<p>nit</p>'),
            review('changes', 'CHANGES_REQUESTED', ''),
            review('ok', 'APPROVED', ''),
          ],
        },
      }),
    );
    expect(items.map((i) => (i.kind === 'review' ? `${i.id}:${i.verdict}` : ''))).toEqual([
      'words:commented',
      'changes:changes',
      'ok:approved',
    ]);
  });

  it('maps a resolved review thread with its file, line and comments', () => {
    const items = toPrThread(
      raw({
        reviewThreads: {
          nodes: [
            {
              isResolved: true,
              path: 'src/b.ts',
              line: null,
              comments: {
                nodes: [
                  { id: 't1', author: author('cy'), bodyHTML: '<p>q</p>', createdAt: '2026-01-01T00:00:00Z' },
                  { id: 't2', author: null, bodyHTML: '<p>a</p>', createdAt: '2026-01-01T01:00:00Z' },
                ],
              },
            },
            { isResolved: false, path: 'empty.ts', line: 1, comments: { nodes: [] } },
          ],
        },
      }),
    );
    expect(items).toHaveLength(1);
    const t = items[0];
    expect(t?.kind).toBe('thread');
    if (t?.kind !== 'thread') return;
    expect(t.resolved).toBe(true);
    expect(t.path).toBe('src/b.ts');
    expect(t.line).toBeUndefined();
    expect(t.comments.map((c) => c.author)).toEqual(['cy', 'ghost']);
  });
});
