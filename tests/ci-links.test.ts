import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkTime, countChecks, formatElapsed, summaryText } from '../web/ci';
import { fileAnchor, fileUrl } from '../web/links';
import { liveCi, liveChecks } from '../server/fixture-live-ci';
import { toCheck } from '../server/github-map';

describe('formatElapsed', () => {
  it('formats minutes and padded seconds', () => {
    expect(formatElapsed(72_000)).toBe('1m 12s');
    expect(formatElapsed(5_400)).toBe('0m 05s');
    expect(formatElapsed(-3)).toBe('0m 00s');
  });
});

describe('checkTime', () => {
  const start = '2026-11-06T12:00:00Z';
  const now = Date.parse(start) + 72_000;
  it('ticks from startedAt while running', () => {
    expect(checkTime({ name: 'a', status: 'running', duration: '', startedAt: start }, now)).toBe('1m 12s');
  });
  it('shows the final duration once finished', () => {
    expect(checkTime({ name: 'a', status: 'pass', duration: '3m 40s', startedAt: start }, now)).toBe('3m 40s');
  });
});

describe('check summary', () => {
  const checks = [
    { status: 'running' as const },
    { status: 'running' as const },
    { status: 'running' as const },
    { status: 'pass' as const },
    { status: 'pass' as const },
    { status: 'pass' as const },
    { status: 'pass' as const },
  ];
  it('counts by status', () => {
    expect(countChecks(checks)).toEqual({ running: 3, queued: 0, passed: 4, failed: 0, total: 7 });
  });
  it('words the counts and drops zeros', () => {
    expect(summaryText(countChecks(checks))).toBe('3 running · 4 passed');
    expect(summaryText(countChecks([{ status: 'fail' }, { status: 'queued' }]))).toBe('1 queued · 1 failed');
    expect(summaryText(countChecks([]))).toBe('No checks');
  });
});

describe('link urls', () => {
  it('anchors a file on the SHA-256 hex of its path', async () => {
    const path = 'app/models/unit.rb';
    const hex = createHash('sha256').update(path).digest('hex');
    expect(await fileAnchor(path)).toBe(`diff-${hex}`);
  });
  it('builds the Files changed url from the PR api url', async () => {
    const pr = 'https://github.com/acme-co/acme-api/pull/310';
    expect(await fileUrl(pr, 'a.rb')).toBe(`${pr}/files#${await fileAnchor('a.rb')}`);
  });
  it('takes the check url from detailsUrl or targetUrl', () => {
    const run = toCheck({ __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://x/run/1' });
    expect(run.url).toBe('https://x/run/1');
    const ctx = toCheck({ __typename: 'StatusContext', context: 'ci', state: 'SUCCESS', targetUrl: 'https://x/status/2' });
    expect(ctx.url).toBe('https://x/status/2');
  });
  it('maps queued check runs', () => {
    expect(toCheck({ __typename: 'CheckRun', name: 'q', status: 'QUEUED' }).status).toBe('queued');
  });
});

describe('ci-live fixture', () => {
  it('runs from running to finished in about 30 s', () => {
    const t0 = 1_000_000;
    expect(liveCi(liveChecks(t0, t0 + 1000))).toBe('running');
    const end = liveChecks(t0, t0 + 31_000);
    expect(end.every((c) => c.status === 'pass' || c.status === 'fail')).toBe(true);
    expect(liveCi(end)).toBe('fail');
  });
});
