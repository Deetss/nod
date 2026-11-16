import { describe, expect, it } from 'vitest';
import { deriveIssueSections } from '../shared/issue-sections';
import { deriveSections } from '../shared/sections';
import type { IssueSummary } from '../shared/issue-types';
import type { PrSummary } from '../shared/types';
import {
  isPhoneWidth,
  issueChips,
  phoneStatus,
  prAllTotal,
  collapseProgress,
  prChips,
  crossedUp,
  DISC_MAX,
  DISC_REST,
  discTravel,
  PULL_THRESHOLD,
  pullProgress,
  rateLimited,
  resolveOpen,
  sectionStates,
  sheetScrimOpacity,
  shouldCloseSwipe,
  shouldRefresh,
  SWIPE_CLOSE_PX,
  snapTarget,
  steppedProgress,
  tabTitle,
} from '../web/phone/phone-logic';

const pr = (n: number, over: Partial<PrSummary> = {}): PrSummary => ({
  id: `acme-api#${n}`,
  repo: 'acme-api',
  number: n,
  title: `PR ${n}`,
  author: 'build-bot',
  createdAt: '2026-11-06T10:00:00Z',
  updatedAt: `2026-11-06T1${n}:00:00Z`,
  headSha: 'a1b2c3d',
  additions: 1,
  deletions: 1,
  changedFiles: 1,
  commitCount: 1,
  ci: 'pass',
  reviewStatus: 'needs review',
  seen: 'seen',
  url: '',
  ...over,
});

const issue = (n: number, over: Partial<IssueSummary> = {}): IssueSummary => ({
  id: `acme-api#i${n}`,
  repo: 'acme-api',
  number: n,
  title: `Issue ${n}`,
  author: 'build-bot',
  createdAt: '2026-11-06T10:00:00Z',
  updatedAt: `2026-11-06T1${n}:30:00Z`,
  url: '',
  state: 'open',
  labels: [],
  assignees: [],
  commentCount: 0,
  seen: 'seen',
  ...over,
});

describe('isPhoneWidth', () => {
  it('is phone below 700px and desktop at 700px and above', () => {
    expect(isPhoneWidth(699, false)).toBe(true);
    expect(isPhoneWidth(700, false)).toBe(false);
    expect(isPhoneWidth(1400, false)).toBe(false);
  });

  it('is phone at any width when forced', () => {
    expect(isPhoneWidth(1400, true)).toBe(true);
  });
});

describe('chip counts', () => {
  it('counts a PR once in All even when it sits in two sections', () => {
    const prs = [
      pr(1, { requested: ['acme-dev'], author: 'acme-dev' }),
      pr(2),
      pr(3, { author: 'dependabot[bot]' }),
    ];
    const chips = prChips(deriveSections('acme-dev', prs));
    expect(chips.map((c) => [c.key, c.count])).toEqual([
      ['all', 3],
      ['needs', 1],
      ['mine', 1],
      ['org', 1],
      ['dependabot', 1],
    ]);
  });

  it('gives zero counts for an empty inbox', () => {
    expect(prChips(deriveSections('acme-dev', [])).every((c) => c.count === 0)).toBe(true);
  });

  it('uses the all section for the issue All count and drops it from the section chips', () => {
    const issues = [issue(1, { assignees: ['acme-dev'] }), issue(2), issue(3, { author: 'acme-dev' })];
    const chips = issueChips(deriveIssueSections('acme-dev', issues, [issues[1]?.id ?? '']));
    expect(chips.map((c) => [c.key, c.count])).toEqual([
      ['all', 3],
      ['progress', 0],
      ['assigned', 1],
      ['created', 1],
      ['mentioned', 1],
      ['untriaged', 0],
    ]);
  });
});

