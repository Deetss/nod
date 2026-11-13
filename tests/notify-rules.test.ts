import { describe, expect, it } from 'vitest';
import { computeNotifications, DEFAULT_SETTINGS, type NotifyInput } from '../shared/notify-rules';
import type { InboxData, PrSummary } from '../shared/types';

const VIEWER = 'acme-dev';

function pr(over: Partial<PrSummary> & { number: number }): PrSummary {
  return {
    id: `PR_${over.number}`,
    repo: 'acme-api',
    title: `Title ${over.number}`,
    author: 'sam',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    headSha: 'abc',
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    commitCount: 1,
    ci: 'pass',
    reviewStatus: 'no reviews yet',
    seen: 'new',
    url: 'https://github.com/acme-co/acme-api/pull/1',
    isDraft: false,
    requested: [],
    ...over,
  };
}

function inbox(prs: PrSummary[], teams: string[] = []): InboxData {
  return { viewer: VIEWER, teams, prs, syncedAt: 1, follows: {} };
}

function run(prev: InboxData | undefined, next: InboxData, over: Partial<NotifyInput> = {}) {
  return computeNotifications({
    prev,
    next,
    settings: DEFAULT_SETTINGS,
    windowFocused: false,
    ...over,
  });
}

describe('review requested', () => {
  it('notifies when a PR newly requests the user', () => {
    const prev = inbox([pr({ number: 310 })]);
    const next = inbox([pr({ number: 310, requested: [VIEWER] })]);
    expect(run(prev, next)).toEqual([
      {
        title: 'Review requested: acme-api #310',
        body: 'Title 310',
        target: { kind: 'pr', repo: 'acme-api', number: 310 },
        kind: 'review',
      },
    ]);
  });

  it('notifies for a brand new PR and for a team request', () => {
    const prev = inbox([], ['devs']);
    const next = inbox([pr({ number: 5, requested: ['devs'] })], ['devs']);
    expect(run(prev, next)).toHaveLength(1);
  });

  it('stays quiet for a PR that was already waiting on the user', () => {
    const waiting = pr({ number: 1, requested: [VIEWER] });
    expect(run(inbox([waiting]), inbox([{ ...waiting, title: 'Renamed' }]))).toEqual([]);
  });

  it('skips PRs the user already opened this session', () => {
    const next = inbox([pr({ number: 2, requested: [VIEWER] })]);
    expect(run(inbox([]), next, { seenIds: new Set(['PR_2']) })).toEqual([]);
  });
});

describe('new review on my PR', () => {
  const mine = (reviewStatus: string) => pr({ number: 7, author: VIEWER, reviewStatus });

  it.each([
    ['no reviews yet', '1 approval', 'Approved'],
    ['1 approval', '2 approvals', 'Approved'],
    ['needs review', 'changes requested', 'Changes requested'],
    ['no reviews yet', 'needs review', 'Review comment'],
  ])('%s -> %s is "%s"', (before, after, headline) => {
    const out = run(inbox([mine(before)]), inbox([mine(after)]));
    expect(out.map((i) => i.title)).toEqual([`${headline}: acme-api #7`]);
  });

  it('ignores unchanged status and other people\'s PRs', () => {
    expect(run(inbox([mine('1 approval')]), inbox([mine('1 approval')]))).toEqual([]);
    const theirs = (s: string) => pr({ number: 8, reviewStatus: s });
    expect(run(inbox([theirs('no reviews yet')]), inbox([theirs('1 approval')]))).toEqual([]);
  });
});

describe('CI failing on my PR', () => {
  const mine = (ci: PrSummary['ci']) => pr({ number: 9, author: VIEWER, ci });

  it('notifies when CI changes to failing', () => {
    const out = run(inbox([mine('running')]), inbox([mine('fail')]));
    expect(out.map((i) => i.title)).toEqual(['CI failing: acme-api #9']);
  });

  it('stays quiet when CI was already failing or a PR is new', () => {
    expect(run(inbox([mine('fail')]), inbox([mine('fail')]))).toEqual([]);
    expect(run(inbox([]), inbox([mine('fail')]))).toEqual([]);
  });
});

describe('gating', () => {
  const prev = inbox([]);
  const next = inbox([pr({ number: 3, requested: [VIEWER] })]);

  it('is silent on the first sync', () => {
    expect(run(undefined, next)).toEqual([]);
  });

  it('is silent while the window is focused', () => {
    expect(run(prev, next, { windowFocused: true })).toEqual([]);
  });

  it('is silent when muted or when the trigger is off', () => {
    expect(run(prev, next, { settings: { ...DEFAULT_SETTINGS, muted: true } })).toEqual([]);
    expect(run(prev, next, { settings: { ...DEFAULT_SETTINGS, review: false } })).toEqual([]);
  });
});

describe('batching', () => {
  const requested = (n: number) =>
    inbox(Array.from({ length: n }, (_, i) => pr({ number: i + 1, requested: [VIEWER] })));

  it('keeps three notifications separate', () => {
    expect(run(inbox([]), requested(3))).toHaveLength(3);
  });

  it('collapses more than three into one summary', () => {
    const out = run(inbox([]), requested(5));
    expect(out).toEqual([
      { title: '5 updates in Nod', body: 'Open Nod to see them.', kind: 'summary' },
    ]);
  });
});
