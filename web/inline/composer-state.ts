import type { DiffSide } from '../../shared/types';

/** Where a composer posts: one diff line, a range that ends on `line`, or the whole file. */
export type ComposerTarget =
  | { subject: 'file'; path: string }
  | {
      subject: 'line';
      path: string;
      side: DiffSide;
      /** The line the range started from. Extending moves `line` and `startLine` around it. */
      anchor: number;
      /** The last line of the range (the line the comment sits on). */
      line: number;
      /** The first line of a range. Absent for a single line, and never after `line`. */
      startLine?: number;
    };

/** What `open` takes. A line target starts as a single line. */
export type OpenTarget = { subject: 'file'; path: string } | { subject: 'line'; path: string; side: DiffSide; line: number };

export type ComposerStatus = 'closed' | 'open' | 'previewing' | 'posting' | 'failed';

/** Text kept per target, so closing the composer does not lose a draft. Keyed by `targetKey`. */
export type DraftMap = Record<string, string>;

export interface ComposerState {
  status: ComposerStatus;
  /** Absent when closed. */
  target?: ComposerTarget;
  /** The comment text. Kept on failure and on close. */
  text: string;
  /** The error from the last failed post. Set only when `failed`. */
  error?: string;
  drafts: DraftMap;
}

export type ComposerAction =
  | { type: 'open'; target: OpenTarget }
  | { type: 'edit'; text: string }
  | { type: 'extend'; line: number }
  | { type: 'close' }
  | { type: 'tab'; tab: 'write' | 'preview' }
  | { type: 'post' }
  | { type: 'succeed' }
  | { type: 'fail'; error: string }
  | { type: 'retry' };

export const initialComposer: ComposerState = { status: 'closed', text: '', drafts: {} };

/** The draft key for a target. A range has its own key, apart from the single line it starts from. */
export function targetKey(target: ComposerTarget): string {
  if (target.subject === 'file') return `file|${target.path}`;
  const range = target.startLine === undefined ? '' : `${target.startLine}`;
  return `line|${target.path}|${target.side}|${range}|${target.line}`;
}

function fromOpen(open: OpenTarget): ComposerTarget {
  if (open.subject === 'file') return { subject: 'file', path: open.path };
  return { subject: 'line', path: open.path, side: open.side, anchor: open.line, line: open.line };
}

/** The draft text of a target, with the composer's current text stored under its key. */
function stash(state: ComposerState): DraftMap {
  if (!state.target) return state.drafts;
  const key = targetKey(state.target);
  const text = state.text.trim() === '' ? undefined : state.text;
  const drafts = { ...state.drafts };
  if (text === undefined) delete drafts[key];
  else drafts[key] = state.text;
  return drafts;
}

const isActive = (s: ComposerStatus) => s === 'open' || s === 'previewing' || s === 'failed';

/**
 * Pure reducer for the inline composer. It does no I/O: `post` moves to `posting`, and the caller
 * reports the result with `succeed` or `fail`. Actions that do not apply in the current status
 * return the state unchanged.
 */
export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case 'open': {
      if (state.status === 'posting') return state;
      const target = fromOpen(action.target);
      // Opening the target already shown changes nothing.
      if (state.target && targetKey(state.target) === targetKey(target) && state.status !== 'closed') return state;
      const drafts = stash(state);
      return { status: 'open', target, text: drafts[targetKey(target)] ?? '', drafts };
    }

    case 'edit':
      if (!isActive(state.status)) return state;
      return { ...state, text: action.text };

    case 'extend': {
      if (!isActive(state.status) || state.target?.subject !== 'line') return state;
      const { target } = state;
      const low = Math.min(target.anchor, action.line);
      const high = Math.max(target.anchor, action.line);
      const next: ComposerTarget = {
        ...target,
        line: high,
        ...(low === high ? {} : { startLine: low }),
      };
      if (low === high) delete next.startLine;
      return { ...state, target: next };
    }

    case 'close': {
      if (state.status === 'closed' || state.status === 'posting') return state;
      return { status: 'closed', text: '', drafts: stash(state) };
    }

    case 'tab':
      if (state.status !== 'open' && state.status !== 'previewing') return state;
      return { ...state, status: action.tab === 'preview' ? 'previewing' : 'open' };

    case 'post':
      if (state.status !== 'open' && state.status !== 'previewing') return state;
      if (state.text.trim() === '') return state;
      return { ...state, status: 'posting', error: undefined };

    case 'succeed': {
      if (state.status !== 'posting' || !state.target) return state;
      const drafts = { ...state.drafts };
      delete drafts[targetKey(state.target)];
      return { status: 'closed', text: '', drafts };
    }

    case 'fail':
      if (state.status !== 'posting') return state;
      return { ...state, status: 'failed', error: action.error };

    case 'retry':
      if (state.status !== 'failed') return state;
      return { ...state, status: 'posting', error: undefined };
  }
}

/** The primary button: Comment, Posting... while the post is in flight, Retry after a failure. */
export function primaryLabel(state: ComposerState): string {
  if (state.status === 'posting') return 'Posting...';
  if (state.status === 'failed') return 'Retry';
  return 'Comment';
}

/** The second button: Start a review, or Add review comment when the viewer already has a pending review. */
export function secondaryLabel(hasPendingReview: boolean): string {
  return hasPendingReview ? 'Add review comment' : 'Start a review';
}
