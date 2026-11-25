import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { prefillOptions } from '../../shared/orca-message';
import { orcaEnabledFor, type RepoMode } from '../../shared/orca-prefs';
import { SEND_MAX, type NoticeResult, type OrcaPrefsView, type PrSessions, type SessionView } from '../../shared/orca-sessions';
import { carryOffline, LOCAL_ONLY } from './hosts';
import { dispatchedMessage, prWorktreeName, repoInOrca, type OrcaDispatchRequest, type OrcaInfo } from '../../shared/orca';
import type { PrDetail } from '../../shared/types';
import { api } from '../api';
import { DispatchDialog } from '../issues/IssueDialogs';
import { useRemote } from '../useRemote';
import type { ToastInput } from '../toasts';
import { prefillFactsOf } from './facts';
import { OrcaSection, type SendOutcome, type SentNote } from './OrcaSection';
import { hostChoice, type OrcaSessionsValue } from './OrcaContext';
import { SendDialog } from './SendDialog';
import { SessionPicker } from './SessionPicker';
import { sendFailure, type FindingSender } from '../useFindings';
import { PhoneFixDispatch } from '../phone/PhoneFix';
import { PhoneSendSheet } from '../phone/PhoneSendSheet';
import { PhoneSessionPicker } from '../phone/PhoneSessionPicker';

/** The poll cost is two CLI calls on the server, shared by every row. */
export const SESSIONS_POLL_MS = 20_000;

type Prefs = OrcaPrefsView;

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
  /** Sends a review finding through the Send flow. Undefined when Orca cannot take a message for this PR. */
  findingSender: FindingSender | undefined;
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
  /** Called with the tag a finding was sent under, once its Send result is in. */
  onFindingResult?: (tag: string, outcome: SendOutcome) => void;
  /** Phone layout: the Send, picker and dispatch flows open as bottom sheets. */
  phone?: boolean;
  /** Called with the tag a finding was dispatched under and the new worktree's name. */
  onFindingDispatched?: (tag: string, worktree: string) => void;
}

const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

