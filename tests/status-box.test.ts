import { describe, expect, it } from 'vitest';
import {
  bucketChecks,
  buildStatusBox,
  checksStripText,
  checksTailLabel,
  countsLine,
  orderChecks,
  ringSegments,
  visibleChecks,
} from '../shared/status-box';
import type { CheckItem, PrDetail } from '../shared/types';

type Input = Parameters<typeof buildStatusBox>[0];

const checks = (...s: CheckItem['status'][]): CheckItem[] =>
  s.map((status, i) => ({ name: `check-${i}`, status, duration: '' }));

const open = (over: Partial<Input> = {}): Input => ({
  isOpen: true,
  checks: [],
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  ...over,
});

const rep = (n: number, s: CheckItem['status']): CheckItem['status'][] => Array.from({ length: n }, () => s);

describe('counts line', () => {
  it.each([
    [[...rep(1, 'fail'), 'cancelled', 'skipped', ...rep(14, 'pass')], '1 failing, 1 cancelled, 1 skipped, 14 successful checks'],
    [[...rep(2, 'running'), ...rep(15, 'pass')], '2 pending, 15 successful checks'],
    [rep(17, 'pass'), '17 successful checks'],
    [['pass'], '1 successful check'],
    [['running', 'queued'], '2 pending checks'],
  ] as [CheckItem['status'][], string][])('%j reads %s', (statuses, line) => {
    expect(countsLine(bucketChecks(checks(...statuses)))).toBe(line);
  });

  it('counts cancelled and skipped apart from failing and passed', () => {
    expect(bucketChecks(checks('fail', 'cancelled', 'cancelled', 'skipped', 'pass', 'queued', 'running'))).toEqual({
      failing: 1,
      cancelled: 2,
      pending: 2,
      skipped: 1,
      successful: 1,
      total: 7,
    });
  });
});

describe('checks row', () => {
  it('says some checks were not successful for failing or cancelled', () => {
    expect(buildStatusBox(open({ checks: checks('pass', 'fail') })).checks?.headline).toBe('Some checks were not successful');
    expect(buildStatusBox(open({ checks: checks('pass', 'cancelled') })).checks?.headline).toBe('Some checks were not successful');
  });

  it('says some have not completed when pending and none failing', () => {
    const row = buildStatusBox(open({ checks: checks('pass', 'running') })).checks;
    expect(row?.headline).toBe("Some checks haven't completed yet");
    expect(row?.centre).toBe('spinner');
  });

  it('says all passed when only passes and skips', () => {
    const row = buildStatusBox(open({ checks: checks('pass', 'skipped') })).checks;
    expect(row?.headline).toBe('All checks have passed');
    expect(row?.centre).toBe('check');
  });

  it('is absent with no checks and open by default only for fail or pending', () => {
    expect(buildStatusBox(open()).checks).toBeUndefined();
    expect(buildStatusBox(open({ checks: checks('fail') })).checks?.openByDefault).toBe(true);
    expect(buildStatusBox(open({ checks: checks('queued') })).checks?.openByDefault).toBe(true);
    expect(buildStatusBox(open({ checks: checks('pass', 'skipped') })).checks?.openByDefault).toBe(false);
  });
});

describe('review row and detail rows', () => {
  it('shows changes requested with its count and detail rows', () => {
    const box = buildStatusBox(open({ reviewDecision: 'CHANGES_REQUESTED', changeRequests: 1, pendingReviews: 1 }));
    expect(box.review?.headline).toBe('Changes requested');
    expect(box.review?.sub).toBe('1 change requested by reviewers with write access');
    expect(box.details.map((d) => d.label)).toEqual(['1 requested change', '1 pending review']);
  });

  it('pluralises', () => {
    const box = buildStatusBox(open({ reviewDecision: 'CHANGES_REQUESTED', changeRequests: 2, pendingReviews: 3 }));
    expect(box.review?.sub).toBe('2 changes requested by reviewers with write access');
    expect(box.details.map((d) => d.label)).toEqual(['2 requested changes', '3 pending reviews']);
  });

  it('shows approved and review required copy', () => {
    const ok = buildStatusBox(open({ reviewDecision: 'APPROVED', approvals: 1 })).review;
    expect(ok).toMatchObject({ headline: 'Changes approved', sub: '1 approving review by reviewers with write access', tone: 'success' });
    const need = buildStatusBox(open({ reviewDecision: 'REVIEW_REQUIRED' })).review;
    expect(need).toMatchObject({ headline: 'Review required', tone: 'attention' });
    expect(need?.sub).toBe('At least 1 approving review is required by reviewers with write access');
  });

  it('is absent when no review is required or given, with no detail rows', () => {
    const box = buildStatusBox(open({ pendingReviews: 2 }));
    expect(box.review).toBeUndefined();
    expect(box.details).toEqual([]);
  });

  it('counts at least one change when GitHub reports changes requested without a count', () => {
    expect(buildStatusBox(open({ reviewDecision: 'CHANGES_REQUESTED' })).details[0]?.label).toBe('1 requested change');
  });
});

