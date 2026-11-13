import { useCallback, useSyncExternalStore } from 'react';

/** How clock times render. `system` follows the browser locale. */
export type ClockFormat = 'system' | '12h' | '24h';

const KEY = 'nod-clock';

const ORDER: readonly ClockFormat[] = ['system', '12h', '24h'];

export function parseClockFormat(v: string | null | undefined): ClockFormat {
  return v === '12h' || v === '24h' || v === 'system' ? v : 'system';
}

export function loadClockFormat(): ClockFormat {
  try {
    return parseClockFormat(window.localStorage.getItem(KEY));
  } catch {
    return 'system';
  }
}

export function saveClockFormat(f: ClockFormat): void {
  try {
    window.localStorage.setItem(KEY, f);
  } catch {
    // storage unavailable; the choice lasts for this session only
  }
}

export function nextClockFormat(f: ClockFormat): ClockFormat {
  return ORDER[(ORDER.indexOf(f) + 1) % ORDER.length]!;
}

export function clockFormatLabel(f: ClockFormat): string {
  return f === 'system' ? 'system' : f === '12h' ? '12-hour' : '24-hour';
}

export function formatClock(date: Date, format: ClockFormat): string {
  switch (format) {
    case '12h':
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    case '24h':
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    default:
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}

let current: ClockFormat | undefined;
const listeners = new Set<() => void>();

function snapshot(): ClockFormat {
  current ??= loadClockFormat();
  return current;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Shared clock format; every component using it updates together. */
export function useClockFormat(): [ClockFormat, () => void] {
  const format = useSyncExternalStore(subscribe, snapshot);
  const cycle = useCallback(() => {
    current = nextClockFormat(snapshot());
    saveClockFormat(current);
    listeners.forEach((l) => l());
  }, []);
  return [format, cycle];
}