describe('phoneStatus', () => {
  const base = { hasData: true, syncing: false, error: undefined, stale: false, total: 3 };

  it('is loading until data arrives', () => {
    expect(phoneStatus({ ...base, hasData: false })).toBe('loading');
  });

  it('keeps cached rows on screen while a sync runs', () => {
    expect(phoneStatus({ ...base, syncing: true })).toBe('ready');
  });

  it('shows loading, not empty, for a first sync with nothing cached', () => {
    expect(phoneStatus({ ...base, syncing: true, total: 0 })).toBe('loading');
  });

  it('is error with no data and a failed request', () => {
    expect(phoneStatus({ ...base, hasData: false, error: 'x' })).toBe('error');
  });

  it('keeps cached rows under an error when data exists', () => {
    expect(phoneStatus({ ...base, stale: true })).toBe('error');
  });

  it('is empty at zero items and ready otherwise', () => {
    expect(phoneStatus({ ...base, total: 0 })).toBe('empty');
    expect(phoneStatus(base)).toBe('ready');
  });
});

describe('pull to refresh', () => {
  it('refreshes at 72px and not before', () => {
    expect(shouldRefresh(71)).toBe(false);
    expect(shouldRefresh(72)).toBe(true);
  });

  it('damps the disc travel, caps it at 56 and ignores upward drags', () => {
    expect(discTravel(-10)).toBe(0);
    expect(discTravel(0)).toBe(0);
    expect(discTravel(50)).toBe(30);
    expect(discTravel(72)).toBeCloseTo(43.2);
    expect(discTravel(100)).toBe(DISC_MAX);
    expect(DISC_MAX).toBe(56);
    expect(DISC_REST).toBe(40);
  });

  it('fills the ring in step with the threshold', () => {
    expect(pullProgress(-5)).toBe(0);
    expect(pullProgress(36)).toBe(0.5);
    expect(pullProgress(72)).toBe(1);
    expect(pullProgress(200)).toBe(1);
  });

  it('ticks once per crossing and re-arms below the line', () => {
    const path = [0, 40, 71, 72, 90, 60, 75, 80];
    const ticks = path.slice(1).filter((next, i) => crossedUp(path[i] ?? 0, next, PULL_THRESHOLD));
    expect(ticks).toEqual([72, 75]);
  });

  it('knows a live rate limit only by kind and a reset still ahead', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    expect(rateLimited(undefined, now)).toBe(false);
    expect(rateLimited({ kind: 'error', resetAt: '2026-11-16T12:10:00Z' }, now)).toBe(false);
    expect(rateLimited({ kind: 'ratelimit' }, now)).toBe(false);
    expect(rateLimited({ kind: 'ratelimit', resetAt: '2026-11-16T11:59:00Z' }, now)).toBe(false);
    expect(rateLimited({ kind: 'ratelimit', resetAt: '2026-11-16T12:10:00Z' }, now)).toBe(true);
  });
});

describe('swipe down to close', () => {
  it('closes past 120 or on a quick 40px fling', () => {
    expect(shouldCloseSwipe(119, 500)).toBe(false);
    expect(shouldCloseSwipe(SWIPE_CLOSE_PX, 500)).toBe(true);
    expect(shouldCloseSwipe(40, 200)).toBe(true);
    expect(shouldCloseSwipe(40, 201)).toBe(false);
    expect(shouldCloseSwipe(39, 100)).toBe(false);
  });

  it('fades the scrim to half at the close line', () => {
    expect(sheetScrimOpacity(0)).toBe(1);
    expect(sheetScrimOpacity(120)).toBe(0.5);
    expect(sheetScrimOpacity(300)).toBe(0);
  });
});

describe('All chip with only an org PR', () => {
  const sections = deriveSections('acme-dev', [pr(2)]);
  const total = prAllTotal(sections);

  it('totals 1 and the status is ready', () => {
    expect(total).toBe(1);
    const status = phoneStatus({ hasData: true, syncing: false, error: undefined, stale: false, total });
    expect(status).toBe('ready');
  });

  it('matches the All chip count', () => {
    expect(prChips(sections)[0]?.count).toBe(total);
  });
});

