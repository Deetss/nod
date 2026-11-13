import type { OrcaEventKind } from './orca-message';
import { orcaEnabledFor, type OrcaPrefs } from './orca-prefs';
import type { SessionState } from './orca-sessions';

/** Events that start a turn in an idle (`done`) session. See docs/design/orca-sessions-spec.md section 12.3. */
const IDLE_OK: ReadonlySet<OrcaEventKind> = new Set(['request-changes', 'merge', 'admin-merge', 'issue-close']);

/** Working and waiting sessions always get the message, done sessions only for `IDLE_OK`, unknown never. */
export function stateReceives(kind: OrcaEventKind, state: SessionState): boolean {
  if (state === 'working' || state === 'waiting') return true;
  if (state === 'done') return IDLE_OK.has(kind);
  return false;
}

/** The switch for a repo: its override, else the global box. */
export const autoMessagesOn = (prefs: Pick<OrcaPrefs, 'enabled' | 'repos'>, repo: string): boolean =>
  orcaEnabledFor(prefs, repo);
