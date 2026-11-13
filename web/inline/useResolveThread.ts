import { useState } from 'react';
import { api } from '../api';

/** Resolve or reopen write state: idle, in flight, or failed with the server's message. */
export type ResolveState = { status: 'idle' } | { status: 'posting' } | { status: 'failed'; error: string };

export const requestError = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

/** The failure line shown under a thread, e.g. `Could not resolve thread: GitHub API error 502`. */
export function resolveFailure(resolved: boolean, error: string): string {
  return `Could not ${resolved ? 'unresolve' : 'resolve'} thread: ${error}`;
}

/**
 * Resolves an open thread or reopens a resolved one. Ignores calls while a write is in flight.
 * `onDone` runs after a successful write, where callers refetch the PR detail.
 */
export function useResolveThread(
  host: { repo: string; number: number },
  threadId: string | undefined,
  resolved: boolean,
  onDone: () => void,
) {
  const [state, setState] = useState<ResolveState>({ status: 'idle' });

  const toggle = async () => {
    if (!threadId || state.status === 'posting') return;
    setState({ status: 'posting' });
    try {
      const r = resolved
        ? await api.unresolveThread(host.repo, host.number, threadId)
        : await api.resolveThread(host.repo, host.number, threadId);
      if (r.ok) {
        setState({ status: 'idle' });
        onDone();
      } else {
        setState({ status: 'failed', error: r.message });
      }
    } catch (e) {
      setState({ status: 'failed', error: requestError(e) });
    }
  };

  return { state, toggle };
}
