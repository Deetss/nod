import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DiffFile, DiffLine } from '../shared/types';
import { splitPath } from './FilesTree';
import { highlight } from './highlight';
import { fileUrl } from './links';
import { Chevron, ExtLink } from './ui';
import type { FileHead } from './file-actions';
import { FileMenuButton } from './FileMenu';
import { hunkMarks, markTokens, type Range } from './word-diff';
import { isUserSideScroll } from './word-scroll';
import { lineTarget, type LineRef } from './inline/line-target';
import { CommentIcon, PlusIcon } from './inline/icons';
import type { ComposerState } from './inline/composer-state';
import { ThreadView, type ThreadHost } from './inline/ThreadView';
import { threadLabel } from './inline/thread-view-state';
import type { FileThreads, GroupedThread } from './inline/group-threads';

interface DiffFileViewProps {
  file: DiffFile;
  index: number;
  open: boolean;
  viewed: boolean;
  flash: boolean;
  changed: boolean;
  prUrl: string;
  /** The PR head, for the View / Edit / Delete file menu. No menu while the detail is loading. */
  head?: FileHead;
  onToggleOpen: (path: string) => void;
  onToggleViewed: (path: string, viewed: boolean) => void;
  /** The file body mounted: on first show and on every expand. */
  onBodyShown: (path: string, body: HTMLElement) => void;
  /** The user scrolled the file body sideways. */
  onSideScroll: (path: string) => void;
  /** The inline comment state for this file: the open target, if it is this file's, and the composer under it. */
  comment?: InlineCommentProps;
}

/** How a file's rows take comments: the gutter plus, the range, the file button, and the open composer. */
export interface InlineCommentProps {
  /** The composer's state. Only the open target of this file matters here. */
  state: ComposerState;
  /** The row the keyboard cursor sits on, shown with a plus. */
  cursor?: LineRef;
  /** Opens a composer under this row. Shift-click extends the range from the open composer's anchor. */
  onOpenLine: (ref: LineRef, extend: boolean) => void;
  /** Opens the file-level composer. */
  onOpenFile: () => void;
  /** Renders the composer. Called with the composer's last row to place it under that row. */
  renderComposer: () => ReactNode;
  /** The file's threads, grouped by line and side. Absent when the detail has none. */
  threads?: FileThreads;
  /** The PR the thread actions post to. */
  host?: ThreadHost;
}

const MARKER: Record<DiffLine['kind'], string> = { add: '+', del: '-', ctx: ' ' };

/**
 * `marks` are the changed words, from `hunkMarks`, drawn with a stronger tint than the line.
 * `gutter` renders the plus button and the thread marker in the number cell when the row takes comments.
 */
export function Line({
  line,
  yaml,
  marks,
  gutter,
  cursor,
}: {
  line: DiffLine;
  yaml: boolean;
  marks?: readonly Range[];
  gutter?: ReactNode;
  cursor?: boolean;
}) {
  return (
    <div className={`dl dl-${line.kind}${cursor ? ' dl-cursor' : ''}`}>
      <span className="dl-num">
        <span className="dl-old">{line.oldNo ?? ''}</span>
        <span className="dl-new">{line.newNo ?? ''}</span>
        {gutter}
      </span>
      <span className="dl-mark">{MARKER[line.kind]}</span>
      <span className="dl-code">
        {markTokens(highlight(line.text, yaml), marks).map((t, i) => (
          <span
            key={i}
            className={t.word ? 'dl-word' : undefined}
            style={t.color ? { color: t.color, ...(t.comment ? { fontStyle: 'italic' } : {}) } : undefined}
          >
            {t.text}
          </span>
        ))}
      </span>
    </div>
  );
}

/** One hunk's lines, with changed words marked on paired deleted and added lines. */
export function HunkLines({ lines, yaml, comment }: { lines: readonly DiffLine[]; yaml: boolean; comment?: InlineCommentProps }) {
  const marks = useMemo(() => hunkMarks(lines), [lines]);
  return (
    <>
      {lines.map((l, li) => {
        const ref = lineTarget(l);
        const target = ref && comment ? ref : undefined;
        return (
          <LineRow key={li} line={l} yaml={yaml} marks={marks[li]} target={target} comment={comment} />
        );
      })}
    </>
  );
}

