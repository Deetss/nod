import { commentsNoun } from '../shared/fix-comments';
import { bot } from './org-settings';
import type { MenuControls } from './useFixChecks';

/** One row of a fix menu: the desktop popover and the phone action sheet both draw these. */
export interface FixRow {
  kind: 'bot' | 'dispatch';
  title: string;
  sub: string;
  disabled: boolean;
}

/** What the rows read from the controls. The phone passes a plain object. */
export type FixRowInput = Pick<MenuControls, 'mode' | 'disabled' | 'orca' | 'busy' | 'busyKind' | 'count' | 'all'>;

const DISPATCHING = 'Dispatching...';
const POSTING = 'Posting...';
const UNMAPPED = 'Repo not in Orca';
const CONFLICTS_ORCA_SUB = 'New worktree on the PR branch. The agent merges the base branch and resolves conflicts.';

/**
 * Conflicts mode: Orca first; the bot, when configured, shows disabled since it cannot merge.
 * The Orca row is absent when Orca cannot work on this PR.
 */
function conflictRowsFor(fix: FixRowInput): FixRow[] {
  const b = bot();
  const rows: FixRow[] = [];
  if (fix.orca !== 'absent') {
    const unmapped = fix.orca === 'unmapped';
    rows.push({
      kind: 'dispatch',
      title: 'Dispatch with Orca',
      sub: unmapped ? UNMAPPED : fix.busy ? DISPATCHING : CONFLICTS_ORCA_SUB,
      disabled: unmapped,
    });
  }
  if (b.enabled) {
    rows.push({ kind: 'bot', title: `Ask ${b.name}`, sub: `${b.name} cannot resolve conflicts yet. It has no git merge.`, disabled: true });
  }
  return rows;
}

/** Comments mode: the bot (when configured) then Orca. A picked row shows its progress in the sub line. */
function commentRowsFor(fix: FixRowInput): FixRow[] {
  const b = bot();
  const off = fix.disabled;
  const what = fix.all ? commentsNoun(fix.count ?? 0) : 'this comment';
  const rows: FixRow[] = [];
  if (b.enabled) {
    rows.push({
      kind: 'bot',
      title: `Ask ${b.name}`,
      sub:
        off ??
        (fix.busy && fix.busyKind === 'bot'
          ? POSTING
          : fix.all
            ? `Posts one ${b.command} comment listing ${what}`
            : `Posts ${b.command} asking to fix this comment`),
      disabled: off !== undefined,
    });
  }
  if (fix.orca !== 'absent') {
    const unmapped = fix.orca === 'unmapped';
    rows.push({
      kind: 'dispatch',
      title: 'Dispatch with Orca',
      sub:
        off ??
        (unmapped
          ? UNMAPPED
          : fix.busy && fix.busyKind === 'dispatch'
            ? DISPATCHING
            : `New worktree on the PR branch. The agent fixes ${what}.`),
      disabled: off !== undefined || unmapped,
    });
  }
  return rows;
}

/** Checks mode: the bot (when configured) then Orca. */
function checkRowsFor(fix: FixRowInput): FixRow[] {
  const b = bot();
  const off = fix.disabled;
  const rows: FixRow[] = b.enabled
    ? [{ kind: 'bot', title: `Ask ${b.name}`, sub: off ?? `Posts a ${b.command} comment on the PR`, disabled: off !== undefined }]
    : [];
  if (fix.orca !== 'absent') {
    const unmapped = fix.orca === 'unmapped';
    rows.push({
      kind: 'dispatch',
      title: 'Dispatch with Orca',
      sub: off ?? (unmapped ? UNMAPPED : 'New worktree on the PR branch'),
      disabled: off !== undefined || unmapped,
    });
  }
  return rows;
}

export function fixRowsFor(fix: FixRowInput): FixRow[] {
  if (fix.mode === 'conflicts') return conflictRowsFor(fix);
  if (fix.mode === 'comments') return commentRowsFor(fix);
  return checkRowsFor(fix);
}

export const fixMenuLabel = (fix: Pick<MenuControls, 'mode' | 'all'>): string =>
  fix.mode === 'conflicts'
    ? 'Resolve conflicts'
    : fix.mode === 'comments'
      ? fix.all
        ? 'Fix review comments'
        : 'Fix review comment'
      : 'Fix failing checks';
