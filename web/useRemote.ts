import { useCallback, useEffect, useRef, useState } from 'react';
import { keepIfSame } from './issues/stable';

export interface Remote<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
}

const CACHE_LIMIT = 100;
const cache = new Map<string, unknown>();

/** Stores the last successful result for `key`, dropping the oldest entry past the cap. */
export function cacheRemote(key: string, data: unknown): void {
  cache.delete(key);
  cache.set(key, data);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** The cached result for `key`, or undefined. A null key has none. */
export function cachedRemote<T>(key: string | null): T | undefined {
  return key === null ? undefined : (cache.get(key) as T | undefined);
}

interface Held<T> {
  key: string | null;
  data: T | undefined;
}

/**
 * Fetches on mount and whenever `key` changes, and again on `reload()`.
 * Keeps the previous data while a reload is in flight. A null key means idle.
 * A key seen before starts with its cached data, so the first render is not empty.
 */
export function useRemote<T>(key: string | null, load: () => Promise<T>): Remote<T> {
  const [held, setHeld] = useState<Held<T>>(() => ({ key, data: cachedRemote<T>(key) }));
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(key !== null);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  // Until the effect runs for a new key, the cached value for that key is what shows.
  const data = held.key === key ? held.data : cachedRemote<T>(key);

  useEffect(() => {
    if (key === null) {
      setHeld({ key, data: undefined });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadRef
      .current()
      .then((d) => {
        cacheRemote(key, d);
        if (cancelled) return;
        setHeld((prev) => ({ key, data: keepIfSame(prev.key === key ? prev.data : undefined, d) }));
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Request failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
