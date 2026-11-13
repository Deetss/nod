import { useEffect, useRef } from 'react';
import { isTyping } from '../hooks';

export interface IssueHotkeys {
  next: () => void;
  prev: () => void;
  open: () => void;
  toggleSelect: () => void;
  comment: () => void;
  labels: () => void;
  assign: () => void;
  assignMe: () => void;
  milestone: () => void;
  status: () => void;
  toggleWork: () => void;
  dispatch: () => void;
  bot: () => void;
  botRetry: () => void;
  botSplit: () => void;
  /** `K`: starts a bot check. */
  botCheck: () => void;
  editTitle: () => void;
  close: () => void;
  notPlanned: () => void;
  reopen: () => void;
  newIssue: () => void;
  newSubIssue: () => void;
  addSubIssue: () => void;
  goParent: () => void;
  filter: () => void;
  search: () => void;
  help: () => void;
  escape: () => void;
  nextComment: () => void;
  prevComment: () => void;
  metadata: () => void;
  more: () => void;
  openGithub: () => void;
  refresh: () => void;
  goPrs: () => void;
  /** `W`: cycles the closed section's window. */
  closedWindow: () => void;
  pair: () => void;
  /** `g o` and `g s`: the bare keys are Reopen and Status here. */
  orcaOpen: () => void;
  orcaSend: () => void;
}

/** Window-level key map for the Issues view. Off while a dialog or picker owns the keyboard. */
export function useIssueHotkeys(handlers: IssueHotkeys, enabled: boolean): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  const gPending = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      document.documentElement.dataset.kb = '1';
      if (!enabled || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;
      const h = ref.current;
      const onButton = e.target instanceof HTMLElement && e.target.closest('button, a, summary');

      if (gPending.current && Date.now() - gPending.current < 1000) {
        gPending.current = 0;
        if (e.key === 'p') {
          e.preventDefault();
          h.goPrs();
          return;
        }
        if (e.key === 'i') {
          e.preventDefault();
          return;
        }
        if (e.key === 'o') {
          e.preventDefault();
          h.orcaOpen();
          return;
        }
        if (e.key === 's') {
          e.preventDefault();
          h.orcaSend();
          return;
        }
      }

      if (e.key === 'Enter') {
        if (!onButton) {
          e.preventDefault();
          h.open();
        }
        return;
      }
      if (e.key === ' ') {
        if (!onButton) {
          e.preventDefault();
          h.toggleSelect();
        }
        return;
      }

      const table: Record<string, () => void> = {
        j: h.next,
        k: h.prev,
        c: h.comment,
        l: h.labels,
        a: h.assign,
        A: h.assignMe,
        m: h.milestone,
        s: h.status,
        S: h.toggleWork,
        D: h.dispatch,
        L: h.bot,
        T: h.botRetry,
        B: h.botSplit,
        K: h.botCheck,
        e: h.editTitle,
        x: h.close,
        X: h.notPlanned,
        o: h.reopen,
        n: h.newIssue,
        N: h.newSubIssue,
        E: h.addSubIssue,
        u: h.goParent,
        f: h.filter,
        '/': h.search,
        '?': h.help,
        Escape: h.escape,
        ']': h.nextComment,
        '[': h.prevComment,
        i: h.metadata,
        '.': h.more,
        O: h.openGithub,
        R: h.refresh,
        P: h.pair,
        W: h.closedWindow,
        g: () => {
          gPending.current = Date.now();
        },
      };
      const fn = table[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    const onMouse = () => {
      delete document.documentElement.dataset.kb;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouse);
    };
  }, [enabled]);
}
