/**
 * Debounce for the composer's Preview. Each call restarts the wait, so the render request goes out
 * once the text has been still for `ms`. `cancel` drops a pending call, and the timer is injectable
 * so the tests run without real time.
 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

export interface TimerApi {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
  timers: TimerApi = realTimers,
): Debounced<A> {
  let handle: unknown;
  const debounced = (...args: A) => {
    if (handle !== undefined) timers.clear(handle);
    handle = timers.set(() => {
      handle = undefined;
      fn(...args);
    }, ms);
  };
  debounced.cancel = () => {
    if (handle !== undefined) timers.clear(handle);
    handle = undefined;
  };
  return debounced;
}

/** The Preview wait, in milliseconds. The brief fixes this at 300. */
export const PREVIEW_DEBOUNCE_MS = 300;
