import type { CheckItem, DiffFile, PrDetail, PrThreadItem } from '../shared/types';
import { file, FIXTURE_VIEWER, hunk } from './fixture-data';
import type { PrRef } from './provider';

/** Synthetic Merge (bypass) PRs: 372 passes the gate, 373 has a failing check, 374 has no ruleset bypass. */
export const BYPASS_REPO = 'acme-co/orders-api';
export const BYPASS_PR = 372;
const FAILING_PR = 373;
const NO_RULESET_PR = 374;

export const isBypassFixture = (ref: PrRef): boolean =>
  ref.repo === BYPASS_REPO && ref.number >= BYPASS_PR && ref.number <= NO_RULESET_PR;

const BODY =
  'Adds POST /orders/:id/refunds. Amount must be a positive integer in cents; the service rejects a refund larger than the captured total.\n\nTests cover the 422 path and a full refund.';
const BODY_HTML =
  '<p>Adds POST /orders/:id/refunds. Amount must be a positive integer in cents; the service rejects a refund larger than the captured total.</p><p>Tests cover the 422 path and a full refund.</p>';

const CHECK_NAMES = ['build', 'test', 'lint', 'typecheck', 'openapi', 'e2e'];

function checksFor(n: number): CheckItem[] {
  return CHECK_NAMES.map((name) => ({
    name,
    status: n === FAILING_PR && name === 'test' ? 'fail' : 'pass',
    duration: '1m 04s',
  }));
}

function resolvedThread(i: number, path: string, line: number, body: string): PrThreadItem {
  const at = `2026-11-14T1${i}:00:00Z`;
  return {
    kind: 'thread',
    at,
    id: `PRRC_bp${i}`,
    threadId: `PRRT_bp${i}`,
    path,
    line,
    resolved: true,
    isOutdated: false,
    comments: [{ id: `PRRC_bp${i}`, author: 'build-bot', createdAt: at, body, bodyHtml: `<p>${body}</p>` }],
  };
}

const THREADS: PrThreadItem[] = [
  resolvedThread(1, 'src/refunds/handler.ts', 8, 'Reject a zero amount as well.'),
  resolvedThread(2, 'src/refunds/handler.ts', 11, 'Pass the reason through to the service.'),
  resolvedThread(3, 'src/refunds/handler.test.ts', 6, 'Cover the 422 path.'),
];

/** The fields a bypass fixture adds over the shared fixture detail. */
export function bypassFixtureDetail(
  ref: PrRef,
): Pick<PrDetail, 'body' | 'checks' | 'reviewLine'> & Partial<PrDetail> {
  return {
    body: BODY,
    bodyHtml: BODY_HTML,
    checks: checksFor(ref.number),
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'BLOCKED',
    reviewDecision: 'REVIEW_REQUIRED',
    approvals: 0,
    reviewThreadTotal: THREADS.length,
    unresolvedThreads: 0,
    mergeAllowed: { squash: true, merge: true, rebase: false },
    deleteBranchOnMerge: false,
    rulesetBypass: ref.number !== NO_RULESET_PR,
    requiredApprovals: 1,
    thread: THREADS,
    reviewLine: `${FIXTURE_VIEWER}: no review yet`,
  };
}

const HANDLER = file('src/refunds/handler.ts', 13, 0, [
  hunk('@@ -0,0 +1,13 @@', [
    ['add', null, 1, "import { Router } from 'express';"],
    ['add', null, 2, "import { refundOrder } from './service';"],
    ['add', null, 3, ''],
    ['add', null, 4, 'export const refunds = Router();'],
    ['add', null, 5, ''],
    ['add', null, 6, "refunds.post('/orders/:id/refunds', async (req, res) => {"],
    ['add', null, 7, '  const { amount, reason } = req.body;'],
    ['add', null, 8, '  if (!Number.isInteger(amount) || amount <= 0) {'],
    ['add', null, 9, "    return res.status(422).json({ error: 'amount must be positive' });"],
    ['add', null, 10, '  }'],
    ['add', null, 11, '  const refund = await refundOrder(req.params.id, amount, reason);'],
    ['add', null, 12, '  res.status(201).json(refund);'],
    ['add', null, 13, '});'],
  ]),
]);

const HANDLER_TEST = file('src/refunds/handler.test.ts', 8, 0, [
  hunk('@@ -0,0 +1,8 @@', [
    ['add', null, 1, "import { describe, it, expect } from 'vitest';"],
    ['add', null, 2, "import { app } from '../app';"],
    ['add', null, 3, ''],
    ['add', null, 4, "describe('POST /orders/:id/refunds', () => {"],
    ['add', null, 5, "  it('rejects a zero amount', async () => {"],
    ['add', null, 6, "    const res = await app.post('/orders/7/refunds', { amount: 0 });"],
    ['add', null, 7, '    expect(res.status).toBe(422);'],
    ['add', null, 8, '  });'],
  ]),
]);

export const BYPASS_DIFF: DiffFile[] = [HANDLER, HANDLER_TEST];
