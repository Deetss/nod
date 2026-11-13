process.env.TZ = 'UTC';

import { describe, expect, it, vi } from 'vitest';
import {
  formatClock,
  loadClockFormat,
  nextClockFormat,
  parseClockFormat,
  saveClockFormat,
} from '../web/time-format';

const date = new Date(Date.UTC(2026, 10, 8, 17, 58, 0));

describe('formatClock', () => {
  it('renders 12h with a meridiem', () => {
    expect(formatClock(date, '12h').replace(/\s/g, ' ')).toBe('5:58 PM');
  });

  it('renders 24h with two-digit hours', () => {
    expect(formatClock(date, '24h')).toBe('17:58');
  });
});

describe('clock format storage', () => {
  it('falls back to system for a bad stored value', () => {
    expect(parseClockFormat('nonsense')).toBe('system');
    expect(parseClockFormat(null)).toBe('system');
    expect(parseClockFormat('12h')).toBe('12h');
  });

  it('does not throw when storage fails', () => {
    const fail = () => {
      throw new Error('denied');
    };
    vi.stubGlobal('window', { localStorage: { getItem: fail, setItem: fail } });
    expect(loadClockFormat()).toBe('system');
    expect(() => saveClockFormat('24h')).not.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('nextClockFormat', () => {
  it('cycles system, 12h, 24h, system', () => {
    expect(nextClockFormat('system')).toBe('12h');
    expect(nextClockFormat('12h')).toBe('24h');
    expect(nextClockFormat('24h')).toBe('system');
  });
});
