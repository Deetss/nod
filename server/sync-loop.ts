import type { Provider } from './provider';
import { budgetFactor, MIN_DELAY_MS, nextDelay } from './sync-delay';

const NUDGE_GAP_MS = 10_000;

/**
 * The only timer that reaches GitHub. Clients read the provider's saved lists and
 * get change notices over `/api/events`, so the cost does not grow with the clients.
 * The wait steps up while nothing changes and resets when something does.
 */
export class SyncLoop {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private polled = false;
  private ticking = false;
  private lastTickAt = 0;
  /** The current step, before the budget stretch. */
  private step: number = MIN_DELAY_MS;

  constructor(
    private readonly provider: Pick<Provider, 'poll' | 'budget'>,
    private readonly log: (line: string) => void = console.error,
  ) {}

  /** One delta poll. The provider upgrades it to the hourly full sweep when due. A failed poll keeps the step. */
  async tick(): Promise<void> {
    this.ticking = true;
    this.lastTickAt = Date.now();
    try {
      const { changed } = await this.provider.poll('delta');
      // The first poll only sets the baseline, so the first wait is the start step.
      this.step = this.polled ? nextDelay(this.step, changed) : MIN_DELAY_MS;
      this.polled = true;
    } catch (e) {
      this.log(`[sync] ${e instanceof Error ? e.message : 'poll failed'}`);
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Polls now because someone is looking, unless a poll ran in the last 10 s or is running.
   * The schedule restarts from the first step, so fresh attention gets fresh data.
   */
  nudge(): boolean {
    if (!this.running || this.ticking || Date.now() - this.lastTickAt < NUDGE_GAP_MS) return false;
    if (this.timer) clearTimeout(this.timer);
    this.step = MIN_DELAY_MS;
    void this.next();
    return true;
  }

  private wait(): number {
    const budget = this.provider.budget();
    return this.step * budgetFactor(budget?.remaining, budget?.limit);
  }

  private async next(): Promise<void> {
    await this.tick();
    if (!this.running) return;
    this.timer = setTimeout(() => void this.next(), this.wait());
    this.timer.unref();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.next();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
