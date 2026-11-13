/**
 * Wait between syncs, ms. The loop climbs one step per quiet poll and stays on the last.
 * A delta poll costs a few GraphQL points, so even the 10 s floor stays near a tenth of the hourly budget.
 */
export const DELAY_STEPS_MS: readonly number[] = [10_000, 15_000, 20_000, 30_000];

export const MIN_DELAY_MS = 10_000;
const MAX_DELAY_MS = 30_000;

/** A change drops back to the first step; a quiet poll moves up one, holding at the cap. */
export function nextDelay(current: number, changed: boolean): number {
  if (changed) return MIN_DELAY_MS;
  const next = DELAY_STEPS_MS.find((step) => step > current);
  return next ?? MAX_DELAY_MS;
}

/** How much to stretch the wait when the GitHub budget runs low. Unknown or no limit is 1x. */
export function budgetFactor(remaining: number | undefined, limit: number | undefined): number {
  if (remaining === undefined || limit === undefined || limit <= 0) return 1;
  const fraction = remaining / limit;
  if (fraction < 0.2) return 4;
  if (fraction < 0.5) return 2;
  return 1;
}
