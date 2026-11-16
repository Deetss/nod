import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bannerOf,
  dispatchText,
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
import type { SendResult } from '../shared/orca-sessions';
import type { PrDetail } from '../shared/types';
import { api } from './api';
import { bot, reviewer } from './org-settings';

/** One action on one thread: not started, running, finished, or failed with a reason. */
export type Step =
  | { s: 'idle' }
  | { s: 'busy' }
  | { s: 'done'; at: number; note?: string; /** The note names a new worktree, not a session. */ worktree?: boolean }
  | { s: 'failed'; message: string };

const IDLE: Step = { s: 'idle' };

export interface Cell {
  hand: Step;
  dispatch: Step;
  resolve: Step;
  /** The reply composer: closed, or open with its draft and post state. */
  reply: { open: boolean; text: string; step: Step };
}

const EMPTY: Cell = { hand: IDLE, dispatch: IDLE, resolve: IDLE, reply: { open: false, text: '', step: IDLE } };

/** What the Orca Send flow offers the findings. Absent when Orca or the repo is not available. */
export interface FindingSender {
  /** Opens the Send flow with this text. False when no session could take it. `where` is the `file:line` the phone sheet shows. */
  send: (text: string, tag: string, where?: string) => boolean;
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
  const { detail, limited, sender, notify, onDone } = o;
  const r = reviewer();
  const b = bot();
  const prId = detail?.summary.id;
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [bulk, setBulk] = useState<{ ids: string[]; busy: boolean; checked: Set<string> }>();

  useEffect(() => {
    setCells({});
    setBulk(undefined);
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

  if (!has) return undefined;
  return {
    groups,
    banner: bannerOf(groups),
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
    onSendResult,
    onDispatched,
  };
}
