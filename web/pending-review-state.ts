import type { ReviewEvent } from '../shared/types';

/** The Finish review menu rows, in menu order. Descriptions are shown under each title. */
export interface FinishOption {
  event: ReviewEvent;
  title: string;
  sub: string;
}

export const FINISH_OPTIONS: readonly FinishOption[] = [
  { event: 'COMMENT', title: 'Comment', sub: 'Leave general feedback without approval.' },
  { event: 'APPROVE', title: 'Approve', sub: 'Submit feedback and approve these changes.' },
  { event: 'REQUEST_CHANGES', title: 'Request changes', sub: 'Submit feedback that must be addressed before merging.' },
];

/** The bar's count line. Drafts are the viewer's pending comments on this PR. */
export function pendingLabel(drafts: number): string {
  return `Pending review: ${drafts} ${drafts === 1 ? 'comment' : 'comments'}`;
}

/** The bar shows only while the viewer has drafts. */
export function hasDrafts(drafts: number | undefined): boolean {
  return (drafts ?? 0) > 0;
}

export function discardLabel(drafts: number, armed: boolean): string {
  if (!armed) return 'Discard';
  return `Discard ${drafts} ${drafts === 1 ? 'comment' : 'comments'}?`;
}

export type FinishStatus = 'editing' | 'submitting' | 'failed';

export interface FinishState {
  menuOpen: boolean;
  /** Index into FINISH_OPTIONS that holds keyboard focus while the menu is open. */
  focus: number;
  /** The event chosen from the menu. Undefined until one is chosen. */
  event?: ReviewEvent;
  body: string;
  status: FinishStatus;
  error?: string;
}

export const initialFinish: FinishState = { menuOpen: false, focus: 0, body: '', status: 'editing' };

export type FinishAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'move'; delta: 1 | -1 }
  | { type: 'choose'; event: ReviewEvent }
  | { type: 'edit'; body: string }
  | { type: 'cancel' }
  | { type: 'submit' }
  | { type: 'fail'; message: string }
  | { type: 'reset' };

/** Request changes needs a body. Comment and Approve take an optional one. */
export function bodyRequired(event: ReviewEvent | undefined): boolean {
  return event === 'REQUEST_CHANGES';
}

/** Submit is enabled once an event is chosen, the body is valid, and no submit is in flight. */
export function canSubmit(state: FinishState): boolean {
  if (!state.event || state.status === 'submitting') return false;
  return !bodyRequired(state.event) || state.body.trim().length > 0;
}

export function finishReducer(state: FinishState, action: FinishAction): FinishState {
  switch (action.type) {
    case 'open':
      return { ...state, menuOpen: true, focus: 0 };
    case 'close':
      return { ...state, menuOpen: false };
    case 'move': {
      const n = FINISH_OPTIONS.length;
      return { ...state, focus: (state.focus + action.delta + n) % n };
    }
    case 'choose':
      // The body text is kept when the event changes; only the failure message is cleared.
      return { ...state, menuOpen: false, event: action.event, status: 'editing', error: undefined };
    case 'edit':
      return { ...state, body: action.body };
    case 'cancel':
      return { ...state, event: undefined, status: 'editing', error: undefined };
    case 'submit':
      return canSubmit(state) ? { ...state, status: 'submitting', error: undefined } : state;
    case 'fail':
      return { ...state, status: 'failed', error: action.message };
    case 'reset':
      return initialFinish;
  }
}

/** The button label for the submit control. */
export function submitLabel(state: FinishState): string {
  if (state.status === 'submitting') return 'Submitting...';
  return state.status === 'failed' ? 'Retry' : 'Submit review';
}
