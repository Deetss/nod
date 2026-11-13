import { useCallback, useEffect, useState } from 'react';
import type { CloseReason, IssueAction } from '../../shared/issue-types';
import type { PrSummary, ReviewEvent } from '../../shared/types';
import { api } from '../api';

/** How long a result toast stays up. */
export const TOAST_MS = 5000;

export interface Toast {
  ok: boolean;
  message: string;
}

export interface PhoneWrites {
  toast: Toast | undefined;
  busy: boolean;
  notify: (message: string, ok?: boolean) => void;
  review: (pr: PrSummary, event: ReviewEvent, body: string) => Promise<boolean>;
  autoMerge: (pr: PrSummary) => Promise<boolean>;
  adminMerge: (pr: PrSummary) => Promise<boolean>;
  markReady: (pr: PrSummary) => Promise<boolean>;
  /** `fail` prefixes the server message when the call fails: `Could not rename x: <message>`. */
  issue: (action: IssueAction, done: string, fail?: string) => Promise<boolean>;
  closeIssue: (repo: string, number: number, reason: CloseReason) => Promise<boolean>;
  /** Creates an issue. Resolves to undefined when it failed, else the number the server reported, if any. */
  createIssue: (action: Extract<IssueAction, { type: 'create' }>) => Promise<{ number?: number } | undefined>;
}

/** The phone's write calls. Each reports through one toast and returns whether it worked. */
export function usePhoneWrites(onChanged: () => void): PhoneWrites {
  const [toast, setToast] = useState<Toast>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((message: string, ok = true) => setToast({ ok, message }), []);

  const run = useCallback(
    async (call: () => Promise<{ ok: boolean; message: string }>, done?: string, fail?: string): Promise<boolean> => {
      const failed = (why: string) => (fail ? `${fail}: ${why}` : why);
      setBusy(true);
      try {
        const res = await call();
        setToast({ ok: res.ok, message: res.ok ? (done ?? res.message) : failed(res.message) });
        if (res.ok) onChanged();
        return res.ok;
      } catch (e) {
        setToast({ ok: false, message: failed(e instanceof Error ? e.message : 'Action failed') });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const review = useCallback(
    (pr: PrSummary, event: ReviewEvent, body: string) =>
      run(() => api.review(pr.repo, pr.number, event, body), event === 'APPROVE' ? 'Approved' : undefined),
    [run],
  );
  const autoMerge = useCallback((pr: PrSummary) => run(() => api.merge(pr.repo, pr.number)), [run]);
  const adminMerge = useCallback(
    (pr: PrSummary) => run(() => api.adminMerge(pr.repo, pr.number, pr.number)),
    [run],
  );
  const markReady = useCallback((pr: PrSummary) => run(() => api.markReady(pr.repo, pr.number)), [run]);
  const issue = useCallback(
    (action: IssueAction, done: string, fail?: string) => run(() => api.issueAction(action), done, fail),
    [run],
  );
  const closeIssue = useCallback(
    (repo: string, number: number, reason: CloseReason) =>
      run(() => api.issueAction({ type: 'close', repo, number, reason }), 'Issue closed'),
    [run],
  );

  const createIssue = useCallback(
    async (action: Extract<IssueAction, { type: 'create' }>) => {
      const made: { number?: number } = {};
      const ok = await run(
        async () => {
          const res = await api.issueAction(action);
          made.number = res.number;
          return res;
        },
        undefined,
        'Could not create issue',
      );
      return ok ? made : undefined;
    },
    [run],
  );

  return { toast, busy, notify, review, autoMerge, adminMerge, markReady, issue, closeIssue, createIssue };
}
