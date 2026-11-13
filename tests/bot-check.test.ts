import { describe, expect, it } from 'vitest';
import type { IssueComment } from '../shared/issue-types';
import {
  botTag,
  checkCommand,
  checkFailedText,
  checkState,
  followUpFor,
  trimCommand,
  trimMarker,
  trimRefusedMarker,
  trimState,
  type BotRequest,
} from '../shared/bot';
import type { BotSettings } from '../shared/settings';
import { TEST_BOT } from './bot-settings';

const BOT: BotSettings = { ...TEST_BOT, name: 'Helper', command: '/helper', login: 'helper-bot', marker: 'helper' };
const BOT_AUTHOR = { __typename: 'Bot', login: 'helper-bot[bot]' };
const USER = { __typename: 'User', login: 'someone' };
const AFTER_CUTOFF = new Date(2026, 10, 12, 22, 30).toISOString();
const BEFORE_CUTOFF = new Date(2026, 10, 12, 21, 0).toISOString();

const verdict = (word: string, met?: string) => `<!-- helper:check ${word}${met ? ` met=${met}` : ''} -->`;

/** A comment as `issue-map` would build it: the bot tag comes from `botTag` with the same settings. */
function comment(
  id: string,
  author: { __typename: string; login: string },
  body: string,
  opts: { createdAt?: string; updatedAt?: string; b?: BotSettings } = {},
): IssueComment {
  const createdAt = opts.createdAt ?? AFTER_CUTOFF;
  const tag = botTag(author, body, opts.b ?? BOT, createdAt);
  return {
    id,
    author: author.login,
    createdAt,
    ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
    bodyHtml: `<p>${body}</p>`,
    ...(tag ? { bot: tag } : {}),
  };
}

const request = (after: string | undefined, at: string, count = 1): BotRequest => ({ after, count, at });

describe('marker parsing', () => {
  it.each(['valid', 'partly', 'done', 'obsolete', 'unclear'])('reads the %s verdict from the bot', (word) => {
    expect(botTag(BOT_AUTHOR, `**Helper check: ${word}.**\n\n${verdict(word)}`, BOT, AFTER_CUTOFF)).toEqual({
      kind: 'check',
      verdict: word,
    });
  });

  it('reads met=1,3 on a partly verdict after the cutoff', () => {
    expect(botTag(BOT_AUTHOR, verdict('partly', '1,3'), BOT, AFTER_CUTOFF)).toEqual({
      kind: 'check',
      verdict: 'partly',
      met: [1, 3],
    });
  });

  it('drops met on a comment older than 2026-11-12 22:00', () => {
    expect(botTag(BOT_AUTHOR, verdict('partly', '1,3'), BOT, BEFORE_CUTOFF)).toEqual({ kind: 'check', verdict: 'partly' });
  });

  it('drops met when the comment has no time, failing closed', () => {
    expect(botTag(BOT_AUTHOR, verdict('partly', '1,3'), BOT)).toEqual({ kind: 'check', verdict: 'partly' });
  });

  it('keeps met only on partly, never on other verdicts', () => {
    expect(botTag(BOT_AUTHOR, verdict('done', '1,3'), BOT, AFTER_CUTOFF)).toEqual({ kind: 'check', verdict: 'done' });
  });

  it('ignores a forged marker from a non-bot author', () => {
    expect(botTag(USER, verdict('valid'), BOT, AFTER_CUTOFF)).toBeUndefined();
  });

  it('ignores a marker from another bot login', () => {
    expect(botTag({ __typename: 'Bot', login: 'other-bot' }, verdict('valid'), BOT, AFTER_CUTOFF)).toBeUndefined();
  });

  it('ignores an unknown verdict word', () => {
    expect(botTag(BOT_AUTHOR, verdict('maybe'), BOT, AFTER_CUTOFF)).toBe('plain');
  });

  it('uses the configured marker, escaping regex characters', () => {
    const dotted: BotSettings = { ...BOT, marker: 'a.b' };
    expect(botTag(BOT_AUTHOR, '<!-- a.b:check done -->', dotted, AFTER_CUTOFF)).toEqual({ kind: 'check', verdict: 'done' });
    // The dot is literal: `axb` is not the marker.
    expect(botTag(BOT_AUTHOR, '<!-- axb:check done -->', dotted, AFTER_CUTOFF)).toBe('plain');
  });

  it('does not read the Helper marker when the settings use another', () => {
    const other: BotSettings = { ...BOT, marker: 'helper-bot' };
    expect(botTag(BOT_AUTHOR, verdict('valid'), other, AFTER_CUTOFF)).toBe('plain');
  });

  it('reads the failure text as check-failed, with no marker', () => {
    expect(botTag(BOT_AUTHOR, checkFailedText(BOT), BOT, AFTER_CUTOFF)).toBe('check-failed');
  });

  it('exposes the check and trim commands from the configured command', () => {
    expect(checkCommand(BOT)).toBe('/helper check');
    expect(trimCommand(BOT)).toBe('/helper trim');
  });
});

