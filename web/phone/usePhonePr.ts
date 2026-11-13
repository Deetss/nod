import { useCallback, useMemo, useState } from 'react';
import type { DiffData, FileItem, PrDetail, PrSummary } from '../../shared/types';
import { api } from '../api';
import { useRemote, type Remote } from '../useRemote';
import { treeOrder } from '../tree-state';

export interface PhonePr {
  detail: Remote<PrDetail>;
  diff: Remote<DiffData>;
  /** Files with local viewed marks applied over the server's. */
  files: FileItem[];
  toggleViewed: (path: string, viewed: boolean) => Promise<void>;
  reload: () => void;
}

/** Detail and diff of the open PR, through the same calls the desktop panes use. */
export function usePhonePr(pr: PrSummary | undefined, onError: (m: string) => void): PhonePr {
  const detail = useRemote(pr ? `detail:${pr.id}` : null, () => api.detail(pr?.repo ?? '', pr?.number ?? 0));
  const diff = useRemote(pr ? `diff:${pr.id}:all` : null, () => api.diff(pr?.repo ?? '', pr?.number ?? 0, 'all'));
  const [marks, setMarks] = useState<Record<string, boolean>>({});

  const files = useMemo(
    () => treeOrder((detail.data?.files ?? []).map((f) => ({ ...f, viewed: marks[f.path] ?? f.viewed }))),
    [detail.data, marks],
  );

  const toggleViewed = useCallback(
    async (path: string, viewed: boolean) => {
      if (!pr) return;
      setMarks((m) => ({ ...m, [path]: viewed }));
      const undo = () => setMarks((m) => ({ ...m, [path]: !viewed }));
      try {
        const res = await api.setViewed(pr.id, path, viewed);
        if (!res.ok) {
          undo();
          onError(res.message);
        }
      } catch (e) {
        undo();
        onError(e instanceof Error ? e.message : 'Could not save viewed mark');
      }
    },
    [pr, onError],
  );

  const reload = useCallback(() => {
    detail.reload();
    diff.reload();
  }, [detail, diff]);

  return { detail, diff, files, toggleViewed, reload };
}
