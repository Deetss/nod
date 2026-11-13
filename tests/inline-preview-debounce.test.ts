import { describe, expect, it } from 'vitest';
import { debounce, PREVIEW_DEBOUNCE_MS, type TimerApi } from '../web/inline/preview-debounce';

/** A fake clock: `set` queues a callback, `tick` runs the ones that are due. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const queue = new Map<number, { at: number; fn: () => void }>();
  const timers: TimerApi = {
    set: (fn, ms) => {
      const id = next++;
      queue.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (h) => {
      queue.delete(h as number);
    },
  };
  return {
    timers,
    tick(ms: number) {
      now += ms;
      for (const [id, t] of [...queue]) {
        if (t.at <= now) {
          queue.delete(id);
          t.fn();
        }
      }
    },
    pending: () => queue.size,
  };
}

describe('preview debounce', () => {
  it('waits 300 ms before the Preview request goes out', () => {
    expect(PREVIEW_DEBOUNCE_MS).toBe(300);
  });

  it('runs once, after the last call, with the last arguments', () => {
    const clock = fakeTimers();
    const calls: string[] = [];
    const d = debounce((t: string) => calls.push(t), 300, clock.timers);
    d('a');
    clock.tick(100);
    d('ab');
    clock.tick(100);
    d('abc');
    clock.tick(299);
    expect(calls).toEqual([]);
    clock.tick(1);
    expect(calls).toEqual(['abc']);
  });

  it('runs again after a quiet gap', () => {
    const clock = fakeTimers();
    const calls: string[] = [];
    const d = debounce((t: string) => calls.push(t), 300, clock.timers);
    d('a');
    clock.tick(300);
    d('b');
    clock.tick(300);
    expect(calls).toEqual(['a', 'b']);
  });

  it('cancel drops the pending call', () => {
    const clock = fakeTimers();
    const calls: string[] = [];
    const d = debounce((t: string) => calls.push(t), 300, clock.timers);
    d('a');
    d.cancel();
    clock.tick(1000);
    expect(calls).toEqual([]);
    expect(clock.pending()).toBe(0);
  });
});
