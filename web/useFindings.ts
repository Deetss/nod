import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bannerOf,
  dispatchAllOf,
  dispatchAllText,
  dispatchText,
  showDispatchAll,
  groupThreads,
  handBody,
  handStateOf,
  handable,
  reviewerOn,
  type Banner,
  type Finding,
  type HandState,
  type ThreadGroups,
} from '../shared/findings';
import type { ThreadItem } from '../shared/fix-comments';
import type { OrcaDispatchRequest } from '../shared/orca';
import { SEND_MAX, type SendResult, type SessionView } from '../shared/orca-sessions';
import type { PrDetail } from '../shared/types';
import { api } from './api';
import { bot, reviewer } from './org-settings';

/** One action on one thread: not started, running, finished, or failed with a reason. */
export type Step =
  | { s: 'idle' }
  | { s: 'busy' }
  | { s: 'done'; at: number; note?: string; /** The note names a new worktree, not a session. */ worktree?: boolean }
  | { s: 'failed'; message: string; /** Retry reopens Dispatch all with the same ticks and text. */ all?: boolean };

const IDLE: Step = { s: 'idle' };

export interface Cell {
  hand: Step;
  dispatch: Step;
  resolve: Step;
  /** The reply composer: closed, or open with its draft and post state. */
  reply: { open: boolean; text: string; step: Step };
}

const EMPTY: Cell = { hand: IDLE, dispatch: IDLE, resolve: IDLE, reply: { open: false, text: '', step: IDLE } };

/** Where Dispatch all can go for this PR: the one linked session, a choice of sessions, or a new worktree. */
export interface DispatchOffer {
  related: readonly SessionView[];
  possible: readonly SessionView[];
  /** The one linked session, sent to without asking. */
  single?: SessionView;
  agents: readonly string[];
  headRef: string;
}

/** The target Dispatch all confirmed. `remember` saves a related session as this PR's choice. */
export type DispatchTarget =
  | { kind: 'session'; session: SessionView; remember?: boolean }
  | { kind: 'worktree'; request: Omit<OrcaDispatchRequest, 'repo' | 'number'> };

/** A send names its session and Orca's status; a dispatch names its new worktree. */
export type SendAllResult = { name: string; status: SendResult['status'] } | { name: string; worktree: true };

/** What the Orca Send flow offers the findings. Absent when Orca or the repo is not available. */
export interface FindingSender {
  /** Opens the Send flow with this text. False when no session could take it. `where` is the `file:line` the phone sheet shows. */
  send: (text: string, tag: string, where?: string) => boolean;
  offer: DispatchOffer;
  /** One send or one dispatch carrying every ticked finding. Rejects when the request fails. */
  sendAll: (text: string, target: DispatchTarget) => Promise<SendAllResult>;
  /** Phone: opens the session picker sheet and hands back the pick. `once` is a possible session. */
  pick: (then: (s: SessionView, once: boolean) => void) => void;
}

/** The Dispatch all confirm while open. `edited` stops ticks from rebuilding the prompt. */
export interface DispatchAllView {
  repo: string;
  number: number;
  rows: BulkRow[];
  text: string;
  edited: boolean;
  /** Ticks changed after an edit, so the prompt no longer matches them. */
  stale: boolean;
  busy: boolean;
  error: string | undefined;
  offer: DispatchOffer;
  /** Phone: the session the picker sheet named. */
  picked: { session: SessionView; once: boolean } | undefined;
}

export interface BulkRow {
  finding: Finding;
  checked: boolean;
}

