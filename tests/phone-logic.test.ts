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
  prChips,
  pullOffset,
  resolveOpen,
  shouldRefresh,
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

  it('damps the visual travel and ignores upward drags', () => {
    expect(pullOffset(-10)).toBe(0);
    expect(pullOffset(50)).toBe(30);
    expect(pullOffset(400)).toBe(72);
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
  const sec = (key: string, n: number) => ({ key, prs: Array.from({ length: n }, () => 0) });

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
});
