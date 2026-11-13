import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import type { DiffData, DiffMode, FileItem, PrSummary } from '../shared/types';
import { isTyping } from './hooks';
import { goToFile, headerScrollTop, makeSequence, type NavAdapter } from './goto-file';
import { DiffFileView } from './DiffFileView';
import { Composer } from './inline/Composer';
import { useInlineComposer } from './inline/useInlineComposer';
import type { OpenTarget } from './inline/composer-state';
import type { InlineCommentProps } from './DiffFileView';
import type { LineRef } from './inline/line-target';
import { fileTargets, stepCursor } from './inline/line-target';
import type { FileThreads } from './inline/group-threads';
import type { MentionCandidate } from './mentions/mention-logic';
import type { FileHead } from './file-actions';
import { sortByOrder } from './tree-state';
import { Btn, Chevron, KeyCap } from './ui';
import { revealFirstWord } from './word-scroll';

export interface ScrollRequest {
  path: string;
  n: number;
}

interface ToolbarProps {
  mode: DiffMode;
  narrow: boolean;
  range: string;
  viewed: number;
  total: number;
  wrap: boolean;
  onMode: (m: DiffMode) => void;
  onWrap: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFiles: () => void;
}

export function DiffToolbar(p: ToolbarProps) {
  return (
    <div className="diff-toolbar">
      {p.narrow ? (
        <button type="button" className="btn files-btn" onClick={p.onFiles}>
          Files <strong>{p.viewed} / {p.total} viewed</strong>
          <Chevron open size={16} />
        </button>
      ) : (
        <span className="diff-label pane-cap">DIFF</span>
      )}
      <div className="seg" role="group" aria-label="Diff mode">
        <button
          type="button"
          className={p.mode === 'all' ? 'is-active' : ''}
          aria-pressed={p.mode === 'all'}
          onClick={() => p.onMode('all')}
        >
          {p.narrow ? 'All' : <>All<span className="lbl-more"> changes</span></>}
        </button>
        <button
          type="button"
          className={p.mode === 'since' ? 'is-active' : ''}
          aria-pressed={p.mode === 'since'}
          onClick={() => p.onMode('since')}
        >
          <span className="lbl-long">{p.narrow ? 'Since review' : 'Since my review'}</span>
          <span className="lbl-short">Since review</span>
        </button>
        <span className="seg-key">
          <KeyCap>d</KeyCap>
        </span>
      </div>
      {!p.narrow && p.range ? <span className="range-chip mono">{p.range}</span> : null}
      <div className="toolbar-right">
        {p.narrow ? null : (
          <span className="viewed-count">
            {p.viewed} / {p.total}<span className="lbl-more"> viewed</span>
          </span>
        )}
        <Btn keyHint="w" aria-pressed={p.wrap} onClick={p.onWrap}>
          Wrap
        </Btn>
        <Btn keyHint="[" className="nav-btn" aria-label="Previous file" onClick={p.onPrev}>
          <span className="nav-text">prev</span>
          <span className="nav-icon nav-up"><Chevron open size={14} /></span>
        </Btn>
        <Btn keyHint="]" className="nav-btn" aria-label="Next file" onClick={p.onNext}>
          <span className="nav-text">next</span>
          <span className="nav-icon"><Chevron open size={14} /></span>
        </Btn>
      </div>
    </div>
  );
}

interface DiffPaneProps {
  pr: PrSummary | undefined;
  diff: DiffData | undefined;
  loading: boolean;
  error: string | undefined;
  files: FileItem[];
  scrollRef: Ref<HTMLDivElement>;
  scrollRequest: ScrollRequest | undefined;
  mode: DiffMode;
  wrap: boolean;
  /** The PR head for the file menu, once the detail for this PR has loaded. */
  head?: FileHead;
  onToggleViewed: (path: string, viewed: boolean) => void;
  onCurrent: (path: string) => void;
  /** The PR the composer posts to. Absent while no PR is selected, and the composer stays off. */
  inline?: InlineCommentHost;
  /** The PR's threads and drafts, grouped by file. Absent until the detail loads. */
  threads?: FileThreads[];
}

