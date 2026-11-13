/** Bulk actions run one request per item, this many at a time. */
export const BULK_CONCURRENCY = 3;

export interface BulkFailure<T> {
  item: T;
  message: string;
}

export interface BulkResult<T> {
  done: T[];
  failed: BulkFailure<T>[];
}

/**
 * Runs `fn` over every item with at most `limit` in flight. A failure never stops the
 * rest, and successes are kept. Results keep the input order.
 */
export async function runBulk<T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>,
  limit: number = BULK_CONCURRENCY,
): Promise<BulkResult<T>> {
  const outcome: (string | undefined)[] = new Array<string | undefined>(items.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      const item = items[i];
      if (i >= items.length || item === undefined) return;
      try {
        await fn(item);
      } catch (e) {
        outcome[i] = e instanceof Error ? e.message : 'Request failed';
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  const result: BulkResult<T> = { done: [], failed: [] };
  items.forEach((item, i) => {
    const message = outcome[i];
    if (message === undefined) result.done.push(item);
    else result.failed.push({ item, message });
  });
  return result;
}