describe('resolveOpen', () => {
  const closed = new Set(['org', 'dependabot']);
  const sec = (key: string, rows: number) => ({ key, rows });

  it('opens the first non-empty default-closed section when all else is empty', () => {
    const out = resolveOpen([sec('needs', 0), sec('mine', 0), sec('org', 1), sec('dependabot', 2)], {}, closed);
    expect(out).toMatchObject({ org: true, dependabot: false });
  });

  it('leaves defaults alone when a non-empty section is already open', () => {
    const out = resolveOpen([sec('needs', 1), sec('org', 1)], {}, closed);
    expect(out).toMatchObject({ needs: true, org: false });
  });

  it('keeps a section the user closed explicitly closed', () => {
    const out = resolveOpen([sec('needs', 0), sec('org', 1), sec('dependabot', 1)], { org: false }, closed);
    expect(out).toMatchObject({ org: false, dependabot: true });
  });

  it('renders an empty section closed even when it was saved open', () => {
    const out = resolveOpen([sec('needs', 0), sec('mine', 2)], { needs: true }, closed);
    expect(out).toMatchObject({ needs: false, mine: true });
  });

  it('opens an empty section only while it is peeked', () => {
    const out = resolveOpen([sec('needs', 0), sec('mine', 2)], { needs: false }, closed, new Set(['needs']));
    expect(out).toMatchObject({ needs: true, mine: true });
  });

  it('applies the saved choice again once the section has rows', () => {
    expect(resolveOpen([sec('mine', 0), sec('needs', 1)], { mine: false }, closed).mine).toBe(false);
    expect(resolveOpen([sec('mine', 3), sec('needs', 1)], { mine: false }, closed).mine).toBe(false);
    expect(resolveOpen([sec('org', 0), sec('needs', 1)], { org: true }, closed).org).toBe(false);
    expect(resolveOpen([sec('org', 4), sec('needs', 1)], { org: true }, closed).org).toBe(true);
  });
});

describe('sectionStates', () => {
  const closed = new Set(['org']);
  const input = { saved: {}, closedByDefault: closed, peeked: new Set<string>(), filtered: false };
  const sections = [
    { key: 'needs', prs: [pr(1), pr(2)] },
    { key: 'mine', prs: [pr(3), pr(4), pr(5)] },
  ];
  const search = (q: string) => sections.map((s) => ({ ...s, prs: s.prs.filter((p) => p.title.includes(q)) }));

  it('counts the rows the search leaves, not the section total', () => {
    const out = sectionStates(search('PR 3'), (s) => s.prs.length, input);
    expect(out.map((s) => [s.key, s.rows, s.empty])).toEqual([
      ['needs', 0, true],
      ['mine', 1, false],
    ]);
  });

  it('closes a section the search empties and reopens it when the search clears', () => {
    const during = sectionStates(search('PR 3'), (s) => s.prs.length, input);
    expect(during.find((s) => s.key === 'needs')?.open).toBe(false);
    const after = sectionStates(search(''), (s) => s.prs.length, input);
    expect(after.find((s) => s.key === 'needs')).toMatchObject({ rows: 2, open: true });
  });

  it('opens a filtered section with rows, but keeps an empty one closed', () => {
    const one = sectionStates(search('PR 3'), (s) => s.prs.length, { ...input, filtered: true, saved: { mine: false } });
    expect(one.map((s) => s.open)).toEqual([false, true]);
  });
});

describe('large title collapse', () => {
  it('maps scroll distance to progress over 56px, clamped', () => {
    expect(collapseProgress(-20)).toBe(0);
    expect(collapseProgress(0)).toBe(0);
    expect(collapseProgress(28)).toBe(0.5);
    expect(collapseProgress(56)).toBe(1);
    expect(collapseProgress(376)).toBe(1);
  });

  it('steps to the nearer state under reduced motion', () => {
    expect(steppedProgress(0.49)).toBe(0);
    expect(steppedProgress(0.5)).toBe(1);
  });

  it('settles a list resting inside the range to the nearer end', () => {
    expect(snapTarget(0)).toBeUndefined();
    expect(snapTarget(56)).toBeUndefined();
    expect(snapTarget(120)).toBeUndefined();
    expect(snapTarget(27)).toBe(0);
    expect(snapTarget(28)).toBe(56);
  });

  it('titles each tab', () => {
    expect(tabTitle('prs')).toBe('Pull requests');
    expect(tabTitle('issues')).toBe('Issues');
    expect(tabTitle('activity')).toBe('Activity');
  });
});
