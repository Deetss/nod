import { formatElapsed } from '../shared/elapsed';
import type { CheckItem, CiState } from '../shared/types';

interface LiveSpec {
  name: string;
  /** Seconds after the first request that the check starts, and ends. */
  start: number;
  end: number;
  result: 'pass' | 'fail';
}

/** About 30 s from first request to every check finished. */
const SPECS: LiveSpec[] = [
  { name: 'codeql', start: 0, end: 8, result: 'pass' },
  { name: 'lint', start: 0, end: 10, result: 'pass' },
  { name: 'build', start: 0, end: 12, result: 'pass' },
  { name: 'rspec', start: 0, end: 22, result: 'pass' },
  { name: 'e2e', start: 0, end: 26, result: 'fail' },
  { name: 'a11y', start: 10, end: 20, result: 'pass' },
  { name: 'deploy-preview', start: 16, end: 30, result: 'pass' },
];

const url = (name: string) => `https://github.com/acme-co/acme-web/actions/runs/${name}`;

/** Checks as they stand `elapsedMs` after the fixture began. */
export function liveChecks(origin: number, now: number): CheckItem[] {
  const t = (now - origin) / 1000;
  return SPECS.map((s) => {
    const base = { name: s.name, url: url(s.name) };
    if (t < s.start) return { ...base, status: 'queued' as const, duration: '' };
    const startedAt = new Date(origin + s.start * 1000).toISOString();
    if (t < s.end) return { ...base, status: 'running' as const, duration: '', startedAt };
    return {
      ...base,
      status: s.result,
      duration: formatElapsed((s.end - s.start) * 1000),
      startedAt,
    };
  });
}

export function liveCi(checks: readonly CheckItem[]): CiState {
  if (checks.some((c) => c.status === 'running' || c.status === 'queued')) return 'running';
  return checks.some((c) => c.status === 'fail') ? 'fail' : 'pass';
}
