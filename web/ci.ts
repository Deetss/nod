import { useEffect, useState } from 'react';
import { formatElapsed } from '../shared/elapsed';
import type { CheckItem } from '../shared/types';

export { formatElapsed };

/** Live elapsed text for a running check, the final duration otherwise. */
export function checkTime(c: CheckItem, now: number): string {
  if (c.status === 'running' && c.startedAt) return formatElapsed(now - Date.parse(c.startedAt));
  return c.duration;
}

export interface CheckCounts {
  running: number;
  queued: number;
  passed: number;
  failed: number;
  total: number;
}

export function countChecks(checks: readonly Pick<CheckItem, 'status'>[]): CheckCounts {
  const n = (s: CheckItem['status']) => checks.filter((c) => c.status === s).length;
  return { running: n('running'), queued: n('queued'), passed: n('pass'), failed: n('fail'), total: checks.length };
}

/** "3 running · 4 passed"; zero counts are left out. */
export function summaryText(c: CheckCounts): string {
  const parts = [
    c.running ? `${c.running} running` : '',
    c.queued ? `${c.queued} queued` : '',
    c.passed ? `${c.passed} passed` : '',
    c.failed ? `${c.failed} failed` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No checks';
}

export const isLive = (c: Pick<CheckItem, 'status'>): boolean => c.status === 'running' || c.status === 'queued';

/** Ticks once a second while `active`, so elapsed timers stay current. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