export interface FindingControls {
  groups: ThreadGroups;
  banner: Banner;
  /** The bot is on, so Hand to bot and Hand all show. */
  botOn: boolean;
  /** Orca can take a finding, so Dispatch shows. */
  canDispatch: boolean;
  /** The PR can be written to. False offline or when the PR is closed. */
  writable: boolean;
  cell: (id: string) => Cell;
  handState: (t: ThreadItem) => HandState | undefined;
  hand: (f: Finding) => void;
  dispatch: (f: Finding) => void;
  openReply: (id: string, open: boolean) => void;
  draftReply: (id: string, text: string) => void;
  postReply: (t: ThreadItem) => void;
  resolve: (t: ThreadItem) => void;
  /** The bulk confirm: its rows, or undefined while closed. */
  bulk: { rows: BulkRow[]; busy: boolean } | undefined;
  openBulk: () => void;
  closeBulk: () => void;
  toggleBulk: (id: string) => void;
  confirmBulk: () => void;
  /** Dispatch all shows: blocked, Orca can take a message, and 2 or more findings are open. */
  canDispatchAll: boolean;
  /** Findings that went to Orca from this page, for the banner. */
  sentCount: number;
  dispatchAll: DispatchAllView | undefined;
  openDispatchAll: () => void;
  toggleDispatchAll: (id: string) => void;
  editDispatchAll: (text: string) => void;
  rebuildDispatchAll: () => void;
  closeDispatchAll: () => void;
  confirmDispatchAll: (target: DispatchTarget) => void;
  /** A card's Retry after a Dispatch all that may not have landed. */
  retryDispatchAll: () => void;
  /** A Send flow result for a dispatched finding. */
  onSendResult: (tag: string, r: SendResult & { session: { name: string } }) => void;
  /** A finding was dispatched to a new worktree. */
  onDispatched: (tag: string, worktree: string) => void;
}

interface Options {
  detail: PrDetail | undefined;
  /** Rate limited or offline. */
  limited: boolean;
  /** Present when Orca can take a message for this PR. */
  sender?: FindingSender | undefined;
  notify: (ok: boolean, message: string) => void;
  onDone: () => void;
  /** Phone: Dispatch all asks the picker sheet for a session before its own sheet opens. */
  phone?: boolean;
}

interface AllState {
  ids: string[];
  checked: Set<string>;
  text: string;
  edited: boolean;
  stale?: boolean;
  busy: boolean;
  error?: string;
  picked?: { session: SessionView; once: boolean };
}

const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);
/** `09:42`, the local time of a moment. */
export const clock = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/** Why a send did not land, or undefined when it did. */
export function sendFailure(status: SendResult['status'], name: string): string | undefined {
  switch (status) {
    case 'sent':
      return undefined;
    case 'unconfirmed':
      return `Not confirmed: ${name} may not have the message`;
    case 'unreachable':
      return 'Not confirmed: Orca is down';
    case 'blocked':
      return `Not sent: ${name} is showing a prompt`;
    default:
      return `Not sent: ${name} has exited`;
  }
}

/** The tag that ties a Send flow result back to its finding. */
export const tagOf = (prId: string, threadId: string): string => `${prId}|${threadId}`;