/** Everything behind the Orca session surfaces: polling, the card, the picker, the dialog, results and toasts. */
export function useOrca(o: Options): OrcaController {
  const { detail, orca, active, syncedAt, toast, onFindingResult, onFindingDispatched, phone = false } = o;
  const remote = useRemote(active ? 'orca-sessions' : null, () => api.orcaSessions());
  const { reload } = remote;
  const [localPrefs, setLocalPrefs] = useState<Prefs>();
  const [outcome, setOutcome] = useState<SendOutcome>();
  const [sent, setSent] = useState<SentNote>();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<string>();
  const [dialog, setDialog] = useState<{
    prId: string;
    session: SessionView;
    initialText?: string;
    tag?: string;
    /** Phone: the finding's `file:line` for the sheet header. */
    where?: string;
    /** Phone: a possible session picked for this one send. */
    once?: boolean;
    /** Phone: why the last send did not land. The sheet stays open. */
    error?: string;
  }>();
  /** A finding waiting for the picker to name its session. */
  const [pending, setPending] = useState<{ text: string; tag: string; where?: string }>();
  /** Dispatch all on the phone, waiting for the picker sheet to name its session. */
  const [pickThen, setPickThen] = useState<{ then: (s: SessionView, once: boolean) => void }>();
  const [dispatch, setDispatch] = useState<{ prId: string; text: string; name?: string; tag?: string }>();
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState<string>();

  const hostsRemote = useRemote(active ? 'orca-hosts' : null, () => api.orcaHosts());
  const reloadHosts = hostsRemote.reload;

  useEffect(() => {
    if (!active) return;
    const both = () => {
      reload();
      reloadHosts();
    };
    const tick = setInterval(() => {
      if (document.visibilityState === 'visible') both();
    }, SESSIONS_POLL_MS);
    window.addEventListener('focus', both);
    return () => {
      clearInterval(tick);
      window.removeEventListener('focus', both);
    };
  }, [active, reload, reloadHosts]);

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

  const hosts = hostsRemote.data && hostsRemote.data.length > 0 ? hostsRemote.data : LOCAL_ONLY;
  const carried = useRef<Record<string, PrSessions>>({});
  const byPr = useMemo(() => {
    const out = carryOffline(carried.current, data?.byPr ?? {}, hosts, data?.at ?? 0);
    carried.current = out;
    return out;
  }, [data?.byPr, data?.at, hosts]);

  const setRepoHost = useCallback(
    (repo: string, host: string) => {
      const key = repo.toLowerCase();
      setLocalPrefs((p) => {
        const base = p ?? prefs;
        return { ...base, hosts: { ...base.hosts, [key]: host } };
      });
      void api.orcaPrefs({ repo: key, host }).then(
        () => reload(),
        (e: unknown) => toast({ kind: 'err', message: msg(e, 'Could not save the host') }),
      );
    },
    [prefs, reload, toast],
  );

  const value = useMemo<OrcaSessionsValue>(
    () => ({
      available,
      byPr,
      byIssue: data?.byIssue ?? {},
      hosts,
      hostPrefs: { ...(prefs.hosts ? { hosts: prefs.hosts } : {}), ...(prefs.defaultHost ? { defaultHost: prefs.defaultHost } : {}) },
      setRepoHost,
    }),
    [available, byPr, data?.byIssue, hosts, prefs.hosts, prefs.defaultHost, setRepoHost],
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
    setPending(undefined);
    setPickThen(undefined);
  }, [prId]);

  const single = sessions?.related.length === 1 ? sessions.related[0] : undefined;

  const doSend = useCallback(
    (prIdFor: string, session: SessionView, text: string, requestId?: string, tag?: string) => {
      setBusy(true);
      if (phone) setDialog((d) => (d ? { ...d, error: undefined } : d));
      api
        .orcaSend(session, text, requestId)
        .then((r) => {
          const out = { ...r, prId: prIdFor, session, text };
          setOutcome(out);
          const failure = phone ? sendFailure(r.status, session.name) : undefined;
          if (failure) setDialog((d) => (d ? { ...d, error: `${failure}. Your text is kept.` } : d));
          else setDialog(undefined);
          if (tag) onFindingResult?.(tag, out);
        })
        .catch((e: unknown) => {
          const message = `Could not send: ${msg(e, 'Request failed')}`;
          if (phone) setDialog((d) => (d ? { ...d, error: `${message}. Your text is kept.` } : d));
          else toast({ kind: 'err', message });
        })
        .finally(() => {
          setBusy(false);
          reload();
        });
    },
    [toast, reload, onFindingResult, phone],
  );

  const doCheck = useCallback(
    (o: SendOutcome) => {
      if (!o.requestId) return;
      setBusy(true);
      api
        .orcaConfirm(o.session, o.requestId)
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
    (session?: SessionView, initialText?: string, tag?: string, where?: string, once?: boolean) => {
      if (!prId) return;
      const target = session ?? single;
      if (target) {
        setDialog({
          prId,
          session: target,
          ...(initialText === undefined ? {} : { initialText }),
          ...(tag === undefined ? {} : { tag }),
          ...(where === undefined ? {} : { where }),
          ...(once ? { once } : {}),
        });
      }
      else if ((sessions?.possible.length ?? 0) > 0) setPicker(prId);
    },
    [prId, single, sessions?.possible.length],
  );

  const openInOrca = useCallback(
    (session?: SessionView) => {
      const target = session ?? single;
      if (!target) return;
      api.orcaOpen(target).catch((e: unknown) => toast({ kind: 'err', message: msg(e, 'Could not open Orca') }));
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
      void api.orcaChoose(forPr, s).then(() => reload(), (e: unknown) => toast({ kind: 'err', message: msg(e, 'Could not save the choice') }));
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
        hosts={hosts}
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
  const Picker = phone ? PhoneSessionPicker : SessionPicker;
  const dispatchOpen = dispatch && detail && dispatch.prId === prId ? { dispatch, detail } : undefined;

  const confirmDispatch = (v: Omit<OrcaDispatchRequest, 'repo' | 'number'>) => {
    if (!dispatchOpen) return;
    const { dispatch: d, detail: pr } = dispatchOpen;
    setDispatchBusy(true);
    setDispatchError(undefined);
    api
      .orcaDispatch({ repo: pr.summary.repo, number: pr.summary.number, ...v })
      .then((res) => {
        toast({ kind: 'ok', message: dispatchedMessage(res) });
        if (phone && d.tag) onFindingDispatched?.(d.tag, res.worktree);
        setDispatch(undefined);
        setOutcome(undefined);
      })
      .catch((e: unknown) => setDispatchError(msg(e, 'Dispatch failed')))
      .finally(() => setDispatchBusy(false));
  };

  const overlays: ReactNode = (
    <>
      {picker && pickerSessions && summary ? (
        <Picker
          number={summary.number}
          hosts={hosts}
          related={pickerSessions.related}
          possible={pickerSessions.possible}
          title={pending && pickerSessions.related.length === 0 ? `No Orca session linked to PR #${summary.number}` : undefined}
          onChoose={(s) => {
            choose(picker, s);
            if (pickThen) pickThen.then(s, false);
            else if (pending) openSend(s, pending.text, pending.tag, pending.where);
            setPending(undefined);
            setPickThen(undefined);
          }}
          onSendOnce={(s) => {
            setPicker(undefined);
            if (pickThen) pickThen.then(s, true);
            else openSend(s, pending?.text, pending?.tag, pending?.where, true);
            setPending(undefined);
            setPickThen(undefined);
          }}
          onClose={() => {
            setPicker(undefined);
            setPending(undefined);
            setPickThen(undefined);
          }}
        />
      ) : null}
      {dialog && detail && dialog.prId === prId ? (
        phone ? (
          <PhoneSendSheet
            session={dialog.session}
            options={prefillOptions(prefillFactsOf(detail))}
            sub={dialog.where ?? `${detail.summary.repo} #${detail.summary.number}`}
            initialText={dialog.initialText}
            once={dialog.once}
            busy={busy}
            error={dialog.error}
            onSend={(text) => doSend(dialog.prId, dialog.session, text, undefined, dialog.tag)}
            onCancel={() => setDialog(undefined)}
          />
        ) : (
          <SendDialog
            session={dialog.session}
            options={prefillOptions(prefillFactsOf(detail))}
            initialText={dialog.initialText}
            busy={busy}
            onSend={(text) => doSend(dialog.prId, dialog.session, text, undefined, dialog.tag)}
            onCancel={() => setDialog(undefined)}
          />
        )
      ) : null}
      {dispatchOpen ? (
        phone ? (
          <PhoneFixDispatch
            subject={`${dispatchOpen.detail.summary.repo} #${dispatchOpen.detail.summary.number}`}
            agents={orca?.agents ?? []}
            headRef={dispatchOpen.detail.headRef}
            name={dispatchOpen.dispatch.name ?? prWorktreeName(dispatchOpen.detail.summary.number)}
            prompt={dispatchOpen.dispatch.text}
            max={SEND_MAX}
            busy={dispatchBusy}
            error={dispatchError}
            onDispatch={confirmDispatch}
            onCancel={() => {
              setDispatchError(undefined);
              setDispatch(undefined);
            }}
          />
        ) : (
          <DispatchDialog
            issue={{ repo: dispatchOpen.detail.summary.repo, number: dispatchOpen.detail.summary.number, title: '', url: '' }}
            agents={orca?.agents ?? []}
            busy={dispatchBusy}
            error={dispatchError}
            pr={{
              id: dispatchOpen.detail.summary.id,
              headRef: dispatchOpen.detail.headRef,
              name: dispatchOpen.dispatch.name ?? `pr-${dispatchOpen.detail.summary.number}-message`,
              prompt: dispatchOpen.dispatch.text,
            }}
            onCancel={() => !dispatchBusy && setDispatch(undefined)}
            onConfirm={confirmDispatch}
          />
        )
      ) : null}
    </>
  );

  const findingSender: FindingSender | undefined = shown
    ? {
        send: (text, tag, where) => {
          if (!prId) return false;
          if (single) {
            openSend(single, text, tag, where);
            return true;
          }
          if (sessions && sessions.related.length + sessions.possible.length > 0) {
            setPending({ text, tag, ...(where === undefined ? {} : { where }) });
            setPicker(prId);
            return true;
          }

          // No session to send to, so offer a fresh worktree on the PR branch instead.
          // The phone sheet uses the PR worktree name from the spec.
          setDispatch({ prId, text, tag, ...(phone ? {} : { name: `pr-${summary?.number ?? 0}-finding` }) });
          return true;
        },
        offer: {
          related: sessions?.related ?? [],
          possible: sessions?.possible ?? [],
          ...(single ? { single } : {}),
          agents: orca?.agents ?? [],
          headRef: detail?.headRef ?? '',
          host: hostChoice(value, summary?.repo ?? ''),
          ...(sessions?.idle?.[0] ? { idle: sessions.idle[0] } : {}),
        },
        sendAll: async (text, target) => {
          if (!summary) throw new Error('No pull request');
          if (target.kind === 'worktree') {
            const res = await api.orcaDispatch({ repo: summary.repo, number: summary.number, ...target.request });
            setOutcome(undefined);
            return { name: res.worktree, worktree: true, ...(res.reused ? { reused: { host: res.host ?? 'local' } } : {}) };
          }
          if (target.remember) choose(summary.id, target.session);
          const r = await api.orcaSend(target.session, text);
          setOutcome({ ...r, prId: summary.id, session: target.session, text });
          reload();
          return { name: target.session.name, status: r.status };
        },
        pick: (then) => {
          if (!prId) return;
          setPickThen({ then });
          setPicker(prId);
        },
      }
    : undefined;

  const menu: OrcaMenu | undefined = available
    ? { enabled: prefs.enabled, repos: prefs.repos, repoNames: o.repoNames, onEnabled: setEnabled, onRepo: setRepoMode }
    : undefined;

  return {
    value,
    section,
    overlays,
    modalOpen: picker !== undefined || dialog !== undefined || dispatch !== undefined,
    keys: { send: () => openSend(), open: () => openInOrca() },
    findingSender,
    menu,
    handleNotice,
  };
}
