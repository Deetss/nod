import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { prefillOptions } from '../../shared/orca-message';
import { orcaEnabledFor, type OrcaPrefs, type RepoMode } from '../../shared/orca-prefs';
import type { NoticeResult, PrSessions, SessionView } from '../../shared/orca-sessions';
import { repoInOrca, type OrcaInfo } from '../../shared/orca';
import type { PrDetail } from '../../shared/types';
import { api } from '../api';
import { DispatchDialog } from '../issues/IssueDialogs';
import { useRemote } from '../useRemote';
import type { ToastInput } from '../toasts';
import { prefillFactsOf } from './facts';
import { OrcaSection, type SendOutcome, type SentNote } from './OrcaSection';
import type { OrcaSessionsValue } from './OrcaContext';
import { SendDialog } from './SendDialog';
import { SessionPicker } from './SessionPicker';

/** The poll cost is two CLI calls on the server, shared by every row. */
export const SESSIONS_POLL_MS = 20_000;

type Prefs = Pick<OrcaPrefs, 'enabled' | 'repos'>;

export interface OrcaMenu {
  enabled: boolean;
  repos: Record<string, 'on' | 'off'>;
  repoNames: string[];
  onEnabled: (on: boolean) => void;
  onRepo: (repo: string, mode: RepoMode) => void;
}

export interface OrcaController {
  /** Context value for the row chips. */
  value: OrcaSessionsValue;
  /** The card or quiet line for the selected PR. Null when there is nothing to show. */
  section: ReactNode;
  /** Picker, Send message dialog and the dispatch fallback. */
  overlays: ReactNode;
  /** A dialog or picker owns the keyboard. */
  modalOpen: boolean;
  keys: { send: () => void; open: () => void };
  /** Settings popover group. Undefined when Orca is absent. */
  menu: OrcaMenu | undefined;
  /** Handles the `noticeId` an action response carries: waits for the result and toasts it. */
  handleNotice: (res: { noticeId?: string }, forPr: boolean) => void;
}

interface Options {
  detail: PrDetail | undefined;
  orca: OrcaInfo | undefined;
  /** Polls while true. */
  active: boolean;
  syncedAt: number | undefined;
  repoNames: string[];
  toast: (t: ToastInput) => void;
  /** Opens the Activity view, for a failed notification's Details. */
  onDetails: () => void;
}

const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

