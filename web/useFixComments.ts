import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  commentBot,
  commentPrompt,
  commentWorktreeName,
  commentsNoun,
  fixableThreads,
  inlineThreads,
  shortRef,
  type ThreadItem,
} from '../shared/fix-comments';
import { DEFAULT_AGENT, type OrcaInfo } from '../shared/orca';
import type { PrDetail } from '../shared/types';
import { api } from './api';
import { bot } from './org-settings';
import { orcaChoiceFor, type FixDialog, type MenuControls } from './useFixChecks';
import { repoLabel } from './repo-label';

/** Scope key for the Thread header button: every fixable comment. */
export const ALL_COMMENTS = '*';

/** Fix controls for inline review comments. A comment's scope key is its thread id. */
export interface CommentControls extends MenuControls {
  mode: 'comments';
  /** Thread ids that show a Fix button. */
  fixableIds: ReadonlySet<string>;
  /** Fixable comment count, the N of `Fix N comments`. */
  total: number;
}

interface Options {
  detail: PrDetail | undefined;
  /** Rate limited or offline; the write controls are disabled. */
  limited: boolean;
  orca: OrcaInfo | undefined;
  notify: (ok: boolean, message: string) => void;
  onDone: () => void;
}

const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

/** State behind the Fix buttons on review comments: one menu, and one-click bot or Orca. */
export function useFixComments(o: Options): CommentControls | undefined {
  const { detail, limited, orca, notify, onDone } = o;
  const [menu, setMenu] = useState<string>();
  const [busy, setBusy] = useState<{ scope: string; kind: FixDialog }>();
  const prId = detail?.summary.id;
  const threads = useMemo(() => (detail ? fixableThreads(detail) : []), [detail]);
  const fixableIds = useMemo(() => new Set(threads.map((t) => t.id)), [threads]);
  const orcaChoice = orcaChoiceFor(detail, orca);
  // With no bot configured and no Orca, nothing can fix a comment, so the buttons stay away.
  const shows =
    detail !== undefined &&
    detail.isOpen !== false &&
    inlineThreads(detail).length > 0 &&
    (bot().enabled || orcaChoice !== 'absent');

  useEffect(() => setMenu(undefined), [prId]);
  // A menu for a comment that stops being fixable, or a header menu with none left, closes.
  useEffect(() => {
    if (busy) return;
    if (menu === ALL_COMMENTS ? threads.length === 0 : menu !== undefined && !fixableIds.has(menu)) setMenu(undefined);
  }, [menu, threads, fixableIds, busy]);

  const openMenu = useCallback(
    (scope: string) => {
      if (!limited) setMenu(scope);
    },
    [limited],
  );
  const closeMenu = useCallback(() => setMenu(undefined), []);

  const pick = useCallback(
    (kind: FixDialog) => {
      if (!detail || busy || menu === undefined || (kind === 'dispatch' && orcaChoice !== 'ready')) return;
      const scope = menu;
      const sent: ThreadItem[] = scope === ALL_COMMENTS ? threads : threads.filter((t) => t.id === scope);
      const [first] = sent;
      if (!first) return setMenu(undefined);
      const { repo, number } = detail.summary;
      const ref = `${repoLabel(repo)} #${number}`;
      setBusy({ scope, kind });
      const finish = () => {
        setMenu(undefined);
        setBusy(undefined);
      };
      if (kind === 'bot') {
        const b = bot();
        api
          .prComment(repo, number, commentBot(sent, b))
          .then((res) => {
            if (!res.ok) throw new Error(res.message);
            finish();
            notify(true, `Asked ${b.name} to fix ${sent.length === 1 ? shortRef(first) : commentsNoun(sent.length)}`);
            onDone();
          })
          .catch((e: unknown) => {
            finish();
            notify(false, `Could not post comment on ${ref}: ${msg(e, 'Request failed')}`);
          });
        return;
      }
      const agents = orca?.agents ?? [];
      api
        .orcaDispatch({
          repo,
          number,
          agent: agents.includes(DEFAULT_AGENT) ? DEFAULT_AGENT : (agents[0] ?? DEFAULT_AGENT),
          name: commentWorktreeName(number, sent.length),
          baseBranch: detail.headRef,
          prompt: commentPrompt(repo, number, detail.headRef, sent),
          pr: true,
        })
        .then(() => {
          finish();
          notify(true, `Dispatched Orca for ${ref}`);
        })
        .catch((e: unknown) => {
          finish();
          notify(false, `Could not dispatch: ${msg(e, 'Dispatch failed')}`);
        });
    },
    [detail, busy, menu, threads, orca, orcaChoice, notify, onDone],
  );

  if (!shows) return undefined;
  return {
    mode: 'comments',
    disabled: limited ? 'Offline' : undefined,
    orca: orcaChoice,
    busy: busy !== undefined,
    busyKind: busy?.kind,
    busyScope: busy?.scope,
    count: menu === ALL_COMMENTS ? threads.length : 1,
    all: menu === ALL_COMMENTS,
    menu,
    openMenu,
    closeMenu,
    pick,
    fixableIds,
    total: threads.length,
  };
}
