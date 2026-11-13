import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deriveSections } from '../shared/sections';
import type { InboxData, Section } from '../shared/types';
import { api } from './api';
import { useFollowView, type FollowView } from './follow';
import { onLiveEvent } from './live-events';

function parseSyncing(data: string): boolean {
  try {
    return (JSON.parse(data) as { syncing?: boolean }).syncing === true;
  } catch {
    return false;
  }
}

/** The inbox with its sections derived in the browser. */
export interface InboxView extends InboxData {
  sections: Section[];
}

export interface Inbox {
  data: InboxView | undefined;
  error: string | undefined;
  loading: boolean;
  /** True once the first list has arrived. */
  ready: boolean;
  /** Asks the server to sweep every open PR now. */
  reload: (user?: boolean) => void;
  /** True while a refresh the user asked for runs. */
  refreshing: boolean;
  /** True while the server runs any sync, background or asked for. */
  syncing: boolean;
  /** Status chips and the merged-row hold, from the server's follow state. */
  follow: FollowView;
}

/**
 * Reads the server's saved list and refetches it when the server announces a sync on
 * `/api/events`. The server owns the GitHub polling, so no client runs a timer.
 * Filters and search never reach this hook.
 */
export function useInbox(): Inbox {
  const [raw, setRaw] = useState<InboxData>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const refreshingRef = useRef(false);
  const started = useRef(false);

  const fetchList = useCallback(async () => {
    try {
      setRaw(await api.inbox());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // The ref guard keeps StrictMode's second mount from starting a second fetch.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void fetchList().finally(() => setReady(true));
  }, [fetchList]);

  // Coming back to the window asks for a poll; the change notice below then refetches the list.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible') api.nudgeSync().catch(() => undefined);
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, []);

  useEffect(
    () =>
      onLiveEvent('sync', (data) => {
        const starting = parseSyncing(data);
        setSyncing(starting);
        if (!starting) void fetchList();
      }),
    [fetchList],
  );

  const reload = useCallback(
    (user = false) => {
      if (user) {
        if (refreshingRef.current) return;
        refreshingRef.current = true;
        setRefreshing(true);
      }
      setLoading(true);
      api
        .refresh()
        .then(fetchList, (e: unknown) => {
          setError(e instanceof Error ? e.message : 'Request failed');
          setLoading(false);
        })
        .finally(() => {
          if (!user) return;
          refreshingRef.current = false;
          setRefreshing(false);
        });
    },
    [fetchList],
  );

  const follow = useFollowView(raw?.follows);
  const data = useMemo(() => {
    if (!raw) return undefined;
    // A merged PR left the open list; its row stays while the Merged chip holds.
    const listed = new Set(raw.prs.map((p) => p.id));
    const prs = [...raw.prs, ...follow.held.filter((p) => !listed.has(p.id))];
    return { ...raw, sections: deriveSections(raw.viewer, prs, raw.teams) };
  }, [raw, follow.held]);
  return { data, error, loading, ready, reload, refreshing, syncing, follow };
}
