import { useCallback, useRef, useState } from 'react';
import type { IssueAction, IssueActionResult, IssueDetail, SubIssue } from '../../shared/issue-types';
import { applyMove, moveArgs, subRef, targetIndex, type MoveTarget } from '../../shared/sub-issues';

export interface SubIssuesOptions {
  detail: IssueDetail | undefined;
  /** Runs one write and rejects with GitHub's message when it fails. */
  write: (action: IssueAction) => Promise<IssueActionResult>;
  /** Reloads the issue and the list after a write lands. */
  refresh: () => void;
  /** Shows the danger toast. */
  fail: (message: string) => void;
}

/** An issue to link, from the list or a number lookup. */
export interface AddCandidate {
  repo: string;
  number: number;
  title: string;
  /** True when it has another parent, so the add moves it. */
  moves: boolean;
}

export interface SubIssuesApi {
  rows: SubIssue[];
  /** The row whose write is in flight. Other writes wait for it. */
  busyId: string | undefined;
  move: (id: string, to: MoveTarget | number) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  add: (c: AddCandidate) => Promise<boolean>;
  /** Rejects with GitHub's message, so the dialog can show it. */
  create: (repo: string, title: string, body: string) => Promise<IssueActionResult>;
}

/**
 * The open issue's sub-issues with optimistic writes. A change shows at once, the issue reloads when
 * the write lands, and a failed write restores the list and raises the toast. One write at a time.
 */
export function useSubIssues(o: SubIssuesOptions): SubIssuesApi {
  const parent = o.detail?.summary;
  const server = o.detail?.subIssues ?? [];
  const [local, setLocal] = useState<{ base: SubIssue[]; rows: SubIssue[] }>();
  const [busyId, setBusyId] = useState<string>();
  const inFlight = useRef(false);
  const rows = local && local.base === server ? local.rows : server;

  const commit = useCallback(
    async (next: SubIssue[], action: IssueAction, busy: string, failure: string): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setLocal({ base: server, rows: next });
      setBusyId(busy);
      try {
        await o.write(action);
        o.refresh();
        return true;
      } catch {
        setLocal(undefined);
        o.fail(failure);
        return false;
      } finally {
        inFlight.current = false;
        setBusyId(undefined);
      }
    },
    [server, o],
  );

  const move = useCallback(
    async (id: string, to: MoveTarget | number) => {
      const child = rows.find((r) => r.id === id);
      if (!parent || !child) return false;
      const ids = rows.map((r) => r.id);
      const args = moveArgs(ids, id, typeof to === 'number' ? to : targetIndex(ids, id, to));
      if (!args) return false;
      const ref = subRef(child, parent.repo);
      return commit(
        applyMove(rows, id, args),
        { type: 'sub-move', repo: parent.repo, number: parent.number, childId: id, ...args },
        id,
        `Could not move ${ref}: order restored. Try again.`,
      );
    },
    [rows, parent, commit],
  );

  const remove = useCallback(
    async (id: string) => {
      const child = rows.find((r) => r.id === id);
      if (!parent || !child) return false;
      return commit(
        rows.filter((r) => r.id !== id),
        { type: 'sub-remove', repo: parent.repo, number: parent.number, childId: id },
        id,
        `Could not remove ${subRef(child, parent.repo)}: list restored. Try again.`,
      );
    },
    [rows, parent, commit],
  );

  const add = useCallback(
    async (c: AddCandidate) => {
      if (!parent) return false;
      const id = `pending:${c.repo}#${c.number}`;
      const row: SubIssue = { id, repo: c.repo, number: c.number, title: c.title, state: 'open', url: '' };
      return commit(
        [...rows, row],
        { type: 'sub-add', repo: parent.repo, number: parent.number, childRepo: c.repo, childNumber: c.number, replaceParent: c.moves },
        id,
        `Could not add ${subRef(c, parent.repo)}: list restored. Try again.`,
      );
    },
    [rows, parent, commit],
  );

  const create = useCallback(
    async (repo: string, title: string, body: string) => {
      if (!parent) throw new Error('No issue open');
      const res = await o.write({ type: 'sub-create', repo: parent.repo, number: parent.number, childRepo: repo, title, body });
      o.refresh();
      return res;
    },
    [parent, o],
  );

  return { rows, busyId, move, remove, add, create };
}
