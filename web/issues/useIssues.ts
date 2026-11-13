import { useCallback, useEffect, useMemo, useState } from 'react';
import { deriveIssueSections } from '../../shared/issue-sections';
import { bot, statusOption } from '../org-settings';
import type { IssueInboxData, IssueSection } from '../../shared/issue-types';
import { api } from '../api';
import { keepIfSame } from './stable';

export interface IssuesState {
  data: (IssueInboxData & { sections: IssueSection[] }) | undefined;
  error: string | undefined;
  /** Re-reads the saved issue list. Never makes a GitHub request. */
  reload: () => void;
}

/**
 * The issue list rides on the PR poll: each time `syncedAt` moves, the server has just
 * merged issues into its saved state, so reading it costs nothing. Sections are derived here.
 */
export function useIssues(syncedAt: number | undefined): IssuesState {
  const [raw, setRaw] = useState<IssueInboxData>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .issues()
      .then((d) => {
        if (cancelled) return;
        setRaw((prev) => keepIfSame(prev, d));
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Request failed');
      });
    return () => {
      cancelled = true;
    };
  }, [syncedAt, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const data = useMemo(
    () =>
      raw ? { ...raw, sections: deriveIssueSections(raw.viewer, raw.issues, raw.mentionedIds, statusOption('inProgress'), bot()) } : undefined,
    [raw],
  );
  return { data, error, reload };
}
