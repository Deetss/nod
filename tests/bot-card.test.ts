import { describe, expect, it } from 'vitest';
import type { IssueComment } from '../shared/issue-types';
import { botTag } from '../shared/bot';
import { checkCardOf, commentLines, emphasisFor, stripOpen, trimCountFor, trimNoteOf, VERDICT_WORDS } from '../web/issues/bot-card';
import { TEST_BOT } from './bot-settings';

const BOT = { ...TEST_BOT, name: 'Helper', command: '/helper', login: 'helper-bot', marker: 'helper' };
const BOT_AUTHOR = { __typename: 'Bot', login: 'helper-bot[bot]' };
const AFTER_CUTOFF = new Date(2026, 10, 12, 22, 30).toISOString();

function comment(id: string, body: string, createdAt = AFTER_CUTOFF): IssueComment {
  const tag = botTag(BOT_AUTHOR, body, BOT, createdAt);
  return { id, author: 'helper-bot', createdAt, bodyHtml: `<p>${body}</p>`, ...(tag ? { bot: tag } : {}) };
}

const verdict = (word: string, met?: string) => `<!-- helper:check ${word}${met ? ` met=${met}` : ''} -->`;

describe('verdict to card view', () => {
  it('maps each verdict word to its chip copy', () => {
    expect(VERDICT_WORDS).toEqual({
      valid: 'Still needed',
      partly: 'Partly done',
      done: 'Already done',
      obsolete: 'No longer applies',
      unclear: 'Cannot tell from the code',
    });
  });

  it('reads the newest verdict, its first line and next step', () => {
    const comments = [
      comment('1', `**Helper check: partly.** Criteria 1 and 3 are in the code already.<br>Trim the rest.${verdict('partly', '1,3')}`),
    ];
    const card = checkCardOf(comments);
    expect(card?.verdict).toBe('partly');
    expect(card?.met).toEqual([1, 3]);
    expect(card?.failed).toBe(false);
    expect(card?.firstLine).toBe('Criteria 1 and 3 are in the code already.');
    expect(card?.nextStep).toBe('Trim the rest.');
    expect(card?.comment.id).toBe('1');
  });

  it('shows a failure when the newest check is the failure text', () => {
    const comments = [comment('1', `${verdict('valid')}`), comment('2', 'Helper could not finish the check: timed out.')];
    expect(checkCardOf(comments)?.failed).toBe(true);
  });

  it('has no card before any check', () => {
    expect(checkCardOf([comment('1', 'Helper check: nothing yet.')])).toBeUndefined();
  });

  it('strips markers and bold from comment text', () => {
    expect(commentLines(`<p>**Helper check: done.** Every criterion is in place.</p>${verdict('done')}`)).toEqual([
      'Helper check: done. Every criterion is in place.',
    ]);
  });
});

describe('which action gets emphasis', () => {
  it('emphasises Close for done, Not planned for obsolete, Hand for valid, and nothing for partly or unclear', () => {
    expect(emphasisFor('done')).toEqual({ close: true, notPlanned: false, hand: false });
    expect(emphasisFor('obsolete')).toEqual({ close: false, notPlanned: true, hand: false });
    expect(emphasisFor('valid')).toEqual({ close: false, notPlanned: false, hand: true });
    expect(emphasisFor('partly')).toEqual({ close: false, notPlanned: false, hand: false });
    expect(emphasisFor('unclear')).toEqual({ close: false, notPlanned: false, hand: false });
    expect(emphasisFor(undefined)).toEqual({ close: false, notPlanned: false, hand: false });
  });

  it('counts the Trim button only for partly with met', () => {
    expect(trimCountFor('partly', [1, 3])).toBe(2);
    expect(trimCountFor('partly', undefined)).toBeUndefined();
    expect(trimCountFor('done', [1])).toBeUndefined();
  });
});

describe('trim note', () => {
  it('reports the newest trim result after the newest check', () => {
    const comments = [
      comment('1', `${verdict('partly', '1,3')}`),
      comment('2', 'Moved 2 criteria. <!-- helper:trim moved=2 -->'),
    ];
    expect(trimNoteOf(comments)).toEqual({ kind: 'trimmed', moved: 2 });
  });

  it('ignores a trim result older than a newer check', () => {
    const comments = [
      comment('1', 'Moved 2 criteria. <!-- helper:trim moved=2 -->'),
      comment('2', `${verdict('partly', '1,3')}`),
    ];
    expect(trimNoteOf(comments)).toBeUndefined();
  });
});

describe('strip open state', () => {
  it('starts collapsed for every issue', () => {
    expect(stripOpen({ issue: 'a', open: false }, 'a')).toBe(false);
    expect(stripOpen({ issue: undefined, open: false }, 'a')).toBe(false);
  });

  it('stays open only for the issue it was opened on', () => {
    expect(stripOpen({ issue: 'a', open: true }, 'a')).toBe(true);
    expect(stripOpen({ issue: 'a', open: true }, 'b')).toBe(false);
  });
});
