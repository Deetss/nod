import { describe, expect, it } from 'vitest';
import { buildSummary } from '../shared/status-summary';
import type { CheckItem, PrDetail } from '../shared/types';

const check = (name: string, status: CheckItem['status']): CheckItem => ({ name, status, duration: '' });

const base = {
  checks: [check('build', 'pass'), check('lint', 'pass')],
  thread: [],
  reviewDecision: undefined,
  approvals: 0,
  isOpen: true,
  mergeable: 'MERGEABLE',
  baseRef: 'main',
} as unknown as PrDetail;

const of = (extra: Partial<PrDetail>) => buildSummary({ ...base, ...extra }, false);

describe('buildSummary', () => {
  it('asks for your review, or says it waits on one for your own PR', () => {
    expect(of({}).verdict.headline).toBe('Needs your review');
    expect(buildSummary(base, true).verdict.headline).toBe('Waiting for review');
  });

  it('shows Checks, Threads and Approvals in order', () => {
    expect(of({}).segments.map((s) => [s.label, s.value])).toEqual([
      ['Checks', '2 / 2'],
      ['Threads', '0 open'],
      ['Approvals', '0'],
    ]);
  });

  it('leads with failing checks and opens the checks list', () => {
    const s = of({ checks: [check('test', 'fail'), check('lint', 'pass')] });
    expect(s.verdict).toMatchObject({ tone: 'danger', headline: '1 check failing' });
    expect(s.verdict.sub).toContain('test');
    expect(s.openFirst).toBe('checks');
    expect(s.segments[0]).toMatchObject({ tone: 'danger', fill: 0.5 });
  });

  it('puts conflicts first and swaps Approvals for Conflicts', () => {
    const s = of({ mergeable: 'CONFLICTING', checks: [check('test', 'fail')] });
    expect(s.verdict.headline).toBe('This branch has conflicts');
    expect(s.openFirst).toBe('conflicts');
    expect(s.segments.map((x) => x.key)).toEqual(['checks', 'threads', 'conflicts']);
  });

  it('reads Ready to merge when approved and passing', () => {
    const s = of({ reviewDecision: 'APPROVED', approvals: 2 });
    expect(s.verdict).toMatchObject({ tone: 'success', headline: 'Ready to merge' });
    expect(s.openFirst).toBeUndefined();
  });

  it('flags requested changes', () => {
    expect(of({ reviewDecision: 'CHANGES_REQUESTED', changeRequests: 2 }).verdict).toMatchObject({
      tone: 'attention',
      headline: 'Changes requested',
    });
  });

  it('shows only the verdict for a merged PR', () => {
    const s = of({ isOpen: false, merged: true });
    expect(s.verdict.headline).toBe('Pull request merged');
    expect(s.segments).toEqual([]);
  });
});
