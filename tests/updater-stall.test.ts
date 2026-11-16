import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors electron-updater: a call during an in-flight check gets that same check back.
const fake = vi.hoisted(() => {
  const updater = {
    checkForUpdatesPromise: null as Promise<unknown> | null,
    requests: 0,
    hang: true,
    isUpdaterActive: () => true,
    on: () => undefined,
    checkForUpdates(): Promise<unknown> {
      if (this.checkForUpdatesPromise) return this.checkForUpdatesPromise;
      this.requests++;
      if (!this.hang) return Promise.resolve(null);
      this.checkForUpdatesPromise = new Promise(() => undefined);
      return this.checkForUpdatesPromise;
    },
  };
  return updater;
});
vi.mock('electron-updater', () => ({ autoUpdater: fake }));

import { startUpdater } from '../electron/updater';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  fake.checkForUpdatesPromise = null;
  fake.requests = 0;
  fake.hang = true;
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startUpdater with a stalled check', () => {
  it('times out, then a later check sends a fresh request', async () => {
    const updater = startUpdater({ service: true });
    expect(fake.requests).toBe(1);

    const manual = updater?.check();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(await manual).toEqual({ state: 'failed', error: 'Update check timed out' });

    void updater?.check();
    expect(fake.requests).toBe(2);
  });

  it('retries on its own soon after a stall', async () => {
    startUpdater({ service: true });
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(fake.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(fake.requests).toBe(2);
  });

  it('checks again every hour', async () => {
    fake.hang = false;
    startUpdater({ service: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.requests).toBe(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fake.requests).toBe(2);
  });
});
