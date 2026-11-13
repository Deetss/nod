import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  canFix,
  failedStatus,
  failingChecks,
  failingKey,
  botStatus,
  orcaCanFix,
  orcaStatus,
  type FixStatus,
} from '../shared/fix-checks';
import { canResolve, conflictsDispatch } from '../shared/fix-conflicts';
import { DEFAULT_AGENT, repoInOrca, type OrcaDispatchRequest, type OrcaInfo } from '../shared/orca';
import type { CheckItem, PrDetail } from '../shared/types';
import { api } from './api';
import { bot } from './org-settings';
import { repoLabel } from './repo-label';

/** Scope key for the header button and `F`: every failing check. */
export const ALL_FAILING = '*';

export type OrcaChoice = 'absent' | 'unmapped' | 'ready';

export const orcaChoiceFor = (detail: PrDetail | undefined, orca: OrcaInfo | undefined): OrcaChoice =>
  !detail || !orca?.available || !orcaCanFix(detail) ? 'absent' : repoInOrca(orca, detail.summary.repo) ? 'ready' : 'unmapped';
export type FixDialog = 'bot' | 'dispatch';

/** Scope key for the Resolve conflicts button. */
export const RESOLVE_SCOPE = 'conflicts';

/** What a Fix-style button and its menu need. `mode` picks the rows; `busy` locks the menu. */
export interface MenuControls {
  mode?: 'checks' | 'conflicts' | 'comments';
  /** Reason the controls are disabled, e.g. `Offline`. */
  disabled: string | undefined;
  orca: OrcaChoice;
  busy?: boolean;
  /** Comments mode: the row that was picked while busy. */
  busyKind?: FixDialog;
  /** Comments mode: the scope whose button shows the spinner while busy. */
  busyScope?: string;
  /** Comments mode: how many comments the open menu would send. */
  count?: number;
  /** Comments mode: the open menu is the header one, for all comments. */
  all?: boolean;
  /** Scope of the open menu: a check name, ALL_FAILING or RESOLVE_SCOPE. */
  menu: string | undefined;
  openMenu: (scope: string) => void;
  closeMenu: () => void;
  pick: (kind: FixDialog) => void;
}

export interface FixControls extends MenuControls {
  failing: CheckItem[];
  status: FixStatus | undefined;
}

export interface FixDialogState {
  dialog: FixDialog | undefined;
  repo: string;
  number: number;
  headRef: string;
  scope: CheckItem[];
  agents: string[];
  busy: boolean;
  error: string | undefined;
  close: () => void;
  postComment: (comment: string) => void;
  dispatch: (v: Omit<OrcaDispatchRequest, 'repo' | 'number'>) => void;
}

interface Options {
  detail: PrDetail | undefined;
  /** Rate limited or offline; the write controls are disabled. */
  limited: boolean;
  orca: OrcaInfo | undefined;
  notify: (ok: boolean, message: string) => void;
  onDone: () => void;
}

interface Recorded {
  prId: string;
  key: string;
  status: FixStatus;
}

const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

