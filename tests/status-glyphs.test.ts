import { describe, expect, it } from 'vitest';
import type { CiState, PrSummary } from '../shared/types';
import { issueGlyph, issueSentence, prGlyph, prSentence } from '../web/status-glyphs';
import { ageWords } from '../web/ui';

type Bits = Pick<PrSummary, 'ci' | 'reviewStatus' | 'isDraft' | 'seen' | 'updatedNote'>;

const pr = (ci: CiState, reviewStatus: string, extra: Partial<Bits> = {}): Bits => ({
  ci,
  reviewStatus,
  seen: 'seen',
  ...extra,
});

describe('prGlyph picks the worst state', () => {
  it('ranks CI failing above everything', () => {
    expect(prGlyph(pr('fail', 'changes requested'))).toBe('ci-fail');
    expect(prGlyph(pr('fail', '2 approvals'))).toBe('ci-fail');
  });

  it('ranks changes requested above CI running', () => {
    expect(prGlyph(pr('running', 'changes requested'))).toBe('changes');
    expect(prGlyph(pr('pass', 'changes requested'))).toBe('changes');
  });

  it('ranks CI running above a missing review', () => {
    expect(prGlyph(pr('running', 'needs review'))).toBe('running');
    expect(prGlyph(pr('running', '1 approval'))).toBe('running');
  });

  it('shows needs review for both unreviewed states', () => {
    expect(prGlyph(pr('pass', 'needs review'))).toBe('review');
    expect(prGlyph(pr('none', 'no reviews yet'))).toBe('review');
  });

  it('falls back to approved, never to CI passing or No CI', () => {
    expect(prGlyph(pr('pass', '1 approval'))).toBe('approved');
    expect(prGlyph(pr('none', '3 approvals'))).toBe('approved');
  });
});

describe('prSentence', () => {
  it('leads with CI when the glyph shows CI', () => {
    expect(prSentence(pr('fail', 'needs review'))).toBe('CI failing · needs review');
    expect(prSentence(pr('running', 'no reviews yet'))).toBe('CI running · no reviews yet');
  });

  it('leads with the review otherwise, capitalised', () => {
    expect(prSentence(pr('pass', '1 approval'))).toBe('1 approval · CI passing');
    expect(prSentence(pr('pass', 'changes requested'))).toBe('Changes requested · CI passing');
  });

  it('puts Draft first and names No CI', () => {
    expect(prSentence(pr('none', 'no reviews yet', { isDraft: true }))).toBe('Draft · no reviews yet · No CI');
  });

  it('ends with the updated note only while updated', () => {
    const note = { updatedNote: '2 commits since you looked' };
    expect(prSentence(pr('fail', 'needs review', { ...note, seen: 'updated' }))).toBe(
      'CI failing · needs review · 2 commits since you looked',
    );
    expect(prSentence(pr('fail', 'needs review', { ...note, seen: 'seen' }))).toBe('CI failing · needs review');
  });
});

describe('issue status', () => {
  it('maps each default option to its glyph and a dash when unset', () => {
    expect(['Backlog', 'Ready', 'In progress', 'In review', 'Done', undefined].map(issueGlyph)).toEqual([
      'backlog',
      'ready',
      'progress',
      'in-review',
      'done',
      'none',
    ]);
  });

  it('names the status, or No project status, then the updated note', () => {
    expect(issueSentence({ status: 'In progress', seen: 'updated', updatedNote: '1 new comment' })).toBe(
      'In progress · 1 new comment',
    );
    expect(issueSentence({ seen: 'seen', updatedNote: '1 new comment' })).toBe('No project status');
  });
});

describe('ageWords', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('spells out minutes, hours and days with plurals', () => {
    expect(ageWords(ago(5 * 60_000), now)).toBe('5 minutes ago');
    expect(ageWords(ago(60 * 60_000), now)).toBe('1 hour ago');
    expect(ageWords(ago(2 * 3_600_000), now)).toBe('2 hours ago');
    expect(ageWords(ago(3 * 86_400_000), now)).toBe('3 days ago');
  });
});
