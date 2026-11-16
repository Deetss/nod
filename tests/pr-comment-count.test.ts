import { describe, expect, it } from 'vitest';
import { toSummary, type RawPr } from '../server/github-map';
import { PR_FIELDS } from '../server/queries';
import { fixtureSections } from '../server/fixture-data';

const RAW: RawPr = {
  id: 'PR_1',
  number: 1,
  title: 't',
  url: 'https://example.test/1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  headRefOid: 'abc',
  repository: { name: 'acme-api' },
  author: { login: 'acme-dev' },
  reviewDecision: null,
  approvals: { totalCount: 0 },
  anyReviews: { totalCount: 0 },
  commitCount: { totalCount: 1 },
  lastCommit: { nodes: [] },
};

describe('PR comment count', () => {
  it('asks for top-level conversation comments only', () => {
    expect(PR_FIELDS).toContain('commentCount: comments { totalCount }');
    expect(PR_FIELDS).not.toContain('reviewThreads');
  });

  it('maps the count onto the summary', () => {
    expect(toSummary({ ...RAW, commentCount: { totalCount: 3 } }).commentCount).toBe(3);
    expect(toSummary({ ...RAW, commentCount: { totalCount: 0 } }).commentCount).toBe(0);
  });

  it('leaves the count absent when the field is missing', () => {
    expect('commentCount' in toSummary(RAW)).toBe(false);
  });

  it('carries fixture comment counts and leaves unset seeds without one', () => {
    const s = fixtureSections(Date.parse('2026-11-06T12:00:00Z'));
    const byNumber = (n: number) => [...s.needs, ...s.mine, ...s.org].find((p) => p.number === n);
    expect(byNumber(310)?.commentCount).toBe(3);
    expect(byNumber(1340)?.commentCount).toBe(5);
    expect(byNumber(365)?.commentCount).toBeUndefined();
    expect(s.long.map((p) => p.commentCount)).toEqual([214, undefined]);
  });
});
