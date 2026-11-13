import { describe, expect, it } from 'vitest';
import { budgetFactor, nextDelay } from '../server/sync-delay';

describe('nextDelay', () => {
  it('steps up through 10, 15, 20, 30 while nothing changes', () => {
    expect(nextDelay(10_000, false)).toBe(15_000);
    expect(nextDelay(15_000, false)).toBe(20_000);
    expect(nextDelay(20_000, false)).toBe(30_000);
  });

  it('holds at 30 seconds', () => {
    expect(nextDelay(30_000, false)).toBe(30_000);
  });

  it('resets to 10 seconds on a change', () => {
    expect(nextDelay(30_000, true)).toBe(10_000);
    expect(nextDelay(10_000, true)).toBe(10_000);
  });
});

describe('budgetFactor', () => {
  it('is 1x at exactly 50% and above', () => {
    expect(budgetFactor(2500, 5000)).toBe(1);
    expect(budgetFactor(5000, 5000)).toBe(1);
  });

  it('is 2x just under 50% and at exactly 20%', () => {
    expect(budgetFactor(2499, 5000)).toBe(2);
    expect(budgetFactor(1000, 5000)).toBe(2);
  });

  it('is 4x just under 20% and at zero', () => {
    expect(budgetFactor(999, 5000)).toBe(4);
    expect(budgetFactor(0, 5000)).toBe(4);
  });

  it('is 1x when the budget is unknown or the limit is 0', () => {
    expect(budgetFactor(undefined, undefined)).toBe(1);
    expect(budgetFactor(100, undefined)).toBe(1);
    expect(budgetFactor(undefined, 5000)).toBe(1);
    expect(budgetFactor(0, 0)).toBe(1);
  });
});