describe('mergeability row', () => {
  const row = (over: Partial<Input>) => buildStatusBox(open(over)).mergeability;

  it('can merge when clean', () => {
    expect(row({})).toMatchObject({
      tone: 'success',
      headline: 'This branch has no conflicts with the base branch',
      sub: 'Merging can be performed automatically.',
    });
  });

  it('says blocked when review or GitHub blocks it', () => {
    const blocked = 'Merging is blocked by the requirements above.';
    expect(row({ mergeStateStatus: 'BLOCKED' })?.sub).toBe(blocked);
    expect(row({ reviewDecision: 'CHANGES_REQUESTED' })?.sub).toBe(blocked);
    expect(row({ reviewDecision: 'REVIEW_REQUIRED' })?.sub).toBe(blocked);
  });

  it('reports conflicts', () => {
    expect(row({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' })).toMatchObject({
      tone: 'danger',
      glyph: 'alert',
      headline: 'This branch has conflicts that must be resolved',
      sub: 'Resolve the conflicts with Orca, or on GitHub, then refresh.',
    });
  });

  it('reports unknown and missing mergeability as checking', () => {
    for (const mergeable of ['UNKNOWN', undefined]) {
      expect(row({ mergeable })).toMatchObject({
        tone: 'neutral',
        glyph: 'clock',
        headline: 'Checking for conflicts',
        sub: 'GitHub is still computing mergeability.',
      });
    }
  });

  it('reports behind base', () => {
    expect(row({ mergeStateStatus: 'BEHIND' })).toMatchObject({
      tone: 'attention',
      headline: 'This branch is out of date with the base branch',
      sub: 'Update the branch on GitHub to merge.',
    });
  });
});

describe('closed pull requests', () => {
  it('shows one final row and no action bar', () => {
    const merged = buildStatusBox(open({ isOpen: false, merged: true, checks: checks('fail') }));
    expect(merged.final).toMatchObject({ headline: 'Pull request merged', tone: 'done', glyph: 'merge' });
    expect(merged).toMatchObject({ showActions: false, details: [] });
    expect(merged.checks).toBeUndefined();
    expect(buildStatusBox(open({ isOpen: false })).final?.headline).toBe('Pull request closed');
  });

  it('shows the action bar on an open PR', () => {
    expect(buildStatusBox(open()).showActions).toBe(true);
  });
});

describe('checks list order', () => {
  it('orders failing, cancelled, running, queued, skipped, passed', () => {
    const list = orderChecks(checks('pass', 'skipped', 'queued', 'running', 'cancelled', 'fail'));
    expect(list.map((c) => c.status)).toEqual(['fail', 'cancelled', 'running', 'queued', 'skipped', 'pass']);
  });

  it('keeps input order within a group', () => {
    const list = orderChecks(checks('pass', 'pass', 'pass'));
    expect(list.map((c) => c.name)).toEqual(['check-0', 'check-1', 'check-2']);
  });

  it('shows five by default and all when expanded, with the tail label', () => {
    const list = orderChecks(checks('fail', ...rep(16, 'pass')));
    expect(visibleChecks(list, false)).toHaveLength(5);
    expect(visibleChecks(list, true)).toHaveLength(17);
    expect(checksStripText(5, 17)).toBe('Problems first. Showing 5 of 17.');
    expect(checksTailLabel(list, false)).toBe('Show 12 more successful checks');
    expect(checksTailLabel(list, true)).toBe('Show fewer');
    expect(checksTailLabel(orderChecks(checks('pass')), false)).toBeUndefined();
  });

  it('drops "successful" from the tail when something else is hidden', () => {
    const list = orderChecks(checks(...rep(6, 'fail')));
    expect(checksTailLabel(list, false)).toBe('Show 1 more check');
  });
});

describe('ring segments', () => {
  const circumference = 2 * Math.PI * 13.5;

  it('sizes arcs by share in counts order with a 2 unit gap', () => {
    const segs = ringSegments(bucketChecks(checks('fail', 'cancelled', 'skipped', ...rep(5, 'pass'))));
    expect(segs.map((s) => s.key)).toEqual(['failing', 'cancelled', 'skipped', 'successful']);
    expect(segs[0]?.start).toBe(0);
    expect(segs[0]?.length).toBeCloseTo(circumference / 8 - 2, 5);
    expect(segs[3]?.start).toBeCloseTo((circumference * 3) / 8, 5);
    expect(segs[3]?.length).toBeCloseTo((circumference * 5) / 8 - 2, 5);
  });

  it('draws one full ring with no gap for a single group', () => {
    const segs = ringSegments(bucketChecks(checks(...rep(4, 'pass'))));
    expect(segs).toHaveLength(1);
    expect(segs[0]?.length).toBeCloseTo(circumference, 5);
  });

  it('draws nothing without checks', () => {
    expect(ringSegments(bucketChecks([]))).toEqual([]);
  });
});

describe('PrDetail typing', () => {
  it('accepts a detail as the box input', () => {
    const detail = { isOpen: true, checks: [] } as unknown as PrDetail;
    expect(buildStatusBox(detail).showActions).toBe(true);
  });
});