/** What the composer needs from its host: the PR, the mention people and teams, and a refetch after a post. */
export interface InlineCommentHost {
  repo: string;
  number: number;
  people?: readonly MentionCandidate[];
  teams?: readonly string[];
  hasPendingReview: boolean;
  onPosted: () => void;
}

/** The scrolling list of file diffs. The toolbar is rendered by the parent. */
export function DiffList(p: DiffPaneProps) {
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string>();
  // The composer: one open at a time, and the line cursor for the `n` and `p` keys.
  const host = p.inline;
  const posting = useInlineComposer({
    repo: host?.repo ?? '',
    number: host?.number ?? 0,
    onPosted: () => host?.onPosted(),
  });
  const composer = posting.state;
  const [cursor, setCursor] = useState<LineRef>();
  const [cursorPath, setCursorPath] = useState<string>();

  const openLine = (path: string, ref: LineRef, extend: boolean) => {
    const cur = composer.target;
    if (extend && cur?.subject === 'line' && cur.path === path && cur.side === ref.side) {
      posting.dispatch({ type: 'extend', line: ref.line });
      return;
    }
    const target: OpenTarget = { subject: 'line', path, side: ref.side, line: ref.line };
    posting.dispatch({ type: 'open', target });
    setCursor(ref);
    setCursorPath(path);
  };

  const openFile = (path: string) => {
    posting.dispatch({ type: 'open', target: { subject: 'file', path } });
  };

  // Keyboard for the diff: `n` and `p` move the line cursor, `V` starts a range that `n` and `p` extend,
  // `C` opens the file-level composer for the current file, and `i` opens the composer under the cursor.
  // Keys are ignored while focus is in a text field, as the window table does.
  const rangeOn = useRef(false);
  const pathOf = useRef(p.files);
  pathOf.current = p.files;
  useEffect(() => {
    if (!host) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (composer.status === 'posting') return;
      // The cursor moves through the rows of the file it sits in, and stops at the file's ends.
      // With no cursor yet, `n` starts at the first row of the first open file.
      const path = cursorPath ?? p.diff?.files.find((f) => isOpen(f.path))?.path;
      const file = p.diff?.files.find((f) => f.path === path);
      const rows = file ? fileTargets(file.hunks) : [];
      const step = (d: 1 | -1) => {
        const next = stepCursor(rows, cursor, d, rangeOn.current && cursor ? cursor.side : undefined);
        if (!next || !path) return;
        setCursor(next);
        setCursorPath(path);
        if (rangeOn.current && composer.target?.subject === 'line') {
          posting.dispatch({ type: 'extend', line: next.line });
        }
      };
      if (e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        step(1);
      } else if (e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'V') {
        e.preventDefault();
        rangeOn.current = !rangeOn.current;
        // A range starts at the cursor, so the composer opens there for `n` and `p` to extend.
        if (rangeOn.current && cursor && cursorPath) openLine(cursorPath, cursor, false);
      } else if (e.key === 'C') {
        const path = cursorPath ?? pathOf.current[0]?.path;
        if (!path) return;
        e.preventDefault();
        openFile(path);
      } else if (e.key === 'i' && cursor && cursorPath) {
        e.preventDefault();
        openLine(cursorPath, cursor, false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [host, cursor, cursorPath, composer.status, composer.target, p.diff]);

  // Esc: drops an open composer's range first, then the composer (its draft stays in the reducer).
  useEffect(() => {
    if (!host) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || composer.status === 'closed' || composer.status === 'posting') return;
      if (isTyping(e.target) && composer.status === 'open') return;
      rangeOn.current = false;
      posting.dispatch({ type: 'close' });
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [host, composer.status, posting]);

  /** The per-file slice of the composer state, for `DiffFileView`. Only the file with the open composer shows it. */
  const inlineFor = (path: string): InlineCommentProps | undefined =>
    host
      ? {
          state: composer.target && (composer.target.path === path) ? composer : { ...composer, target: undefined, status: 'closed' },
          ...(cursorPath === path && cursor ? { cursor } : {}),
          onOpenLine: (ref: LineRef, extend: boolean) => openLine(path, ref, extend),
          onOpenFile: () => openFile(path),
          ...(p.threads ? { threads: p.threads.find((f) => f.path === path) ?? { path, fileLevel: [], lines: [] } } : {}),
          ...(host ? { host: { repo: host.repo, number: host.number, ...(host.people ? { people: host.people } : {}), ...(host.teams ? { teams: host.teams } : {}), onPosted: host.onPosted } } : {}),
          renderComposer: () => (
            <Composer
              state={composer}
              dispatch={posting.dispatch}
              onSubmit={(draft) => posting.submit(draft)}
              repo={host.repo}
              {...(host.people ? { people: host.people } : {})}
              {...(host.teams ? { teams: host.teams } : {})}
              hasPendingReview={host.hasPendingReview}
            />
          ),
        }
      : undefined;

  const holder = useRef<HTMLDivElement | null>(null);
  const seq = useRef(makeSequence());
  // The file the last navigation targeted. Scroll tracking leaves it alone until the user scrolls.
  const lock = useRef<string | undefined>(undefined);
  const prevViewed = useRef<Set<string>>(new Set());
  // Files the user scrolled sideways. Their first changed word is never auto-revealed again.
  const sideScrolled = useRef<Set<string>>(new Set());

  useEffect(() => {
    setOpenOverride({});
    sideScrolled.current = new Set();
  }, [p.pr?.id, p.mode]);

  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      holder.current = el;
      if (typeof p.scrollRef === 'function') p.scrollRef(el);
      else if (p.scrollRef) (p.scrollRef as { current: HTMLDivElement | null }).current = el;
    },
    [p.scrollRef],
  );

  const viewedOf = useCallback(
    (path: string) => p.files.find((f) => f.path === path)?.viewed ?? false,
    [p.files],
  );
  const isOpen = (path: string) => openOverride[path] ?? !viewedOf(path);

  const { onCurrent, scrollRequest, diff } = p;
  const releaseLock = () => {
    lock.current = undefined;
  };

  // Marking a file viewed collapses its diff, as GitHub does.
  useEffect(() => {
    const now = new Set(p.files.filter((f) => f.viewed).map((f) => f.path));
    const newly = [...now].filter((path) => !prevViewed.current.has(path));
    prevViewed.current = now;
    if (newly.length > 0) {
      setOpenOverride((o) => {
        const next = { ...o };
        for (const path of newly) next[path] = false;
        return next;
      });
    }
  }, [p.files]);

  const live = useRef({ diff, isOpen, onCurrent, wrap: p.wrap });
  live.current = { diff, isOpen, onCurrent, wrap: p.wrap };

  // Measures once web fonts load and layout settles; a fallback font puts the word elsewhere.
  const revealWord = useCallback((path: string, body: HTMLElement) => {
    void (document.fonts?.ready ?? Promise.resolve()).then(() =>
      requestAnimationFrame(() => {
        if (!body.isConnected) return;
        revealFirstWord(body, { wrap: live.current.wrap, userScrolled: sideScrolled.current.has(path) });
      }),
    );
  }, []);
  const onSideScroll = useCallback((path: string) => {
    sideScrolled.current.add(path);
  }, []);

  const findSection = (path: string) =>
    [...(holder.current?.querySelectorAll<HTMLElement>('.df') ?? [])].find((n) => n.dataset.path === path);

  const adapter: NavAdapter = {
    isExpanded: (path) => live.current.isOpen(path),
    expand: (path) => setOpenOverride((o) => ({ ...o, [path]: true })),
    // Polls each frame: the diff may still be loading, and the body renders after the expand commits.
    whenRendered: (path) =>
      new Promise((resolve) => {
        const deadline = Date.now() + 10000;
        const check = () => {
          const d = live.current.diff;
          if (d && !d.files.some((f) => f.path === path)) return resolve(false);
          if (findSection(path)?.querySelector('.df-body')) return resolve(true);
          if (Date.now() > deadline) return resolve(false);
          requestAnimationFrame(check);
        };
        check();
      }),
    nextFrame: () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
    scrollToHeader: (path) => {
      const root = holder.current;
      const section = findSection(path);
      if (!root || !section) return;
      const top = headerScrollTop(
        root.scrollTop,
        section.getBoundingClientRect().top,
        root.getBoundingClientRect().top,
      );
      root.scrollTo({ top, behavior: 'auto' });
      const body = section.querySelector<HTMLElement>('.df-body');
      if (body) revealWord(path, body);
    },
    markCurrent: (path) => {
      lock.current = path;
      live.current.onCurrent(path);
    },
    flash: (path) => setFlash(path),
  };
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  // One owner for file navigation: every tree click and [ / ] arrives as a new request.
  useEffect(() => {
    if (scrollRequest) void goToFile(adapterRef.current, seq.current, scrollRequest.path);
  }, [scrollRequest]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(undefined), 1000);
    return () => clearTimeout(t);
  }, [flash]);

  // Track the file being read: the first open file still on screen.
  const track = useCallback(() => {
    const root = holder.current;
    if (!root || lock.current) return;
    const top = root.scrollTop;
    const sections = [...root.querySelectorAll<HTMLElement>('.df')];
    const open = sections.filter((s) => s.querySelector('.df-body'));
    const pool = open.length > 0 ? open : sections;
    const hit = pool.find((s) => s.offsetTop + s.offsetHeight > top + 40) ?? pool[pool.length - 1];
    if (hit?.dataset.path) onCurrent(hit.dataset.path);
  }, [onCurrent]);

  useEffect(() => {
    track();
  }, [p.diff, openOverride, p.files, track]);

  const toggleOpen = (path: string) =>
    setOpenOverride((o) => ({ ...o, [path]: !(o[path] ?? !viewedOf(path)) }));

  let content;
  if (p.error && !p.diff) {
    content = <div className="diff-empty muted">Could not load the diff: {p.error}</div>;
  } else if (!p.diff) {
    content = <div className="diff-empty muted">{p.pr ? 'Loading diff...' : 'Select a PR to see its diff.'}</div>;
  } else {
    const changedPaths = new Set(p.files.filter((f) => f.changedSinceReview).map((f) => f.path));
    content = (
      <>
        {p.diff.baseGone ? (
          <div className="notice" role="status">
            The commit you last reviewed no longer exists (force push). Showing all changes instead.
          </div>
        ) : null}
        {p.diff.files.length === 0 ? (
          <div className="diff-empty muted">
            {p.mode === 'since' ? 'No changes since your review.' : 'No files changed.'}
          </div>
        ) : null}
        {sortByOrder(p.diff.files, p.files).map((f, i) => (
          <DiffFileView
            key={f.path}
            file={f}
            index={i}
            open={isOpen(f.path)}
            viewed={viewedOf(f.path)}
            flash={flash === f.path}
            changed={p.mode === 'all' && changedPaths.has(f.path)}
            prUrl={p.pr?.url ?? ''}
            {...(p.head ? { head: p.head } : {})}
            onToggleOpen={toggleOpen}
            onToggleViewed={p.onToggleViewed}
            onBodyShown={revealWord}
            onSideScroll={onSideScroll}
            {...(p.inline ? { comment: inlineFor(f.path) } : {})}
          />
        ))}
      </>
    );
  }

  return (
    <div className={`scroll diff-scroll${p.wrap ? ' diff-wrap' : ''}`} ref={setRefs}
      onScroll={track}
      onWheel={releaseLock}
      onTouchMove={releaseLock}
      onPointerDown={releaseLock}
      onKeyDown={releaseLock}
    >
      {content}
    </div>
  );
}
