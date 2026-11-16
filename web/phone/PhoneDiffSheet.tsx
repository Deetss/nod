import { useEffect, useRef } from 'react';
import type { DiffData, FileItem } from '../../shared/types';
import { HunkLines, type InlineCommentProps } from '../DiffFileView';
import type { FileThreads } from '../inline/group-threads';
import type { ThreadHost } from '../inline/ThreadView';
import { commentTitle, type PhoneComments } from './usePhoneComments';
import { splitPath } from '../FilesTree';
import { CheckIcon } from '../ui';
import type { Remote } from '../useRemote';
import { PhoneSheet } from './PhoneSheet';
import { nextUnviewed } from './phone-logic';

interface DiffSheetProps {
  files: FileItem[];
  diff: Remote<DiffData>;
  path: string;
  prUrl: string;
  wrap: boolean;
  writesOff: boolean;
  depth: number;
  covered: boolean;
  onWrap: () => void;
  onSelect: (path: string) => void;
  onViewed: (path: string, viewed: boolean) => void;
  onClose: () => void;
  onMore: () => void;
  /** Line comments. Absent while writes are off or the detail is loading. */
  comments?: {
    flow: PhoneComments;
    host: ThreadHost;
    /** The viewer's drafts in this PR, grouped by file. */
    drafts: readonly FileThreads[];
    pendingCount: number;
    /** Opens the composer sheet for the current selection. */
    onCompose: () => void;
    /** Back to the PR sheet and its pending bar. */
    onPending: () => void;
  };
}

export function PhoneDiffSheet(p: DiffSheetProps) {
  const index = Math.max(0, p.files.findIndex((f) => f.path === p.path));
  const file = p.files[index];
  const last = index >= p.files.length - 1;
  const data = p.diff.data?.files.find((f) => f.path === p.path);
  const yaml = /\.ya?ml$/.test(p.path);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current?.querySelector('.is-current')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [p.path]);

  const markViewed = () => {
    if (!file) return;
    p.onViewed(file.path, !file.viewed);
    if (file.viewed) return;
    const next = nextUnviewed(p.files, file.path);
    if (next) p.onSelect(next);
  };
  const next = () => (last ? p.onClose() : p.onSelect(p.files[index + 1]?.path ?? p.path));

  const c = p.comments;
  const target = c?.flow.state.target;
  const selection = c && c.flow.state.status === 'open' && target?.subject === 'line' && target.path === p.path ? target : undefined;
  const inline: InlineCommentProps | undefined = c
    ? {
        state: target?.path === p.path ? c.flow.state : { ...c.flow.state, target: undefined, status: 'closed' },
        onOpenLine: (ref) => c.flow.tap(p.path, ref),
        onOpenFile: () => c.flow.openFile(p.path),
        renderComposer: () => null,
        threads: c.drafts.find((f) => f.path === p.path) ?? { path: p.path, fileLevel: [], lines: [] },
        host: c.host,
        showRange: true,
      }
    : undefined;

  const bar = selection ? (
    <button type="button" className="ph-btn is-primary" onClick={c?.onCompose}>
      {commentTitle(selection)}
    </button>
  ) : (
    <>
      {c && c.pendingCount > 0 ? (
        <button type="button" className="ph-btn is-narrow" onClick={c.onPending}>
          {c.pendingCount} pending
        </button>
      ) : (
        <button type="button" className="ph-btn is-narrow" aria-pressed={p.wrap} onClick={p.onWrap}>
          <span className={`ph-switch${p.wrap ? ' is-on' : ''}`} aria-hidden="true" />
          Wrap
        </button>
      )}
      <button
        type="button"
        className={`ph-btn${file?.viewed ? '' : ' is-primary'}${p.writesOff ? ' is-off' : ''}`}
        disabled={p.writesOff || !file}
        onClick={markViewed}
      >
        {file?.viewed ? 'Viewed' : 'Mark viewed'}
        {file?.viewed ? <CheckIcon size={16} /> : null}
      </button>
      <button type="button" className="ph-btn is-narrow" onClick={next}>
        {last ? 'Done' : 'Next'}
      </button>
    </>
  );

  return (
    <PhoneSheet
      title={splitPath(p.path).name}
      sub={`${splitPath(p.path).dir} · ${index + 1} / ${p.files.length} files`}
      depth={p.depth}
      covered={p.covered}
      onClose={p.onClose}
      onMore={p.onMore}
      bodyScrolls={false}
      pinned={
        <div className="ph-filestrip" ref={strip}>
          {p.files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={`ph-fchip${f.path === p.path ? ' is-current' : ''}`}
              onClick={() => p.onSelect(f.path)}
            >
              {splitPath(f.path).name}
              {f.viewed ? <CheckIcon size={14} /> : null}
            </button>
          ))}
        </div>
      }
      bar={bar}
    >
      <div className={`ph-diff${p.wrap ? ' diff-wrap' : ''}`} tabIndex={0}>
        {p.diff.error && !data ? <p className="ph-pad ph-muted">{p.diff.error}</p> : null}
        {!data && !p.diff.error ? <p className="ph-pad ph-muted">Loading…</p> : null}
        {data?.noPatch ? (
          <p className="ph-pad ph-muted">
            No diff to show (binary or too large).{' '}
            <a href={`${p.prUrl}/files`} target="_blank" rel="noreferrer">
              Open files on GitHub
            </a>
          </p>
        ) : (
          <div className="dl-table">
            {data?.hunks.map((h, hi) => (
              <div key={hi}>
                <div className="dl-hunk mono">
                  <span className="dl-hunk-text" title={h.header}>
                    {h.header}
                  </span>
                </div>
                <HunkLines lines={h.lines} yaml={yaml} {...(inline ? { comment: inline } : {})} />
              </div>
            ))}
          </div>
        )}
      </div>
    </PhoneSheet>
  );
}
