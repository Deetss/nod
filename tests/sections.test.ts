import { describe, expect, it } from 'vitest';
import { deriveSections, isDependabot } from '../shared/sections';
import type { PrSummary } from '../shared/types';

function pr(id: string, over: Partial<PrSummary> = {}): PrSummary {
  return {
    id,
    repo: 'acme-api',
    number: Number(id.replace(/\D/g, '')) || 1,
    title: 't',
    author: 'build-bot',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    headSha: 'aaa',
    additions: 1,
    deletions: 0,
    changedFiles: 1,
    commitCount: 1,
    ci: 'pass',
    reviewStatus: 'needs review',
    seen: 'seen',
    url: 'u',
    isDraft: false,
    requested: [],
    ...over,
  };
}

const keys = (viewer: string, prs: PrSummary[]) =>
  Object.fromEntries(deriveSections(viewer, prs).map((s) => [s.key, s.prs.map((p) => p.id)]));

describe('deriveSections', () => {
  it('puts a PR that requests the viewer in Needs my review', () => {
    const got = keys('me', [pr('A1', { requested: ['me', 'platform-team'] })]);
    expect(got.needs).toEqual(['A1']);
    expect(got.org).toEqual([]);
  });

  it('does not match a request for someone else', () => {
    expect(keys('me', [pr('A1', { requested: ['you'] })]).needs).toEqual([]);
  });

  it('puts the viewer authored PRs, drafts included, in Mine', () => {
    const got = keys('me', [pr('A1', { author: 'me' }), pr('A2', { author: 'me', isDraft: true })]);
    expect(got.mine).toEqual(['A1', 'A2']);
    expect(got.org).toEqual([]);
  });

  it('puts dependabot PRs in Dependabot, not Org open', () => {
    const got = keys('me', [pr('A1', { author: 'dependabot[bot]' }), pr('A2', { author: 'app/dependabot' })]);
    expect(got.dependabot).toEqual(['A1', 'A2']);
    expect(got.org).toEqual([]);
    expect(isDependabot('dependabot')).toBe(true);
    expect(isDependabot('dependabot-fan')).toBe(false);
  });

  it('puts the remaining non-draft PRs in Org open and hides other drafts', () => {
    const got = keys('me', [pr('A1'), pr('A2', { isDraft: true })]);
    expect(got.org).toEqual(['A1']);
  });

  it('orders each section newest update first and counts members', () => {
    const sections = deriveSections('me', [
      pr('A1', { updatedAt: '2026-11-06T09:00:00Z' }),
      pr('A2', { updatedAt: '2026-11-06T11:00:00Z' }),
    ]);
    const org = sections.find((s) => s.key === 'org');
    expect(org?.prs.map((p) => p.id)).toEqual(['A2', 'A1']);
    expect(org?.count).toBe(2);
  });
});

describe('team review requests', () => {
  it('matches a user request, a team request, and neither', () => {
    const prs = [
      pr('U1', { requested: ['me'] }),
      pr('T1', { requested: ['platform'] }),
      pr('N1', { requested: ['other-team', 'you'] }),
    ];
    const needs = deriveSections('me', prs, ['platform', 'data']).find((s) => s.key === 'needs');
    expect(needs?.prs.map((p) => p.id).sort()).toEqual(['T1', 'U1']);
  });

  it('ignores team requests when the viewer has no teams', () => {
    expect(keys('me', [pr('T1', { requested: ['platform'] })]).needs).toEqual([]);
  });

  it('compares logins without case for requests and authorship', () => {
    const prs = [pr('R1', { requested: ['Me'] }), pr('M1', { author: 'ME' })];
    const sections = deriveSections('me', prs);
    expect(sections.find((s) => s.key === 'needs')?.prs.map((p) => p.id)).toEqual(['R1']);
    expect(sections.find((s) => s.key === 'mine')?.prs.map((p) => p.id)).toEqual(['M1']);
  });

  it('lists a PR with a cut-off reviewer list under Needs my review, unless the viewer wrote it', () => {
    const prs = [
      pr('C1', { requested: ['a', 'b'], requestsTruncated: true }),
      pr('C2', { author: 'me', requested: ['a'], requestsTruncated: true }),
    ];
    const needs = deriveSections('me', prs).find((s) => s.key === 'needs');
    expect(needs?.prs.map((p) => p.id)).toEqual(['C1']);
  });
});
