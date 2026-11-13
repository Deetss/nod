import { describe, expect, it } from 'vitest';
import { filterCandidates, insertMention, mentionTrigger, rankCandidates, screenPeople, type MentionCandidate } from '../web/mentions/mention-logic';

const person = (login: string, reason = 'commenter'): MentionCandidate => ({ kind: 'person', login, reason });

describe('mentionTrigger', () => {
  it('opens at the start of a word and after a space', () => {
    expect(mentionTrigger('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionTrigger('hi @jj', 6)).toEqual({ start: 3, query: 'jj' });
  });

  it('does not open inside a word', () => {
    expect(mentionTrigger('mail@jj', 7)).toBeUndefined();
  });

  it('reads only up to the caret', () => {
    expect(mentionTrigger('@riley-k later', 3)).toEqual({ start: 0, query: 'ri' });
  });
});

describe('filterCandidates and rankCandidates', () => {
  const list = [person('riley-k'), person('sam-lee'), person('jordan-q'), person('acme-dev')];

  it('filters by login, case-insensitively, keeping order', () => {
    expect(filterCandidates(list, 'SAM').map((c) => c.login)).toEqual(['sam-lee']);
    expect(filterCandidates(list, 'zzq')).toEqual([]);
  });

  it('keeps the highest rank for a duplicate login', () => {
    const merged = rankCandidates([person('riley-k', 'author')], [person('RILEY-K', 'commenter'), person('sam-lee')]);
    expect(merged.map((c) => [c.login, c.reason])).toEqual([
      ['riley-k', 'author'],
      ['sam-lee', 'commenter'],
    ]);
  });

  it('orders screen people author, reviewers, assignees, commenters', () => {
    const out = screenPeople('build-bot', ['jordan-q'], ['acme-dev'], ['sam-lee', 'build-bot']);
    expect(out.map((c) => [c.login, c.reason])).toEqual([
      ['build-bot', 'author'],
      ['jordan-q', 'reviewer requested'],
      ['acme-dev', 'assignee'],
      ['sam-lee', 'commenter'],
    ]);
  });
});

describe('insertMention', () => {
  it('replaces the partial at the caret and leaves the rest of the text', () => {
    // Text "hi @jj there", caret after "jj" (index 6).
    const out = insertMention('hi @jj there', 3, 6, 'riley-k');
    expect(out).toEqual({ text: 'hi @riley-k  there', caret: 12 });
  });

  it('inserts at the start of a line', () => {
    expect(insertMention('@', 0, 1, 'acme-dev')).toEqual({ text: '@acme-dev ', caret: 10 });
  });
});

describe('trigger ends at a space', () => {
  it('a space after a complete login is outside the trigger', () => {
    expect(mentionTrigger('@riley-k ', 9)).toBeUndefined();
    expect(mentionTrigger('@riley-k', 8)).toEqual({ start: 0, query: 'riley-k' });
  });
});
