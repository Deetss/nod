import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MESSAGE_TAG, type PrefillOption } from '../../shared/orca-message';
import type { SendStatus, SessionView } from '../../shared/orca-sessions';
import { api } from '../api';
import type { KeyDef } from '../keys';
import { IssueOrcaStrip, type StripView } from './IssueOrcaStrip';
import { useIssueSessions } from './OrcaContext';
import { SendDialog } from './SendDialog';
import { SessionPicker } from './SessionPicker';

/** A dispatch shows as pending until Orca reports its session, for at most this long. */
export const PENDING_MS = 2 * 60_000;
const TICK_MS = 15_000;

const BLANK: readonly PrefillOption[] = [{ chip: 'blank', label: 'Blank', text: `${MESSAGE_TAG} ` }];

export interface IssueRefForOrca {
  id: string;
  number: number;
}

export interface PendingDispatch {
  name: string;
  at: number;
}

interface Options {
  issue: IssueRefForOrca | undefined;
  pending: PendingDispatch | undefined;
  wide: boolean;
  toast: (t: { ok: boolean; message: string }) => void;
}

export interface IssueOrcaController {
  strip: ReactNode;
  overlays: ReactNode;
  /** A session works on the issue, or a dispatch is pending: Dispatch with Orca goes dashed. */
  live: boolean;
  /** A dialog or the picker owns the keyboard. */
  modal: boolean;
  openInOrca: () => void;
  openSend: () => void;
  hints: KeyDef[];
}

const RESULT: Record<SendStatus, (name: string) => { ok: boolean; message: string }> = {
  sent: (n) => ({ ok: true, message: `Sent to ${n}` }),
  unconfirmed: (n) => ({ ok: true, message: `Sent to ${n}, not confirmed` }),
  'not-writable': (n) => ({ ok: false, message: `${n} has exited. Nothing was sent.` }),
  blocked: (n) => ({ ok: false, message: `${n} is showing a prompt. Nothing was sent.` }),
  unreachable: () => ({ ok: false, message: 'Orca is not reachable. Nothing was sent.' }),
};

/** Picks the strip state from the live sessions, the user's choice among several, and a pending dispatch. */
export function stripViewFor(
  sessions: readonly SessionView[],
  chosen: string | undefined,
  pending: PendingDispatch | undefined,
  now: number,
): StripView | undefined {
  const picked = sessions.find((s) => s.id === chosen) ?? (sessions.length === 1 ? sessions[0] : undefined);
  if (picked) return { kind: 'one', session: picked };
  if (sessions.length > 1) return { kind: 'many', count: sessions.length };
  if (pending && now - pending.at < PENDING_MS) return { kind: 'pending', name: pending.name, at: pending.at };
  return undefined;
}

/** The Orca session strip for the selected issue, with its Send message dialog and picker. */
export function useIssueOrca({ issue, pending, wide, toast }: Options): IssueOrcaController {
  const sessions = useIssueSessions(issue?.id);
  const [chosen, setChosen] = useState<ReadonlyMap<string, string>>(new Map());
  const [dialog, setDialog] = useState<SessionView>();
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const view = issue ? stripViewFor(sessions, chosen.get(issue.id), pending, now) : undefined;
  const session = view?.kind === 'one' ? view.session : undefined;

  // Ages in the strip, and the pending state's expiry, move without a new sessions read.
  const shown = view !== undefined;
  useEffect(() => {
    if (!shown) return;
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [shown]);

  useEffect(() => {
    setDialog(undefined);
    setPicker(false);
  }, [issue?.id]);

  const openInOrca = useCallback(() => {
    if (!session) return;
    api.orcaOpen(session.id).catch(() => toast({ ok: false, message: 'Could not open Orca' }));
  }, [session, toast]);

  const openSend = useCallback(() => {
    if (session && wide) setDialog(session);
  }, [session, wide]);

  const send = useCallback(
    (target: SessionView, text: string) => {
      setBusy(true);
      api
        .orcaSend(target.id, text)
        .then((r) => {
          toast(RESULT[r.status](target.name));
          setDialog(undefined);
        })
        .catch((e: unknown) => toast({ ok: false, message: `Could not send: ${e instanceof Error ? e.message : 'Request failed'}` }))
        .finally(() => setBusy(false));
    },
    [toast],
  );

  const strip =
    issue && view ? (
      <IssueOrcaStrip
        view={view}
        number={issue.number}
        wide={wide}
        now={now}
        onOpen={openInOrca}
        onSend={openSend}
        onChoose={() => setPicker(true)}
      />
    ) : null;

  const overlays = (
    <>
      {picker && issue ? (
        <SessionPicker
          number={issue.number}
          related={sessions}
          possible={[]}
          onChoose={(s) => {
            setChosen((m) => new Map(m).set(issue.id, s.id));
            setPicker(false);
          }}
          onSendOnce={(s) => {
            setPicker(false);
            setDialog(s);
          }}
          onClose={() => setPicker(false)}
        />
      ) : null}
      {dialog ? (
        <SendDialog session={dialog} options={BLANK} busy={busy} onSend={(text) => send(dialog, text)} onCancel={() => setDialog(undefined)} />
      ) : null}
    </>
  );

  const hints = useMemo<KeyDef[]>(() => {
    if (!session) return [];
    const out: KeyDef[] = [{ keys: 'g o', label: 'open in Orca' }];
    if (wide) out.push({ keys: 'g s', label: 'send to Orca' });
    return out;
  }, [session, wide]);

  return {
    strip,
    overlays,
    live: shown,
    modal: picker || dialog !== undefined,
    openInOrca,
    openSend,
    hints,
  };
}
