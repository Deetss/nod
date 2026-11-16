import { useCallback } from 'react';
import type { ComposerState, ComposerTarget } from '../inline/composer-state';
import type { FileThreads } from '../inline/group-threads';
import type { LineRef } from '../inline/line-target';
import { useInlineComposer } from '../inline/useInlineComposer';
import { splitPath } from '../FilesTree';

export interface PhoneComments {
  state: ComposerState;
  /** A tap on a row's number: selects it, extends the selection on the same side, or clears it on the anchor. */
  tap: (path: string, ref: LineRef) => void;
  openFile: (path: string) => void;
  edit: (text: string) => void;
  /** Posts now (`draft` false) or adds to the pending review. After a failure, retries the last one. */
  submit: (draft: boolean) => void;
  /** Drops the selection and the composer. */
  clear: () => void;
}

/**
 * The phone's comment flow over the desktop composer reducer. A selection is the reducer's open
 * target, so the range, the text kept on failure, and retry all behave as on the desktop.
 */
export function usePhoneComments(pr: { repo: string; number: number } | undefined, onPosted: () => void): PhoneComments {
  const posting = useInlineComposer({ repo: pr?.repo ?? '', number: pr?.number ?? 0, onPosted });
  const { state, dispatch, submit } = posting;

  const tap = useCallback(
    (path: string, ref: LineRef) => {
      const t = state.target;
      const open = state.status === 'open' && t?.subject === 'line' && t.path === path && t.side === ref.side;
      if (open && t.startLine === undefined && t.line === ref.line) {
        dispatch({ type: 'close' });
        return;
      }
      if (open) {
        dispatch({ type: 'extend', line: ref.line });
        return;
      }
      dispatch({ type: 'open', target: { subject: 'line', path, side: ref.side, line: ref.line } });
    },
    [state, dispatch],
  );

  return {
    state,
    tap,
    openFile: useCallback((path: string) => dispatch({ type: 'open', target: { subject: 'file', path } }), [dispatch]),
    edit: useCallback((text: string) => dispatch({ type: 'edit', text }), [dispatch]),
    submit,
    clear: useCallback(() => dispatch({ type: 'close' }), [dispatch]),
  };
}

/** Only the viewer's drafts, for the diff. Other threads are read on the Thread tab. */
export function draftsOnly(files: readonly FileThreads[]): FileThreads[] {
  return files
    .map((f) => ({
      path: f.path,
      fileLevel: f.fileLevel.filter((g) => g.draft),
      lines: f.lines.map((l) => ({ ...l, threads: l.threads.filter((g) => g.draft) })).filter((l) => l.threads.length > 0),
    }))
    .filter((f) => f.fileLevel.length > 0 || f.lines.length > 0);
}

/** `Comment on line 13`, `Comment on lines 13–14`, or `Comment on add_amounts.rb`. */
export function commentTitle(t: ComposerTarget): string {
  if (t.subject === 'file') return `Comment on ${splitPath(t.path).name}`;
  return t.startLine === undefined ? `Comment on line ${t.line}` : `Comment on lines ${t.startLine}–${t.line}`;
}
