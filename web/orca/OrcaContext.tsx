import { createContext, useContext } from 'react';
import type { HostStatus } from '../../shared/orca-hosts';
import type { PrSessions, SessionView } from '../../shared/orca-sessions';
import { LOCAL_ONLY, multiHost, offlineWord, worktreeHost, type HostPrefs } from './hosts';
import { OrcaChip, type ChipInput } from './orca-ui';

export interface OrcaSessionsValue {
  /** Orca and its CLI answered. False hides every Orca surface. */
  available: boolean;
  byPr: Readonly<Record<string, PrSessions>>;
  byIssue: Readonly<Record<string, SessionView[]>>;
  /** `local` first, then each paired host. */
  hosts: readonly HostStatus[];
  hostPrefs: HostPrefs;
  /** Stores a repo's host for new worktrees. */
  setRepoHost: (repo: string, host: string) => void;
}

export const OrcaSessionsContext = createContext<OrcaSessionsValue>({
  available: false,
  byPr: {},
  byIssue: {},
  hosts: LOCAL_ONLY,
  hostPrefs: {},
  setRepoHost: () => undefined,
});

/** Live sessions Orca links to an issue. Empty when Orca is absent. */
export function useIssueSessions(issueId: string | undefined): SessionView[] {
  const { available, byIssue } = useContext(OrcaSessionsContext);
  return available && issueId ? (byIssue[issueId] ?? []) : [];
}

/** Where a new worktree for `repo` goes, and the setter the host menu calls. */
export interface HostChoice {
  hosts: readonly HostStatus[];
  multi: boolean;
  host: string;
  fallback?: HostStatus;
  pick: (host: string) => void;
}

export function hostChoice(v: Pick<OrcaSessionsValue, 'hosts' | 'hostPrefs' | 'setRepoHost'>, repo: string): HostChoice {
  const w = worktreeHost(v.hostPrefs, repo, v.hosts);
  return { hosts: v.hosts, multi: multiHost(v.hosts), ...w, pick: (host) => v.setRepoHost(repo, host) };
}

export function useHostChoice(repo: string): HostChoice {
  return hostChoice(useContext(OrcaSessionsContext), repo);
}

/** What the row chip shows: one session, a count when several match, or nothing. Possible matches never show. */
export function chipInputFor(ps: PrSessions | undefined, hosts: readonly HostStatus[] = LOCAL_ONLY): ChipInput | undefined {
  const related = ps?.related ?? [];
  const [first] = related;
  if (!first) return undefined;
  if (related.length > 1) return { kind: 'many', count: related.length };
  const offline = offlineWord(first, hosts);
  return { kind: 'one', session: first, ...(offline ? { offline } : {}) };
}

/** The chip for a PR row, or null when no session is related or Orca is absent. */
export function RowOrcaChip({ prId }: { prId: string }) {
  const { available, byPr, hosts } = useContext(OrcaSessionsContext);
  const input = available ? chipInputFor(byPr[prId], hosts) : undefined;
  return input ? <OrcaChip input={input} /> : null;
}