/** Everything behind the Orca session surfaces: polling, the card, the picker, the dialog, results and toasts. */
export function useOrca(o: Options): OrcaController {
  const { detail, orca, active, syncedAt, toast } = o;
  const remote = useRemote(active ? 'orca-sessions' : null, () => api.orcaSessions());
  const { reload } = remote;
  const [localPrefs, setLocalPrefs] = useState<Prefs>();
  const [outcome, setOutcome] = useState<SendOutcome>();
  const [sent, setSent] = useState<SentNote>();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<string>();
  const [dialog, setDialog] = useState<{ prId: string; session: SessionView; initialText?: string }>();
  const [dispatch, setDispatch] = useState<{ prId: string; text: string }>();
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState<string>();

  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, SESSIONS_POLL_MS);
    const focus = () => reload();
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(tick);
      window.removeEventListener('focus', focus);
    };
  }, [active, reload]);

  // A sync or Refresh moves the lists, so the sessions are read again with them.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload();
  }, [syncedAt, reload]);

  const data = remote.data;
  const available = data?.available === true;
  useEffect(() => setLocalPrefs(undefined), [data?.at]);
  const prefs: Prefs = localPrefs ?? data?.prefs ?? { enabled: true, repos: {} };

  const value = useMemo<OrcaSessionsValue>(
    () => ({ available, byPr: data?.byPr ?? {}, byIssue: data?.byIssue ?? {} }),
    [available, data?.byPr, data?.byIssue],
  );

  const summary = detail?.summary;
  const prId = summary?.id;
  const sessions: PrSessions | undefined = prId ? value.byPr[prId] : undefined;
  const mapped = orca ? repoInOrca(orca, summary?.repo ?? '') : true;
  const shown = available && mapped && summary !== undefined && data !== undefined;

  // Dialogs belong to one PR.
  useEffect(() => {
    setPicker(undefined);
    setDialog(undefined);
    setDispatch(undefined);
  }, [prId]);

  const single = sessions?.related.length === 1 ? sessions.related[0] : undefined;

  const doSend = useCallback(
    (prIdFor: string, session: SessionView, text: string, requestId?: string) => {
      setBusy(true);
      api
        .orcaSend(session.id, text, requestId)
        .then((r) => {
          setOutcome({ ...r, prId: prIdFor, session, text });
          setDialog(undefined);
        })
        .catch((e: unknown) => toast({ kind: 'err', message: `Could not send: ${msg(e, 'Request failed')}` }))
        .finally(() => {
          setBusy(false);
          reload();
        });
    },
    [toast, reload],
  );

  const doCheck = useCallback(
    (o: SendOutcome) => {
      if (!o.requestId) return;
      setBusy(true);
      api
        .orcaConfirm(o.session.id, o.requestId)
        .then((r) => {
          setOutcome((cur) => (cur === o ? { ...o, ...r } : cur));
          if (r.status === 'unconfirmed') toast({ kind: 'neutral', message: `Still no sign of the message in ${o.session.name}` });
        })
        .catch((e: unknown) => toast({ kind: 'err', message: `Could not check: ${msg(e, 'Request failed')}` }))
        .finally(() => setBusy(false));
    },
    [toast],
  );

  const openSend = useCallback(
    (session?: SessionView, initialText?: string) => {
      if (!prId) return;
      const target = session ?? single;
      if (target) setDialog({ prId, session: target, ...(initialText === undefined ? {} : { initialText }) });
      else if ((sessions?.possible.length ?? 0) > 0) setPicker(prId);
    },
    [prId, single, sessions?.possible.length],
  );

  const openInOrca = useCallback(
    (session?: SessionView) => {
      const target = session ?? single;
      if (!target) return;
      api.orcaOpen(target.id).catch((e: unknown) => toast({ kind: 'err', message: msg(e, 'Could not open Orca') }));
    },
    [single, toast],
  );

  const setRepoMode = useCallback(
    (repo: string, mode: RepoMode) => {
      setLocalPrefs((p) => {
        const base = p ?? prefs;
        const repos = { ...base.repos };
        if (mode === 'default') delete repos[repo.toLowerCase()];
        else repos[repo.toLowerCase()] = mode;
        return { ...base, repos };
      });
      void api.orcaPrefs({ repo: repo.toLowerCase(), mode }).then(() => reload());
    },
    [prefs, reload],
  );
  const setEnabled = useCallback(
    (on: boolean) => {
      setLocalPrefs((p) => ({ ...(p ?? prefs), enabled: on }));
      void api.orcaPrefs({ enabled: on }).then(() => reload());
    },
    [prefs, reload],
  );

  const choose = useCallback(
    (forPr: string, s: SessionView) => {
      setPicker(undefined);
      void api.orcaChoose(forPr, s.id).then(() => reload(), (e: unknown) => toast({ kind: 'err', message: msg(e, 'Could not save the choice') }));
    },
    [reload, toast],
  );

  const handleNotice = useCallback(
    (res: { noticeId?: string }, forPr: boolean) => {
      if (!res.noticeId || !available) return;
      // The footer note and the picker belong to the open PR. An issue event has neither.
      const id = forPr ? prId : undefined;
      void api
        .orcaNotice(res.noticeId)
        .then((r: NoticeResult) => {
          switch (r.status) {
            case 'notified':
              toast({
                kind: r.confirmed ? 'ok' : 'neutral',
                message: r.confirmed ? `Notified ${r.name} (${r.word})` : `Notified ${r.name} (${r.word}, not confirmed)`,
              });
              if (id) setSent({ prId: id, name: r.name, word: r.word, at: Date.now(), confirmed: r.confirmed });
              break;
            case 'several':
              toast({
                kind: 'neutral',
                message: `${r.count} sessions match, nobody notified`,
                ...(id ? { action: { label: 'Choose', onClick: () => setPicker(id) } } : {}),
              });
              break;
            case 'exited':
              toast({ kind: 'warn', message: `${r.name} has exited, not notified` });
              break;
            case 'failed':
              toast({ kind: 'err', message: `Could not notify ${r.name || 'the session'}`, action: { label: 'Details', onClick: o.onDetails } });
              break;
            default:
              break;
          }
          reload();
        })
        .catch(() => undefined);
    },
    [available, prId, toast, reload, o.onDetails],
  );

  const section: ReactNode =
    shown && summary ? (
      <OrcaSection
        prId={summary.id}
        repo={summary.repo}
        sessions={sessions}
        autoOn={orcaEnabledFor(prefs, summary.repo)}
        outcome={outcome}
        sent={sent}
        busy={busy}
        onSend={() => openSend()}
        onOpen={() => openInOrca()}
        onChoose={() => setPicker(summary.id)}
        onCloseOutcome={() => setOutcome(undefined)}
        onSendAgain={() => outcome && doSend(outcome.prId, outcome.session, outcome.text, outcome.requestId)}
        onCheckAgain={() => outcome && doCheck(outcome)}
        onRetry={() => {
          if (!outcome) return;
          reload();
          setOutcome(undefined);
          openSend(outcome.session, outcome.text);
        }}
        onDispatch={() => outcome && setDispatch({ prId: outcome.prId, text: outcome.text })}
        onCopy={() => {
          if (!outcome) return;
          void navigator.clipboard
            ?.writeText(outcome.text)
            .then(() => toast({ kind: 'ok', message: 'Message copied' }), () => toast({ kind: 'err', message: 'Could not copy the message' }));
        }}
        onTurnOn={() => setRepoMode(summary.repo, 'on')}
      />
    ) : null;

  const pickerSessions = picker && picker === prId ? sessions : undefined;
  const overlays: ReactNode = (
    <>
      {picker && pickerSessions && summary ? (
        <SessionPicker
          number={summary.number}
          related={pickerSessions.related}
          possible={pickerSessions.possible}
          onChoose={(s) => choose(picker, s)}
          onSendOnce={(s) => {
            setPicker(undefined);
            openSend(s);
          }}
          onClose={() => setPicker(undefined)}
        />
      ) : null}
      {dialog && detail && dialog.prId === prId ? (
        <SendDialog
          session={dialog.session}
          options={prefillOptions(prefillFactsOf(detail))}
          initialText={dialog.initialText}
          busy={busy}
          onSend={(text) => doSend(dialog.prId, dialog.session, text)}
          onCancel={() => setDialog(undefined)}
        />
      ) : null}
      {dispatch && detail && dispatch.prId === prId ? (
        <DispatchDialog
          issue={{ repo: detail.summary.repo, number: detail.summary.number, title: '', url: '' }}
          agents={orca?.agents ?? []}
          busy={dispatchBusy}
          error={dispatchError}
          pr={{ headRef: detail.headRef, name: `pr-${detail.summary.number}-message`, prompt: dispatch.text }}
          onCancel={() => !dispatchBusy && setDispatch(undefined)}
          onConfirm={(v) => {
            setDispatchBusy(true);
            setDispatchError(undefined);
            api
              .orcaDispatch({ repo: detail.summary.repo, number: detail.summary.number, ...v })
              .then((res) => {
                toast({ kind: 'ok', message: `Dispatched to ${res.worktree}` });
                setDispatch(undefined);
                setOutcome(undefined);
              })
              .catch((e: unknown) => setDispatchError(msg(e, 'Dispatch failed')))
              .finally(() => setDispatchBusy(false));
          }}
        />
      ) : null}
    </>
  );

  const menu: OrcaMenu | undefined = available
    ? { enabled: prefs.enabled, repos: prefs.repos, repoNames: o.repoNames, onEnabled: setEnabled, onRepo: setRepoMode }
    : undefined;

  return {
    value,
    section,
    overlays,
    modalOpen: picker !== undefined || dialog !== undefined || dispatch !== undefined,
    keys: { send: () => openSend(), open: () => openInOrca() },
    menu,
    handleNotice,
  };
}