/** State behind the finding cards, the merge banner and the bulk confirm. `undefined` while no finding exists. */
export function useFindings(o: Options): FindingControls | undefined {
  const { detail, limited, sender, notify, onDone, phone = false } = o;
  const r = reviewer();
  const b = bot();
  const prId = detail?.summary.id;
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [bulk, setBulk] = useState<{ ids: string[]; busy: boolean; checked: Set<string> }>();

  const [all, setAll] = useState<AllState>();
  const [lastAll, setLastAll] = useState<{ checked: ReadonlySet<string>; text: string; edited: boolean }>();

  useEffect(() => {
    setCells({});
    setBulk(undefined);
    setAll(undefined);
    setLastAll(undefined);
  }, [prId]);

  const groups = useMemo(() => groupThreads(detail?.thread ?? [], r), [detail?.thread, r]);
  const open = detail?.isOpen !== false;
  const writable = open && !limited;
  const has = reviewerOn(r) && groups.open.length + groups.done.length > 0;

  const patch = useCallback((id: string, change: Partial<Cell> | ((c: Cell) => Partial<Cell>)) => {
    setCells((all) => {
      const cur = all[id] ?? EMPTY;
      return { ...all, [id]: { ...cur, ...(typeof change === 'function' ? change(cur) : change) } };
    });
  }, []);
  const cell = useCallback((id: string): Cell => cells[id] ?? EMPTY, [cells]);
  const handState = useCallback((t: ThreadItem) => handStateOf(t, b), [b]);

  const postHand = useCallback(
    async (f: Finding): Promise<boolean> => {
      const { thread } = f;
      if (!detail || !thread.threadId) return false;
      patch(thread.id, { hand: { s: 'busy' } });
      try {
        const res = await api.replyToThread(detail.summary.repo, detail.summary.number, thread.threadId, handBody(f, b));
        if (!res.ok) throw new Error(res.message);
        patch(thread.id, { hand: { s: 'done', at: Date.now() } });
        return true;
      } catch (e) {
        patch(thread.id, { hand: { s: 'failed', message: `Reply failed: ${msg(e, 'Request failed')}` } });
        return false;
      }
    },
    [detail, b, patch],
  );

  const hand = useCallback(
    (f: Finding) => {
      if (!writable || !handable(f) || !b.enabled || cell(f.thread.id).hand.s === 'busy') return;
      void postHand(f).then((ok) => {
        if (ok) {
          notify(true, `Handed ${f.thread.path.split('/').pop() ?? f.thread.path} to ${b.name}`);
          onDone();
        }
      });
    },
    [writable, b, cell, postHand, notify, onDone],
  );

  const dispatch = useCallback(
    (f: Finding) => {
      if (!detail || !sender || !writable) return;
      const { repo, number } = detail.summary;
      const where = `${f.thread.path}${f.thread.line ? `:${f.thread.line}` : ''}`;
      const started = sender.send(dispatchText(f, repo, number), tagOf(detail.summary.id, f.thread.id), where);
      if (started) patch(f.thread.id, { dispatch: IDLE });
      else patch(f.thread.id, { dispatch: { s: 'failed', message: `No Orca session linked to PR #${number}` } });
    },
    [detail, sender, writable, cell, patch],
  );

  const onSendResult = useCallback<FindingControls['onSendResult']>(
    (tagged, res) => {
      const [forPr, id] = tagged.split('|');
      if (forPr !== prId || !id) return;
      const name = res.session.name;
      const failure = sendFailure(res.status, name);
      if (failure === undefined) {
        patch(id, { dispatch: { s: 'done', at: Date.now(), note: name } });
        notify(true, `Dispatched finding to ${name}`);
      } else {
        patch(id, { dispatch: { s: 'failed', message: failure } });
      }
    },
    [prId, patch, notify],
  );

  const onDispatched = useCallback<FindingControls['onDispatched']>(
    (tagged, worktree) => {
      const [forPr, id] = tagged.split('|');
      if (forPr !== prId || !id) return;
      patch(id, { dispatch: { s: 'done', at: Date.now(), note: worktree, worktree: true } });
    },
    [prId, patch],
  );

  const openReply = useCallback((id: string, openIt: boolean) => patch(id, (c) => ({ reply: { ...c.reply, open: openIt } })), [patch]);
  const draftReply = useCallback((id: string, text: string) => patch(id, (c) => ({ reply: { ...c.reply, text } })), [patch]);

  const postReply = useCallback(
    (t: ThreadItem) => {
      const c = cell(t.id);
      if (!detail || !t.threadId || !writable || c.reply.text.trim() === '' || c.reply.step.s === 'busy') return;
      patch(t.id, { reply: { ...c.reply, step: { s: 'busy' } } });
      api
        .replyToThread(detail.summary.repo, detail.summary.number, t.threadId, c.reply.text)
        .then((res) => {
          if (!res.ok) throw new Error(res.message);
          patch(t.id, { reply: { open: false, text: '', step: IDLE } });
          onDone();
        })
        .catch((e: unknown) =>
          patch(t.id, (cur) => ({ reply: { ...cur.reply, step: { s: 'failed', message: `Reply failed: ${msg(e, 'Request failed')}` } } })),
        );
    },
    [detail, writable, cell, patch, onDone],
  );

  const resolve = useCallback(
    (t: ThreadItem) => {
      if (!detail || !t.threadId || !writable || cell(t.id).resolve.s === 'busy') return;
      patch(t.id, { resolve: { s: 'busy' } });
      const { repo, number } = detail.summary;
      const call = t.resolved ? api.unresolveThread(repo, number, t.threadId) : api.resolveThread(repo, number, t.threadId);
      call
        .then((res) => {
          if (!res.ok) throw new Error(res.message);
          patch(t.id, { resolve: IDLE });
          onDone();
        })
        .catch((e: unknown) => patch(t.id, { resolve: { s: 'failed', message: `${t.resolved ? 'Reopen' : 'Resolve'} failed: ${msg(e, 'Request failed')}` } }));
    },
    [detail, writable, cell, patch, onDone],
  );

  const handable_ = useMemo(() => groups.open.filter(handable), [groups.open]);

  const openBulk = useCallback(() => {
    if (!writable || !b.enabled || handable_.length === 0) return;
    setBulk({ ids: handable_.map((f) => f.thread.id), busy: false, checked: new Set(handable_.map((f) => f.thread.id)) });
  }, [writable, b.enabled, handable_]);
  const closeBulk = useCallback(() => setBulk((cur) => (cur?.busy ? cur : undefined)), []);
  const toggleBulk = useCallback(
    (id: string) =>
      setBulk((cur) => {
        if (!cur || cur.busy) return cur;
        const checked = new Set(cur.checked);
        if (checked.has(id)) checked.delete(id);
        else checked.add(id);
        return { ...cur, checked };
      }),
    [],
  );

  const confirmBulk = useCallback(() => {
    if (!bulk || bulk.busy) return;
    const chosen = handable_.filter((f) => bulk.checked.has(f.thread.id));
    if (chosen.length === 0) return;
    setBulk({ ...bulk, busy: true });
    void Promise.all(chosen.map((f) => postHand(f))).then((oks) => {
      setBulk(undefined);
      const done = oks.filter(Boolean).length;
      if (done === chosen.length) notify(true, `Handed ${done} finding${done === 1 ? '' : 's'} to ${b.name}`);
      else notify(false, `Handed ${done} of ${chosen.length}, ${chosen.length - done} failed`);
      if (done > 0) onDone();
    });
  }, [bulk, handable_, postHand, notify, b.name, onDone]);

  const bulkView = useMemo(
    () =>
      bulk
        ? {
            busy: bulk.busy,
            rows: handable_.filter((f) => bulk.ids.includes(f.thread.id)).map((f) => ({ finding: f, checked: bulk.checked.has(f.thread.id) })),
          }
        : undefined,
    [bulk, handable_],
  );

  const eligible = useMemo(() => dispatchAllOf(groups), [groups]);
  const banner = useMemo(() => bannerOf(groups), [groups]);
  const canDispatchAll = writable && showDispatchAll(banner, sender !== undefined, eligible.length);
  const textFor = useCallback(
    (checked: ReadonlySet<string>): string =>
      detail ? dispatchAllText(eligible.filter((f) => checked.has(f.thread.id)), detail.summary.repo, detail.summary.number) : '',
    [detail, eligible],
  );

  const startAll = useCallback(
    (seed?: { checked: ReadonlySet<string>; text: string; edited: boolean }) => {
      if (!canDispatchAll || !sender) return;
      const ids = eligible.map((f) => f.thread.id);
      const checked = new Set(seed ? ids.filter((id) => seed.checked.has(id)) : ids);
      const edited = seed?.edited ?? false;
      const base: AllState = { ids, checked, text: edited && seed ? seed.text : textFor(checked), edited, busy: false };
      const { single, related, possible } = sender.offer;
      if (phone && !single && related.length + possible.length > 0) sender.pick((session, once) => setAll({ ...base, picked: { session, once } }));
      else setAll(base);
    },
    [canDispatchAll, sender, eligible, textFor, phone],
  );
  const openDispatchAll = useCallback(() => startAll(), [startAll]);
  const retryDispatchAll = useCallback(() => startAll(lastAll), [startAll, lastAll]);

  const toggleDispatchAll = useCallback(
    (id: string) =>
      setAll((cur) => {
        if (!cur || cur.busy) return cur;
        const checked = new Set(cur.checked);
        if (checked.has(id)) checked.delete(id);
        else checked.add(id);
        return { ...cur, checked, text: cur.edited ? cur.text : textFor(checked), stale: cur.edited };
      }),
    [textFor],
  );
  const editDispatchAll = useCallback((text: string) => setAll((cur) => (cur && !cur.busy ? { ...cur, text, edited: true } : cur)), []);
  const rebuildDispatchAll = useCallback(
    () => setAll((cur) => (cur && !cur.busy ? { ...cur, text: textFor(cur.checked), edited: false, stale: false } : cur)),
    [textFor],
  );
  const closeDispatchAll = useCallback(() => setAll((cur) => (cur?.busy ? cur : undefined)), []);

  const confirmDispatchAll = useCallback(
    (target: DispatchTarget) => {
      if (!all || all.busy || !sender) return;
      const chosen = eligible.filter((f) => all.checked.has(f.thread.id));
      if (chosen.length === 0 || all.text.trim() === '' || all.text.length > SEND_MAX) return;
      setAll({ ...all, busy: true, error: undefined });
      const mark = (step: Step) => chosen.forEach((f) => patch(f.thread.id, { dispatch: step }));
      const keep = (error: string) => setAll((cur) => (cur ? { ...cur, busy: false, error } : cur));
      const noun = `${chosen.length} finding${chosen.length === 1 ? '' : 's'}`;
      sender
        .sendAll(all.text, target)
        .then((res) => {
          const failure = 'status' in res ? sendFailure(res.status, res.name) : undefined;
          if (failure === undefined) {
            mark({ s: 'done', at: Date.now(), note: res.name, ...('worktree' in res ? { worktree: true } : {}) });
            setAll(undefined);
            notify(true, `Dispatched ${noun} to ${res.name}`);
          } else if ('status' in res && (res.status === 'blocked' || res.status === 'not-writable')) {
            keep(`${failure}. Your text is kept.`);
          } else {
            // The message may have landed, so the cards say so and Retry reopens this confirm.
            setLastAll({ checked: all.checked, text: all.text, edited: all.edited });
            mark({ s: 'failed', message: failure, all: true });
            setAll(undefined);
          }
        })
        .catch((e: unknown) => keep(target.kind === 'worktree' ? msg(e, 'Dispatch failed') : `Could not send: ${msg(e, 'Request failed')}. Your text is kept.`));
    },
    [all, sender, eligible, patch, notify],
  );

  const allView = useMemo<DispatchAllView | undefined>(
    () =>
      all && sender && detail
        ? {
            repo: detail.summary.repo,
            number: detail.summary.number,
            rows: eligible.filter((f) => all.ids.includes(f.thread.id)).map((f) => ({ finding: f, checked: all.checked.has(f.thread.id) })),
            text: all.text,
            edited: all.edited,
            stale: all.stale === true,
            busy: all.busy,
            error: all.error,
            offer: sender.offer,
            picked: all.picked,
          }
        : undefined,
    [all, sender, detail, eligible],
  );
  const sentCount = groups.open.filter((f) => cell(f.thread.id).dispatch.s === 'done').length;

  if (!has) return undefined;
  return {
    groups,
    banner,
    botOn: b.enabled,
    canDispatch: sender !== undefined,
    writable,
    cell,
    handState,
    hand,
    dispatch,
    openReply,
    draftReply,
    postReply,
    resolve,
    bulk: bulkView,
    openBulk,
    closeBulk,
    toggleBulk,
    confirmBulk,
    canDispatchAll,
    sentCount,
    dispatchAll: allView,
    openDispatchAll,
    toggleDispatchAll,
    editDispatchAll,
    rebuildDispatchAll,
    closeDispatchAll,
    confirmDispatchAll,
    retryDispatchAll,
    onSendResult,
    onDispatched,
  };
}
