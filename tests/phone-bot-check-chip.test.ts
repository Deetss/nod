import { describe, expect, it } from 'vitest';
import { headerCheck, phoneBotState, trimLine } from '../web/phone/bot-check-phone';
import type { CheckFlowState, TrimFlowState } from '../shared/bot';
import type { IssueComment } from '../shared/issue-types';

const verdictComment = (id: string, body: string): IssueComment => ({
  id,
  author: 'build-bot',
  createdAt: new Date(2026, 10, 12, 23, 0).toISOString(),
  bodyHtml: `<p>${body}</p>`,
  bot: { kind: 'check', verdict: 'valid' },
});

const state = (check: CheckFlowState, trim: TrimFlowState = 'hidden', comments: IssueComment[] = []) =>
  phoneBotState(check, trim, comments);

describe('header chip', () => {
  it('shows nothing while the bot is off', () => {
    expect(headerCheck(state('hidden'))).toBeUndefined();
  });

  it('shows Checking... while pending', () => {
    expect(headerCheck(state('pending'))).toEqual({ kind: 'checking', text: 'Checking...' });
  });

  it('shows No check yet when idle', () => {
    expect(headerCheck(state('idle'))).toEqual({ kind: 'idle', text: 'No check yet' });
  });

  it('shows the failure line without a chip', () => {
    expect(headerCheck(state('failed'))).toEqual({ kind: 'failed', text: 'Check failed. Nothing changed.' });
  });

  it('shows the verdict words, icon and link to the verdict comment', () => {
    const comments = [verdictComment('c1', 'Still needed.')];
    const chip = headerCheck(state('verdict', 'hidden', comments));
    expect(chip).toMatchObject({ kind: 'verdict', verdict: 'valid', glyph: '!', text: 'Still needed', commentId: 'c1' });
  });

  it('gives each verdict its own words', () => {
    const words = (verdict: 'valid' | 'partly' | 'done' | 'obsolete' | 'unclear') => {
      const c: IssueComment = { ...verdictComment('c', 'x'), bot: { kind: 'check', verdict } };
      const chip = headerCheck(state('verdict', 'hidden', [c]));
      return chip?.kind === 'verdict' ? chip.text : undefined;
    };
    expect(words('valid')).toBe('Still needed');
    expect(words('partly')).toBe('Partly done');
    expect(words('done')).toBe('Already done');
    expect(words('obsolete')).toBe('No longer applies');
    expect(words('unclear')).toBe('Cannot tell from the code');
  });
});

describe('header trim line', () => {
  it('says Trimming the N met criteria while pending', () => {
    const c: IssueComment = { ...verdictComment('c', 'x'), bot: { kind: 'check', verdict: 'partly', met: [1, 3] } };
    expect(trimLine(state('verdict', 'offered', [c]))).toBeUndefined();
    expect(trimLine(state('verdict', 'pending', [c]))).toEqual({ tone: 'muted', text: 'Trimming the 2 met criteria.' });
  });

  it('reports the trimmed count', () => {
    const comments: IssueComment[] = [
      { ...verdictComment('c', 'x'), bot: { kind: 'check', verdict: 'partly', met: [1, 2] } },
      { ...verdictComment('t', 'Moved'), bot: { kind: 'trim', moved: 2 } },
    ];
    expect(trimLine(state('verdict', 'trimmed', comments))).toEqual({ tone: 'ok', text: 'Trimmed 2 criteria into Already done' });
  });

  it('shows the refusal text from the bot', () => {
    const comments: IssueComment[] = [
      { ...verdictComment('c', 'x'), bot: { kind: 'check', verdict: 'partly', met: [1] } },
      { ...verdictComment('r', 'No criterion matches.'), bot: { kind: 'trim-refused', reason: 'No criterion matches.' } },
    ];
    expect(trimLine(state('verdict', 'refused', comments))).toEqual({ tone: 'danger', text: 'No criterion matches.' });
  });

  it('shows the trim failure line', () => {
    expect(trimLine(state('verdict', 'failed'))).toEqual({ tone: 'danger', text: 'Trim failed. Nothing changed.' });
  });
});