/** State behind the Fix controls on the Checks card, the menu, and both dialogs. */
export function useFixChecks(o: Options): { controls: FixControls | undefined; dialogs: FixDialogState | undefined } {
  const { detail, limited, orca, notify, onDone } = o;
  const [menu, setMenu] = useState<string>();
  const [dialog, setDialog] = useState<FixDialog>();
  const [scopeKey, setScopeKey] = useState<string>(ALL_FAILING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [recorded, setRecorded] = useState<Recorded>();

  const prId = detail?.summary.id;
  const failing = useMemo(() => failingChecks(detail?.checks ?? []), [detail?.checks]);
  const orcaChoice = orcaChoiceFor(detail, orca);
  const botOn = bot().enabled;
  const fixable = detail !== undefined && canFix(detail) && (botOn || orcaChoice !== 'absent');
  const scope = useMemo(
    () => (scopeKey === ALL_FAILING ? failing : failing.filter((c) => c.name === scopeKey)),
    [scopeKey, failing],
  );

  // Menu and dialogs belong to one PR; leaving it or losing the failing checks closes them.
  useEffect(() => {
    setMenu(undefined);
    setDialog(undefined);
    setError(undefined);
  }, [prId]);
  useEffect(() => {
    if (!fixable) {
      setMenu(undefined);
      if (!busy) setDialog(undefined);
    }
  }, [fixable, busy]);

  const disabled = limited ? 'Offline' : undefined;

  const openMenu = useCallback(
    (key: string) => {
      if (!fixable || limited) return;
      setScopeKey(key);
      setError(undefined);
      // With one choice left the menu has nothing to offer.
      if (orcaChoice === 'absent') setDialog('bot');
      else if (!botOn && orcaChoice === 'ready') setDialog('dispatch');
      else setMenu(key);
    },
    [fixable, limited, orcaChoice, botOn],
  );
  const closeMenu = useCallback(() => setMenu(undefined), []);
  const pick = useCallback((kind: FixDialog) => {
    setMenu(undefined);
    setError(undefined);
    setDialog(kind);
  }, []);
  const close = useCallback(() => {
    if (!busy) setDialog(undefined);
  }, [busy]);

  const record = useCallback(
    (status: FixStatus) => {
      if (prId) setRecorded({ prId, key: failingKey(failing), status });
    },
    [prId, failing],
  );

  const postComment = useCallback(
    (comment: string) => {
      if (!detail) return;
      const { repo, number } = detail.summary;
      const ref = `${repoLabel(repo)} #${number}`;
      setBusy(true);
      setError(undefined);
      api
        .prComment(repo, number, comment)
        .then((res) => {
          if (!res.ok) throw new Error(res.message);
          notify(true, res.message);
          record(botStatus(scope.length, bot()));
          setDialog(undefined);
          onDone();
        })
        .catch((e: unknown) => {
          notify(false, `Could not post comment on ${ref}: ${msg(e, 'Request failed')}`);
          record(failedStatus);
        })
        .finally(() => setBusy(false));
    },
    [detail, scope, notify, record, onDone],
  );

  const dispatch = useCallback(
    (v: Omit<OrcaDispatchRequest, 'repo' | 'number'>) => {
      if (!detail) return;
      const { repo, number } = detail.summary;
      setBusy(true);
      setError(undefined);
      api
        .orcaDispatch({ repo, number, ...v })
        .then((res) => {
          notify(true, `Dispatched to ${res.worktree}`);
          record(orcaStatus(res.worktree));
          setDialog(undefined);
        })
        .catch((e: unknown) => {
          const text = msg(e, 'Dispatch failed');
          setError(text);
          notify(false, `Could not dispatch: ${text}`);
          record(failedStatus);
        })
        .finally(() => setBusy(false));
    },
    [detail, notify, record],
  );

  // The status line lasts until the set of failing checks changes or another PR opens.
  const status =
    recorded && recorded.prId === prId && recorded.key === failingKey(failing) ? recorded.status : undefined;

  if (!detail || !fixable) return { controls: undefined, dialogs: undefined };
  return {
    controls: { failing, disabled, orca: orcaChoice, status, menu, openMenu, closeMenu, pick },
    dialogs: {
      dialog,
      repo: detail.summary.repo,
      number: detail.summary.number,
      headRef: detail.headRef,
      scope,
      agents: orca?.agents ?? [],
      busy,
      error,
      close,
      postComment,
      dispatch,
    },
  };
}

interface ResolveOptions {
  detail: PrDetail | undefined;
  limited: boolean;
  orca: OrcaInfo | undefined;
  notify: (ok: boolean, message: string) => void;
}

/** State behind the Resolve conflicts button: one menu and a one-click Orca dispatch. */
export function useResolveConflicts(o: ResolveOptions): MenuControls | undefined {
  const { detail, limited, orca, notify } = o;
  const [menu, setMenu] = useState<string>();
  const [busy, setBusy] = useState(false);
  const prId = detail?.summary.id;
  const conflicting = detail !== undefined && canResolve(detail);
  const orcaChoice = orcaChoiceFor(detail, orca);

  useEffect(() => setMenu(undefined), [prId, conflicting]);

  const openMenu = useCallback(() => {
    if (!limited) setMenu(RESOLVE_SCOPE);
  }, [limited]);
  const closeMenu = useCallback(() => setMenu(undefined), []);

  const pick = useCallback(
    (kind: FixDialog) => {
      if (kind !== 'dispatch' || !detail || busy || orcaChoice !== 'ready') return;
      const { repo, number } = detail.summary;
      const agents = orca?.agents ?? [];
      setBusy(true);
      api
        .orcaDispatch(conflictsDispatch(detail, agents.includes(DEFAULT_AGENT) ? DEFAULT_AGENT : (agents[0] ?? DEFAULT_AGENT)))
        .then(() => {
          setMenu(undefined);
          notify(true, `Dispatched Orca for ${repoLabel(repo)} #${number}`);
        })
        .catch((e: unknown) => {
          setMenu(undefined);
          notify(false, `Could not dispatch: ${msg(e, 'Dispatch failed')}`);
        })
        .finally(() => setBusy(false));
    },
    [detail, busy, orca, orcaChoice, notify],
  );

  if (!conflicting) return undefined;
  return { mode: 'conflicts', disabled: limited ? 'Offline' : undefined, orca: orcaChoice, busy, menu, openMenu, closeMenu, pick };
}
