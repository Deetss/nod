import { useCallback } from 'react';
import type { PrDetail, PrSummary } from '../shared/types';
import { api } from './api';
import { useRemote, type Remote } from './useRemote';

/**
 * A PR's detail in two steps, so switching PRs does not wait on GitHub. The quick answer is
 * the server's cache. When its checks and merge state are cached, a second request fetches
 * fresh ones and its answer replaces the quick one.
 */
export function usePrDetail(pr: PrSummary | undefined): Remote<PrDetail> {
  const repo = pr?.repo ?? '';
  const number = pr?.number ?? 0;
  const quick = useRemote(pr ? `detail:${pr.id}` : null, () => api.detail(repo, number, true));
  const q = quick.data;
  const cached = q?.checksCached === true && q.summary.id === pr?.id;
  const live = useRemote(cached ? `detail-live:${q.summary.id}@${q.summary.updatedAt}` : null, () =>
    api.detail(repo, number),
  );

  const reloadQuick = quick.reload;
  const reloadLive = live.reload;
  const reload = useCallback(() => {
    reloadQuick();
    reloadLive();
  }, [reloadQuick, reloadLive]);

  return {
    data: (cached ? live.data : undefined) ?? q,
    error: quick.error ?? live.error,
    loading: quick.loading,
    reload,
  };
}
