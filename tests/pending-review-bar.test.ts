import { describe, expect, it } from 'vitest';
import {
  bodyRequired,
  canSubmit,
  discardLabel,
  FINISH_OPTIONS,
  finishReducer,
  hasDrafts,
  initialFinish,
  pendingLabel,
  submitLabel,
  type FinishState,
} from '../web/pending-review-state';

const chosen = (event: FinishState['event'], body = ''): FinishState => ({ ...initialFinish, event, body });

describe('pending review bar: count and visibility', () => {
  it('hides the bar when there is no pending review or it has no drafts', () => {
    expect(hasDrafts(undefined)).toBe(false);
    expect(hasDrafts(0)).toBe(false);
    expect(hasDrafts(2)).toBe(true);
  });

  it('reads the count with the right plural', () => {
    expect(pendingLabel(1)).toBe('Pending review: 1 comment');
    expect(pendingLabel(2)).toBe('Pending review: 2 comments');
  });

  it('asks for a second click on Discard with the count', () => {
    expect(discardLabel(2, false)).toBe('Discard');
    expect(discardLabel(2, true)).toBe('Discard 2 comments?');
    expect(discardLabel(1, true)).toBe('Discard 1 comment?');
  });
});

describe('Finish review menu', () => {
  it('lists Comment, Approve and Request changes, each with a description', () => {
    expect(FINISH_OPTIONS.map((o) => o.title)).toEqual(['Comment', 'Approve', 'Request changes']);
    for (const o of FINISH_OPTIONS) expect(o.sub.length).toBeGreaterThan(0);
  });

  it('opens with the first row focused and moves with wraparound', () => {
    let s = finishReducer(initialFinish, { type: 'open' });
    expect(s.menuOpen).toBe(true);
    expect(s.focus).toBe(0);
    s = finishReducer(s, { type: 'move', delta: -1 });
    expect(s.focus).toBe(2);
    s = finishReducer(s, { type: 'move', delta: 1 });
    expect(s.focus).toBe(0);
  });

  it('closes on Escape without choosing an event', () => {
    const s = finishReducer(finishReducer(initialFinish, { type: 'open' }), { type: 'close' });
    expect(s.menuOpen).toBe(false);
    expect(s.event).toBeUndefined();
  });

  it('choosing an event closes the menu and shows the body step', () => {
    const s = finishReducer(finishReducer(initialFinish, { type: 'open' }), { type: 'choose', event: 'APPROVE' });
    expect(s.menuOpen).toBe(false);
    expect(s.event).toBe('APPROVE');
  });
});

describe('Finish review body and submit', () => {
  it('requires a body only for Request changes', () => {
    expect(bodyRequired('REQUEST_CHANGES')).toBe(true);
    expect(bodyRequired('COMMENT')).toBe(false);
    expect(bodyRequired('APPROVE')).toBe(false);
    expect(bodyRequired(undefined)).toBe(false);
  });

  it('keeps Submit disabled for Request changes until the body has text', () => {
    expect(canSubmit(chosen('REQUEST_CHANGES'))).toBe(false);
    expect(canSubmit(chosen('REQUEST_CHANGES', '   '))).toBe(false);
    expect(canSubmit(chosen('REQUEST_CHANGES', 'Fix the null check'))).toBe(true);
  });

  it('allows an empty body for Comment and Approve', () => {
    expect(canSubmit(chosen('COMMENT'))).toBe(true);
    expect(canSubmit(chosen('APPROVE'))).toBe(true);
  });

  it('does not submit without a chosen event', () => {
    expect(canSubmit(initialFinish)).toBe(false);
    expect(finishReducer(initialFinish, { type: 'submit' })).toBe(initialFinish);
  });

  it('shows Submitting... and blocks a second submit while in flight', () => {
    const s = finishReducer(chosen('COMMENT'), { type: 'submit' });
    expect(s.status).toBe('submitting');
    expect(submitLabel(s)).toBe('Submitting...');
    expect(canSubmit(s)).toBe(false);
    expect(finishReducer(s, { type: 'submit' })).toBe(s);
  });

  it('on failure keeps the body and offers Retry with the message', () => {
    const sent = finishReducer(chosen('REQUEST_CHANGES', 'Needs a test'), { type: 'submit' });
    const failed = finishReducer(sent, { type: 'fail', message: 'GitHub said no' });
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('GitHub said no');
    expect(failed.body).toBe('Needs a test');
    expect(submitLabel(failed)).toBe('Retry');
    expect(canSubmit(failed)).toBe(true);
  });

  it('clears the error when the user edits the body and resubmits', () => {
    const failed = finishReducer(finishReducer(chosen('COMMENT'), { type: 'submit' }), { type: 'fail', message: 'x' });
    const retry = finishReducer(failed, { type: 'submit' });
    expect(retry.error).toBeUndefined();
    expect(retry.status).toBe('submitting');
  });

  it('resets to the bar state after a successful submit', () => {
    expect(finishReducer(chosen('COMMENT'), { type: 'reset' })).toEqual(initialFinish);
  });
});
