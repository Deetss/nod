import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateInfo } from '../shared/types';
import { SyncLoop } from '../server/sync-loop';

function setup(budget: () => RateInfo | undefined = () => undefined) {
  const results: Array<boolean | Error> = [];
  const times: number[] = [];
  const poll = vi.fn(async () => {
    times.push(Date.now());
    const next = results.shift() ?? false;
    if (next instanceof Error) throw next;
    return { changed: next };
  });
  const loop = new SyncLoop({ poll, budget }, () => undefined);
  return { loop, results, times, poll };
}

const gaps = (times: number[]) => times.slice(1).map((t, i) => t - (times[i] ?? 0));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SyncLoop', () => {
  it('polls at once, then waits 10, 15, 20, 30 and holds at 30 seconds', async () => {
    const { loop, times } = setup();
    loop.start();
    await vi.advanceTimersByTimeAsync(200_000);
    loop.stop();
    expect(gaps(times).slice(0, 5)).toEqual([10_000, 15_000, 20_000, 30_000, 30_000]);
  });

  it('resets to 10 seconds after a changed poll', async () => {
    const { loop, results, times } = setup();
    results.push(false, false, true);
    loop.start();
    await vi.advanceTimersByTimeAsync(100_000);
    loop.stop();
    expect(gaps(times).slice(0, 4)).toEqual([10_000, 15_000, 10_000, 15_000]);
  });

  it('polls on a nudge and restarts the steps, but not within 10 s of the last poll', async () => {
    const { loop, times } = setup();
    loop.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(loop.nudge()).toBe(false);
    // Polls at 0, 10 and 25 s; the next is due at 45 s. Nudge at 35.5 s.
    await vi.advanceTimersByTimeAsync(34_500);
    expect(times).toHaveLength(3);
    const at = Date.now();
    expect(loop.nudge()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(times).toHaveLength(4);
    expect((times[3] ?? 0) - at).toBe(0);
    // A quiet nudged poll steps from 10 to 15 s, like any first quiet poll.
    await vi.advanceTimersByTimeAsync(15_000);
    loop.stop();
    expect(times).toHaveLength(5);
    expect((times[4] ?? 0) - (times[3] ?? 0)).toBe(15_000);
  });

  it('ignores a nudge when stopped', () => {
    const { loop, poll } = setup();
    expect(loop.nudge()).toBe(false);
    expect(poll).not.toHaveBeenCalled();
  });

  it('keeps the delay after a thrown poll', async () => {
    const { loop, results, times } = setup();
    results.push(false, new Error('boom'), false);
    loop.start();
    await vi.advanceTimersByTimeAsync(200_000);
    loop.stop();
    expect(gaps(times).slice(0, 3)).toEqual([10_000, 10_000, 15_000]);
  });

  it('stretches the wait by the budget factor and leaves the steps alone', async () => {
    const { loop, times } = setup(() => ({ limit: 5000, remaining: 2000, resetAt: '' }));
    loop.start();
    await vi.advanceTimersByTimeAsync(60_000);
    loop.stop();
    expect(gaps(times)).toEqual([20_000, 30_000]);
  });

  it('cancels the pending timer on stop', async () => {
    const { loop, poll } = setup();
    loop.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(poll).toHaveBeenCalledTimes(1);
    loop.stop();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(poll).toHaveBeenCalledTimes(1);
  });
});
