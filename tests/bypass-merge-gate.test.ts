import { describe, expect, it } from 'vitest';
import {
  bypassFields,
  bypassRefusal,
  canBypassMerge,
  reviewAccess,
  type BypassInput,
} from '../shared/pr-actions';
import type { PrDetail } from '../shared/types';

const PASS: BypassInput = {
  author: 'acme-dev',
  viewer: 'acme-dev',
  ci: 'pass',
  isDraft: false,
  state: 'OPEN',
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'BLOCKED',
  reviewDecision: 'REVIEW_REQUIRED',
  unresolvedThreads: 0,
  threadsComplete: true,
  rulesetBypass: true,
};

describe('Merge (bypass) gate', () => {
  it('passes when every row holds', () => {
    expect(canBypassMerge(PASS)).toBe(true);
    expect(bypassRefusal(PASS)).toBeUndefined();
  });

  it.each<[string, Partial<BypassInput>, string]>([
    ['not own PR', { author: 'build-bot' }, 'only the PR author'],
    ['CLOSED', { state: 'CLOSED' }, 'not open'],
    ['MERGED', { state: 'MERGED' }, 'not open'],
    ['draft', { isDraft: true }, 'draft'],
    ['CONFLICTING', { mergeable: 'CONFLICTING' }, 'mergeable'],
    ['UNKNOWN mergeable', { mergeable: 'UNKNOWN' }, 'mergeable'],
    ['BEHIND', { mergeStateStatus: 'BEHIND' }, 'BEHIND'],
    ['DIRTY', { mergeStateStatus: 'DIRTY' }, 'DIRTY'],
    ['UNSTABLE', { mergeStateStatus: 'UNSTABLE' }, 'UNSTABLE'],
    ['CLEAN', { mergeStateStatus: 'CLEAN' }, 'CLEAN'],
    ['rollup FAILURE', { ci: 'fail' }, 'every check'],
    ['rollup PENDING', { ci: 'running' }, 'every check'],
    ['missing rollup', { ci: 'none' }, 'every check'],
    ['APPROVED', { reviewDecision: 'APPROVED' }, 'required review'],
    ['CHANGES_REQUESTED', { reviewDecision: 'CHANGES_REQUESTED' }, 'required review'],
    ['one unresolved thread', { unresolvedThreads: 1 }, 'resolved'],
    ['totalCount 51', { threadsComplete: false }, 'more than 50'],
    ['no bypass', { rulesetBypass: false }, 'ruleset'],
  ])('hides for %s', (_name, change, reason) => {
    const d = { ...PASS, ...change };
    expect(canBypassMerge(d)).toBe(false);
    expect(bypassRefusal(d)).toContain(reason);
  });

  it('compares the author ignoring case', () => {
    expect(canBypassMerge({ ...PASS, author: 'ACME-dev' })).toBe(true);
  });

  it('names the first failing row when several fail', () => {
    expect(bypassRefusal({ ...PASS, ci: 'fail', rulesetBypass: false })).toBe('every check must pass first');
  });
});

describe('review access with bypass', () => {
  it('forces Admin merge hidden when bypass shows', () => {
    const a = reviewAccess({ ...PASS, viewerCanMergeAsAdmin: true });
    expect(a.bypass).toBe(true);
    expect(a.admin).toBe('hidden');
  });

  it('keeps Admin merge when the gate fails', () => {
    const a = reviewAccess({ ...PASS, viewerCanMergeAsAdmin: true, rulesetBypass: false });
    expect(a.bypass).toBe(false);
    expect(a.admin).toBe('ready');
  });

  it('reads no bypass without the bypass fields', () => {
    expect(reviewAccess({ author: 'acme-dev', viewer: 'acme-dev', ci: 'pass' }).bypass).toBe(false);
  });
});

describe('bypass fields from a PR detail', () => {
  const detail = (extra: Partial<PrDetail>) =>
    ({
      isOpen: true,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'BLOCKED',
      reviewDecision: 'REVIEW_REQUIRED',
      reviewThreadTotal: 3,
      unresolvedThreads: 0,
      rulesetBypass: true,
      ...extra,
    }) as PrDetail;

  it('maps an open detail', () => {
    expect(bypassFields(detail({}))).toMatchObject({ state: 'OPEN', threadsComplete: true, rulesetBypass: true });
  });

  it('reads a merged or closed detail as not open', () => {
    expect(bypassFields(detail({ isOpen: false, merged: true })).state).toBe('MERGED');
    expect(bypassFields(detail({ isOpen: false })).state).toBe('CLOSED');
  });

  it('treats a missing or over-limit thread count as incomplete', () => {
    expect(bypassFields(detail({ reviewThreadTotal: undefined })).threadsComplete).toBe(false);
    expect(bypassFields(detail({ reviewThreadTotal: 51 })).threadsComplete).toBe(false);
    expect(bypassFields(detail({ reviewThreadTotal: 50 })).threadsComplete).toBe(true);
  });
});
