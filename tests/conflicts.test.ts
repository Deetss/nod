import { describe, expect, it } from 'vitest';
import { isConflicting } from '../shared/conflicts';
import { toSummary, type RawPr } from '../server/github-map';

describe('isConflicting', () => {
  it('is true for CONFLICTING or DIRTY', () => {
    expect(isConflicting({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' })).toBe(true);
    expect(isConflicting({ mergeable: 'CONFLICTING', mergeStateStatus: 'BLOCKED' })).toBe(true);
    expect(isConflicting({ mergeable: 'MERGEABLE', mergeStateStatus: 'DIRTY' })).toBe(true);
  });

  it('is false for MERGEABLE, UNKNOWN and missing fields', () => {
    expect(isConflicting({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' })).toBe(false);
    expect(isConflicting({ mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' })).toBe(false);
    expect(isConflicting({ mergeable: 'UNKNOWN', mergeStateStatus: 'BEHIND' })).toBe(false);
    expect(isConflicting({})).toBe(false);
  });
});

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

describe('list row conflicting flag', () => {
  it('sets conflicting on the summary from the list fields', () => {
    expect(toSummary({ ...RAW, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }).conflicting).toBe(true);
    expect(toSummary({ ...RAW, mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }).conflicting).toBe(false);
    expect(toSummary(RAW).conflicting).toBe(false);
  });
});
