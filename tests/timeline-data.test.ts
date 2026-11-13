import { describe, expect, it } from 'vitest';
import { checkStatusFromConclusion, reviewCounts, toCheck } from '../server/github-map';
import { toIssueDetail, type RawIssueDetail } from '../server/issue-map';
import { toPrThread, type RawPrThread } from '../server/pr-thread';
import { minimizedPill, minimizedSentence, toMinimized } from '../shared/minimized';

const run = (conclusion: string | null, status = 'COMPLETED') =>
  toCheck({ __typename: 'CheckRun', name: 'build', status, conclusion }).status;

describe('check conclusion mapping', () => {
  it.each([
    ['SUCCESS', 'pass'],
    ['NEUTRAL', 'pass'],
    ['SKIPPED', 'skipped'],
    ['CANCELLED', 'cancelled'],
    ['FAILURE', 'fail'],
    ['TIMED_OUT', 'fail'],
    ['ACTION_REQUIRED', 'fail'],
    ['STALE', 'fail'],
    ['STARTUP_FAILURE', 'fail'],
  ])('%s becomes %s', (conclusion, status) => {
    expect(run(conclusion)).toBe(status);
    expect(checkStatusFromConclusion(conclusion)).toBe(status);
  });

  it('keeps running and queued runs as they were', () => {
    expect(run(null, 'IN_PROGRESS')).toBe('running');
    expect(run(null, 'QUEUED')).toBe('queued');
  });
});

describe('reviewCounts', () => {
  it('counts open requests and latest changes requested', () => {
    const counts = reviewCounts({
      reviewRequests: { nodes: [{ requestedReviewer: { login: 'ada' } }, { requestedReviewer: null }] },
      latestReviews: { nodes: [{ state: 'CHANGES_REQUESTED' }, { state: 'APPROVED' }, { state: 'COMMENTED' }] },
    });
    expect(counts).toEqual({ pendingReviews: 1, changeRequests: 1, approvals: 1 });
  });

  it('is zero when GitHub sent nothing', () => {
    expect(reviewCounts({})).toEqual({ pendingReviews: 0, changeRequests: 0, approvals: 0 });
  });
});

describe('minimized mapping', () => {
  it('is absent for a visible comment', () => {
    expect(toMinimized(false, null)).toBeUndefined();
    expect(toMinimized(undefined)).toBeUndefined();
  });

  it.each([
    ['abuse', 'This comment was marked as abuse'],
    ['duplicate', 'This comment was marked as duplicate'],
    ['off-topic', 'This comment was marked as off-topic'],
    ['outdated', 'This comment was marked as outdated'],
    ['resolved', 'This comment was marked as resolved'],
    ['spam', 'This comment was marked as spam'],
    ['DUPLICATE', 'This comment was marked as duplicate'],
    [' Off-Topic ', 'This comment was marked as off-topic'],
    ['something-new', 'This comment was hidden'],
    ['', 'This comment was hidden'],
  ])('reason %j reads %s', (reason, sentence) => {
    expect(minimizedSentence(toMinimized(true, reason)?.reason)).toBe(sentence);
  });

  it('words a hidden review the same way', () => {
    expect(minimizedSentence('duplicate', 'review')).toBe('This review was marked as duplicate');
    expect(minimizedSentence(undefined, 'review')).toBe('This review was hidden');
  });

  it('gives outdated the attention pill and others neutral', () => {
    expect(minimizedPill('outdated')).toEqual({ label: 'Outdated', tone: 'attention' });
    expect(minimizedPill('off-topic')).toEqual({ label: 'Off-topic', tone: 'neutral' });
    expect(minimizedPill('nope')).toBeUndefined();
  });
});

describe('hidden comments reach the thread items', () => {
  const author = { login: 'build-bot' };
  const raw: RawPrThread = {
    comments: {
      nodes: [
        { id: 'c1', author, bodyHTML: '<p>a</p>', createdAt: '2026-01-01T00:00:00Z', isMinimized: true, minimizedReason: 'duplicate' },
        { id: 'c2', author, bodyHTML: '<p>b</p>', createdAt: '2026-01-02T00:00:00Z', isMinimized: false, minimizedReason: null },
      ],
    },
    threadReviews: {
      nodes: [
        { id: 'r1', author, state: 'APPROVED', bodyHTML: '', submittedAt: '2026-01-03T00:00:00Z', isMinimized: true, minimizedReason: 'OUTDATED' },
      ],
    },
    reviewThreads: {
      nodes: [
        {
          isResolved: false,
          path: 'src/a.ts',
          line: 1,
          comments: {
            nodes: [{ id: 't1', author, bodyHTML: '<p>t</p>', createdAt: '2026-01-04T00:00:00Z', isMinimized: true, minimizedReason: 'spam' }],
          },
        },
      ],
    },
  };

  it('carries minimized on comments, reviews and thread comments', () => {
    const items = toPrThread(raw);
    expect(items[0]).toMatchObject({ kind: 'comment', comment: { minimized: { reason: 'duplicate' } } });
    expect((items[1] as { comment: { minimized?: unknown } }).comment.minimized).toBeUndefined();
    expect(items[2]).toMatchObject({ kind: 'review', minimized: { reason: 'outdated' } });
    expect(items[3]).toMatchObject({ kind: 'thread', comments: [{ minimized: { reason: 'spam' } }] });
  });

  it('carries minimized on issue comments', () => {
    const issue = {
      comments: {
        nodes: [{ id: 'i1', author, bodyHTML: '<p>x</p>', createdAt: '2026-01-01T00:00:00Z', isMinimized: true, minimizedReason: 'off-topic' }],
      },
      timelineItems: { nodes: [] },
      closedByPullRequestsReferences: { nodes: [] },
      participants: { nodes: [] },
      assignees: { nodes: [] },
      labels: { nodes: [] },
      commentCount: { totalCount: 1 },
      milestone: null,
      repository: { name: 'acme-web' },
      author,
      id: 'x',
      number: 17,
      title: 't',
      url: 'u',
      state: 'OPEN',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      bodyHTML: '',
    } as unknown as RawIssueDetail;
    expect(toIssueDetail(issue).comments[0]?.minimized).toEqual({ reason: 'off-topic' });
  });
});