describe('checkState', () => {
  it('is idle with no request and no check', () => {
    expect(checkState([comment('1', USER, 'hello')], undefined)).toBe('idle');
  });

  it('is pending after the request while the ack has no marker', () => {
    const ack = comment('2', BOT_AUTHOR, '**Helper check: checking.**', { createdAt: AFTER_CUTOFF });
    const req = request('1', '2026-11-12T20:00:00.000Z');
    expect(checkState([comment('1', USER, 'hello'), ack], req)).toBe('pending');
  });

  it('ends pending when the ack is edited after the request into a verdict', () => {
    const ack = comment('2', BOT_AUTHOR, `**Helper check: valid.**\n\n${verdict('valid')}`, {
      createdAt: '2026-11-12T19:50:00.000Z',
      updatedAt: '2026-11-12T20:10:00.000Z',
    });
    const req = request('2', '2026-11-12T20:00:00.000Z');
    expect(checkState([ack], req)).toBe('verdict');
  });

  it('ends pending when the ack is edited after the request even with no marker yet', () => {
    const ack = comment('2', BOT_AUTHOR, '**Helper check: checking.**', {
      createdAt: '2026-11-12T19:50:00.000Z',
      updatedAt: '2026-11-12T20:10:00.000Z',
    });
    expect(checkState([ack], request('2', '2026-11-12T20:00:00.000Z'))).not.toBe('pending');
  });

  it('ends pending on a newer bot comment carrying a check marker', () => {
    const old = comment('2', BOT_AUTHOR, 'ack', { createdAt: '2026-11-12T19:50:00.000Z' });
    const fresh = comment('3', BOT_AUTHOR, `done ${verdict('done')}`, { createdAt: '2026-11-12T20:05:00.000Z' });
    expect(checkState([old, fresh], request('2', '2026-11-12T20:00:00.000Z'))).toBe('verdict');
  });

  it('ends pending on a newer bot comment carrying the failure text', () => {
    const old = comment('2', BOT_AUTHOR, 'ack', { createdAt: '2026-11-12T19:50:00.000Z' });
    const fail = comment('3', BOT_AUTHOR, checkFailedText(BOT), { createdAt: '2026-11-12T20:05:00.000Z' });
    expect(checkState([old, fail], request('2', '2026-11-12T20:00:00.000Z'))).toBe('failed');
  });

  it('stays pending on a newer bot comment with no check marker or failure text', () => {
    const old = comment('2', BOT_AUTHOR, 'ack', { createdAt: '2026-11-12T19:50:00.000Z' });
    const other = comment('3', BOT_AUTHOR, 'Some other note.', { createdAt: '2026-11-12T20:05:00.000Z' });
    expect(checkState([old, other], request('2', '2026-11-12T20:00:00.000Z'))).toBe('pending');
  });
});

describe('trimState', () => {
  const issue = { updatedAt: '2026-11-12T19:00:00.000Z' };
  const partly = comment('10', BOT_AUTHOR, `partly ${verdict('partly', '1,3')}`, { createdAt: AFTER_CUTOFF });

  it('offers trim after a partly verdict with met', () => {
    expect(trimState([partly], undefined, issue)).toBe('offered');
  });

  it('is pending until a newer bot comment arrives', () => {
    expect(trimState([partly], request('10', '2026-11-12T20:00:00.000Z'), issue)).toBe('pending');
  });

  it('ends pending on a newer bot comment, showing the trimmed result', () => {
    const moved = comment('11', BOT_AUTHOR, `Moved 2.\n\n${trimMarker(BOT, 2)}`, { createdAt: '2026-11-12T22:45:00.000Z' });
    expect(trimState([partly, moved], request('10', '2026-11-12T22:40:00.000Z'), issue)).toBe('trimmed');
  });

  it('ends pending when the issue body is newer than the request', () => {
    const newerBody = { updatedAt: '2026-11-12T21:00:00.000Z' };
    expect(trimState([partly], request('10', '2026-11-12T20:00:00.000Z'), newerBody)).toBe('offered');
  });

  it('shows refused with the reason when the bot refuses', () => {
    const refused = comment('11', BOT_AUTHOR, `Nothing matched.\n\n${trimRefusedMarker(BOT)}`, { createdAt: '2026-11-12T22:45:00.000Z' });
    expect(trimState([partly, refused], undefined, issue)).toBe('refused');
  });

  it('is hidden when the newest check is not partly with met', () => {
    const done = comment('12', BOT_AUTHOR, verdict('done'), { createdAt: AFTER_CUTOFF });
    expect(trimState([partly, done], undefined, issue)).toBe('hidden');
  });
});

describe('followUpFor', () => {
  it('gives Trim with the count for partly with met', () => {
    expect(followUpFor('partly', [1, 3])).toEqual({ kind: 'trim', count: 2 });
  });

  it('gives no follow-up for partly without met', () => {
    expect(followUpFor('partly')).toBeUndefined();
    expect(followUpFor('partly', [])).toBeUndefined();
  });

  it('gives Close as completed for done', () => {
    expect(followUpFor('done')).toEqual({ kind: 'close' });
  });

  it('gives Not planned for obsolete', () => {
    expect(followUpFor('obsolete')).toEqual({ kind: 'not-planned' });
  });

  it('gives Hand to the bot for valid', () => {
    expect(followUpFor('valid')).toEqual({ kind: 'hand' });
  });

  it('gives none for unclear', () => {
    expect(followUpFor('unclear')).toBeUndefined();
  });
});