/** One diff row, its composer, and the threads on its line. The thread marker toggles the threads. */
function LineRow({
  line,
  yaml,
  marks,
  target,
  comment,
}: {
  line: DiffLine;
  yaml: boolean;
  marks?: readonly Range[];
  target: LineRef | undefined;
  comment: InlineCommentProps | undefined;
}) {
  const [threadsOpen, setThreadsOpen] = useState(true);
  const threads = target && comment?.threads ? threadsAt(comment.threads, target) : [];
  const gutter =
    target && comment ? (
      <>
        <button
          type="button"
          className="dl-add-btn"
          aria-label={`Comment on line ${target.line}`}
          onClick={(e) => comment.onOpenLine(target, e.shiftKey)}
        >
          <PlusIcon />
        </button>
        {threads.length > 0 ? (
          <button
            type="button"
            className="dl-thread-btn"
            aria-expanded={threadsOpen}
            aria-label={`Threads on ${threadLabel(threads[0]!.thread)}, ${threads.length}, ${threadsOpen ? 'shown' : 'hidden'}`}
            onClick={() => setThreadsOpen((o) => !o)}
          >
            <CommentIcon />
            <span>{threads.length}</span>
          </button>
        ) : null}
      </>
    ) : undefined;
  const cursor = target && comment?.cursor && comment.cursor.side === target.side && comment.cursor.line === target.line;
  return (
    <div>
      <Line line={line} yaml={yaml} marks={marks} gutter={gutter} cursor={!!cursor} />
      {target && comment && comment.state.target && composerAfter(comment.state, target) ? comment.renderComposer() : null}
      {threadsOpen && comment?.host
        ? threads.map((g) => <ThreadView key={g.thread.id} g={g} host={comment.host!} />)
        : null}
    </div>
  );
}

/** The threads on one line and side of a file. */
function threadsAt(files: FileThreads, ref: LineRef): GroupedThread[] {
  const at = files.lines.find((l) => l.line === ref.line && l.side === ref.side);
  return at?.threads ?? [];
}

/** True when the open composer sits under this row: its last line is this row, on the same side. */
function composerAfter(state: ComposerState, ref: LineRef): boolean {
  const t = state.target;
  if (!t || t.subject !== 'line' || state.status === 'closed') return false;
  return t.side === ref.side && t.line === ref.line;
}

/** Opens the file in the PR's Files changed view on GitHub. */
function FileLink({ prUrl, path }: { prUrl: string; path: string }) {
  const [href, setHref] = useState<string>();
  useEffect(() => {
    if (!prUrl) return;
    let live = true;
    void fileUrl(prUrl, path).then((u) => live && setHref(u));
    return () => {
      live = false;
    };
  }, [prUrl, path]);
  return <ExtLink href={href} label={`Open ${path} on GitHub`} />;
}

function DiffFileViewImpl(p: DiffFileViewProps) {
  const { file } = p;
  const { dir, name } = splitPath(file.path);
  const yaml = /\.ya?ml$/.test(file.path);
  const { onBodyShown, onSideScroll } = p;
  const { comment } = p;
  const bodyRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) onBodyShown(file.path, el);
    },
    [file.path, onBodyShown],
  );
  return (
    <section
      className={`df${p.flash ? ' df-flash' : ''}`}
      data-path={file.path}
      data-index={p.index}
    >
      <header className="df-h" onClick={() => p.onToggleOpen(file.path)}>
        <button
          type="button"
          className="df-chev"
          aria-expanded={p.open}
          aria-label={`${p.open ? 'Collapse' : 'Expand'} ${file.path}`}
          onClick={(e) => {
            e.stopPropagation();
            p.onToggleOpen(file.path);
          }}
        >
          <Chevron open={p.open} />
        </button>
        <span className="df-path mono" title={file.path}>
          <span className="df-dir">{dir}&lrm;</span>
          <span className="df-name">{name}</span>
        </span>
        {p.changed ? <span className="chip chip-changed">changed</span> : null}
        <FileLink prUrl={p.prUrl} path={file.path} />
        <span className="df-stats">
          <span className="add">+{file.additions}</span> <span className="del">-{file.deletions}</span>
        </span>
        {comment ? (
          <button
            type="button"
            className="df-comment"
            aria-label={`Comment on ${file.path}`}
            onClick={(e) => {
              e.stopPropagation();
              comment.onOpenFile();
            }}
          >
            <CommentIcon />
            <span>Comment file</span>
          </button>
        ) : null}
        <label className="df-viewed" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={p.viewed}
            onChange={(e) => p.onToggleViewed(file.path, e.target.checked)}
          />
          Viewed
        </label>
        {p.head ? <FileMenuButton head={p.head} file={file} /> : null}
      </header>
      {p.open ? (
        <div
          className="df-body"
          ref={bodyRef}
          onScroll={(e) => {
            if (isUserSideScroll(e.currentTarget)) onSideScroll(file.path);
          }}
        >
          {file.noPatch ? (
            <div className="df-note muted">
              No diff to show (binary or too large). Open the pull request on GitHub:{' '}
              <a href={`${p.prUrl}/files`} target="_blank" rel="noreferrer">
                files
              </a>
            </div>
          ) : (
            <div className="dl-table">
            {comment?.host && comment.threads?.fileLevel.length
              ? comment.threads.fileLevel.map((g) => <ThreadView key={g.thread.id} g={g} host={comment.host!} />)
              : null}
            {comment && comment.state.target?.subject === 'file' && comment.state.target.path === file.path && comment.state.status !== 'closed' ? comment.renderComposer() : null}
              {file.hunks.map((h, hi) => (
                <div key={hi}>
                  <div className="dl-hunk mono">
                    <span className="dl-hunk-text" title={h.header}>
                      {h.header}
                    </span>
                  </div>
                  <HunkLines lines={h.lines} yaml={yaml} {...(comment ? { comment } : {})} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export const DiffFileView = memo(DiffFileViewImpl);
