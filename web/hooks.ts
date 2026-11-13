import { useCallback, useEffect, useRef, useState } from 'react';
import { THEME_PARAM } from './api';
import type { Theme } from './Topbar';

export type Layout = 'three' | 'two' | 'one';

function layoutNow(threeAt: number): Layout {
  if (window.matchMedia(`(min-width: ${threeAt}px)`).matches) return 'three';
  return window.matchMedia('(min-width: 700px)').matches ? 'two' : 'one';
}

/** Three panes from `threeAt` px (PRs 1400, issues 1100), two from 700px, one pane below that. */
export function useLayout(threeAt = 1400): Layout {
  const [layout, setLayout] = useState<Layout>(() => layoutNow(threeAt));
  useEffect(() => {
    const queries = [
      window.matchMedia(`(min-width: ${threeAt}px)`),
      window.matchMedia('(min-width: 700px)'),
    ];
    const update = () => setLayout(layoutNow(threeAt));
    update();
    for (const q of queries) q.addEventListener('change', update);
    return () => {
      for (const q of queries) q.removeEventListener('change', update);
    };
  }, [threeAt]);
  return layout;
}

function initialTheme(): Theme {
  if (THEME_PARAM === 'light' || THEME_PARAM === 'dark') return THEME_PARAM;
  const saved = window.localStorage.getItem('nod-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('nod-theme', next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

export interface HotkeyHandlers {
  next: () => void;
  prev: () => void;
  open: () => void;
  nextFile: () => void;
  prevFile: () => void;
  viewed: () => void;
  interdiff: () => void;
  wrap: () => void;
  hideViewed: () => void;
  approve: () => void;
  request: () => void;
  comment: () => void;
  merge: () => void;
  adminMerge: () => void;
  ready: () => void;
  /** `F`: opens the Fix menu for every failing check. Does nothing with none failing. */
  fix: () => void;
  /** `s`: Send message to the PR's Orca session. Does nothing without one. */
  sendOrca: () => void;
  /** `o`: Open the PR's Orca session. `O` still opens the PR on GitHub. */
  openOrca: () => void;
  openGithub: () => void;
  filter: () => void;
  search: () => void;
  help: () => void;
  pair: () => void;
  escape: () => void;
  details: () => void;
  expand: () => void;
  refresh: () => void;
  showOrg: () => void;
  /** `W`: cycles the closed section's window. Absent where there is no closed section. */
  closedWindow?: () => void;
  /** `g p` and `g i` switch views; App wires them once the view switch exists. */
  goPrs?: () => void;
  goIssues?: () => void;
  goActivity?: () => void;
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset']);

/** True when the key target takes text. Checkboxes, radios and buttons do not. */
export function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(t.type);
  return t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

/** Window-level key map. Pass `enabled: false` while a dialog owns the keyboard. */
export function useHotkeys(handlers: HotkeyHandlers, enabled: boolean): void {
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
        const jump: Record<string, (() => void) | undefined> = {
          o: h.showOrg,
          p: h.goPrs,
          i: h.goIssues,
          a: h.goActivity,
        };
        const go = jump[e.key];
        if (go) {
          e.preventDefault();
          go();
          return;
        }
      }

      const table: Record<string, (() => void) | undefined> = {
        W: h.closedWindow,
        j: h.next,
        k: h.prev,
        ']': h.nextFile,
        '[': h.prevFile,
        v: h.viewed,
        d: h.interdiff,
        w: h.wrap,
        h: h.hideViewed,
        a: h.approve,
        r: h.request,
        c: h.comment,
        m: h.merge,
        M: h.adminMerge,
        y: h.ready,
        F: h.fix,
        s: h.sendOrca,
        o: h.openOrca,
        O: h.openGithub,
        f: h.filter,
        '/': h.search,
        '?': h.help,
        Escape: h.escape,
        t: h.details,
        e: h.expand,
        R: h.refresh,
        P: h.pair,
        g: () => {
          gPending.current = Date.now();
        },
      };
      if (e.key === 'Enter') {
        if (!onButton) {
          e.preventDefault();
          h.open();
        }
        return;
      }
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
