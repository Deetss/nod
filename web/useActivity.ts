import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVITY_MAX_DAYS, ACTIVITY_WINDOW_DAYS, type ActivityFeed } from '../shared/activity-types';
import { api } from './api';
import type { ActivityHandle } from './activity-ui';

/**
 * The Activity feed. It refetches when `syncedAt` moves, like the issue list, and keeps the last good
 * feed under an error so the cached list stays visible. Opening the view records a visit, but the
 * unread dots keep the previous visit time until the view closes, so they stay readable during the visit.
 */
export function useActivity(syncedAt: number | undefined, active: boolean): ActivityHandle {
  const [feed, setFeed] = useState<ActivityFeed>();
  const [error, setError] = useState<string>();
  const [days, setDays] = useState(ACTIVITY_WINDOW_DAYS);
  const [tick, setTick] = useState(0);
  const [frozen, setFrozen] = useState<number>();
  const visited = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .activity(days)
      .then((f) => {
        if (cancelled) return;
        setFeed(f);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Request failed');
      });
    return () => {
      cancelled = true;
    };
  }, [syncedAt, days, tick]);

  const loaded = feed !== undefined;
  const lastVisit = feed?.lastVisit;
  useEffect(() => {
    if (!active) {
      visited.current = false;
      setFrozen(undefined);
      return;
    }
    if (!loaded || visited.current) return;
    visited.current = true;
    setFrozen(lastVisit ?? 0);
    api
      .activityVisit()
      .then(() => setTick((t) => t + 1))
      .catch(() => undefined);
  }, [active, loaded, lastVisit]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loadOlder = useCallback(() => setDays((d) => Math.min(ACTIVITY_MAX_DAYS, d + ACTIVITY_WINDOW_DAYS)), []);
  return { feed, error, lastVisit: frozen ?? feed?.lastVisit ?? 0, reload, loadOlder };
}
