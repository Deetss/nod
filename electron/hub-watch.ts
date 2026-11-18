/** No Electron import here, so the watch is testable in Node. */

export const CHECK_MS = 10_000;
export const FAILS_TO_DOWN = 2;
export const GOODS_TO_UP = 2;
export const MIN_SWITCH_MS = 30_000;

export type WatchMode = 'hub' | 'local';

export interface WatchActions {
  /** Moves the window to this machine's server. */
  toLocal: () => Promise<void>;
  /** Sends the local seen marks and moves the window back to the hub. A throw keeps local mode. */
  toHub: () => Promise<void>;
  log: (line: string) => void;
}

/**
 * Watches the hub for a desktop that has one. Two failed checks in a row move the window to
 * local mode; two good ones bring it back. Switches are at least 30 s apart, so a flaky hub
 * cannot bounce the window.
 */
export class HubWatch {
  private fails = 0;
  private goods = 0;
  private lastSwitch: number;
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private current: WatchMode,
    private readonly probe: () => Promise<boolean>,
    private readonly actions: WatchActions,
    private readonly now: () => number = Date.now,
  ) {
    this.lastSwitch = now();
  }

  get mode(): WatchMode {
    return this.current;
  }

  start(): void {
    this.timer ??= setInterval(() => void this.check(), CHECK_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One health check. A check already running is shared, never doubled. */
  check(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  /** Retry: checks now, and once more right away if the first was good, so one press can reconnect. */
  async retry(): Promise<void> {
    const from = this.current;
    for (let i = 0; i < GOODS_TO_UP; i++) {
      await this.check();
      if (this.current !== from || this.goods === 0) return;
    }
  }

  private async run(): Promise<void> {
    const ok = await this.probe();
    if (this.current === 'hub') this.fails = ok ? 0 : this.fails + 1;
    else this.goods = ok ? this.goods + 1 : 0;
    const due = this.current === 'hub' ? this.fails >= FAILS_TO_DOWN : this.goods >= GOODS_TO_UP;
    if (!due || this.now() - this.lastSwitch < MIN_SWITCH_MS) return;
    const to: WatchMode = this.current === 'hub' ? 'local' : 'hub';
    try {
      await (to === 'local' ? this.actions.toLocal() : this.actions.toHub());
    } catch (e) {
      this.goods = 0;
      this.actions.log(`[hub] could not switch to ${to}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    this.current = to;
    this.fails = 0;
    this.goods = 0;
    this.lastSwitch = this.now();
  }
}
