import { createContext, useContext } from 'react';
import type { PrSessions, SessionView } from '../../shared/orca-sessions';
import { OrcaChip, type ChipInput } from './orca-ui';

export interface OrcaSessionsValue {
  /** Orca and its CLI answered. False hides every Orca surface. */
  available: boolean;
  byPr: Readonly<Record<string, PrSessions>>;
  byIssue: Readonly<Record<string, SessionView[]>>;
}

export const OrcaSessionsContext = createContext<OrcaSessionsValue>({ available: false, byPr: {}, byIssue: {} });

/** Live sessions Orca links to an issue. Empty when Orca is absent. */
export function useIssueSessions(issueId: string | undefined): SessionView[] {
  const { available, byIssue } = useContext(OrcaSessionsContext);
  return available && issueId ? (byIssue[issueId] ?? []) : [];
}

/** What the row chip shows: one session, a count when several match, or nothing. Possible matches never show. */
export function chipInputFor(ps: PrSessions | undefined): ChipInput | undefined {
  const related = ps?.related ?? [];
  const [first] = related;
  if (!first) return undefined;
  return related.length === 1 ? { kind: 'one', session: first } : { kind: 'many', count: related.length };
}

/** The chip for a PR row, or null when no session is related or Orca is absent. */
export function RowOrcaChip({ prId }: { prId: string }) {
  const { available, byPr } = useContext(OrcaSessionsContext);
  const input = available ? chipInputFor(byPr[prId]) : undefined;
  return input ? <OrcaChip input={input} /> : null;
}
