import type { CheckFlowState, TrimFlowState } from '../../shared/bot';
import type { CheckVerdict, IssueComment } from '../../shared/issue-types';
import { checkCardOf, trimCountFor, trimNoteOf, VERDICT_WORDS, type CheckCard, type TrimNote } from '../issues/bot-card';

/** What the phone shows of the bot check: the flow states, the newest verdict card and the Trim result. */
export interface PhoneBotState {
  check: CheckFlowState;
  trim: TrimFlowState;
  card?: CheckCard;
  /** The Trim button's count, when the newest verdict offers Trim. */
  trimCount?: number;
  /** The newest Trim result after the newest check. */
  note?: TrimNote;
}

export function phoneBotState(check: CheckFlowState, trim: TrimFlowState, comments: readonly IssueComment[]): PhoneBotState {
  const card = checkCardOf(comments);
  return {
    check,
    trim,
    card,
    trimCount: card?.verdict ? trimCountFor(card.verdict, card.met) : undefined,
    note: trimNoteOf(comments),
  };
}

/** One glyph per verdict, so the chip differs by icon as well as words. */
export const VERDICT_GLYPH: Record<CheckVerdict, string> = {
  valid: '!',
  partly: '◐',
  done: '✓',
  obsolete: '⊘',
  unclear: '?',
};

/** The header chip: a verdict with its icon and words, Checking... while pending, or the idle and failed text. */
export type HeaderCheck =
  | { kind: 'checking'; text: string }
  | { kind: 'verdict'; verdict: CheckVerdict; glyph: string; text: string; commentId: string }
  | { kind: 'failed'; text: string }
  | { kind: 'idle'; text: string };

export function headerCheck(s: PhoneBotState): HeaderCheck | undefined {
  if (s.check === 'hidden') return undefined;
  if (s.check === 'pending') return { kind: 'checking', text: 'Checking...' };
  if (s.check === 'failed') return { kind: 'failed', text: 'Check failed. Nothing changed.' };
  if (s.check === 'verdict' && s.card?.verdict) {
    const verdict = s.card.verdict;
    return { kind: 'verdict', verdict, glyph: VERDICT_GLYPH[verdict], text: VERDICT_WORDS[verdict], commentId: s.card.comment.id };
  }
  return { kind: 'idle', text: 'No check yet' };
}

/** The line under the chip for the Trim states. `ok` and `danger` pick the colour; the words carry the meaning. */
export interface TrimLine {
  tone: 'muted' | 'ok' | 'danger';
  text: string;
}

export function trimLine(s: PhoneBotState): TrimLine | undefined {
  if (s.trim === 'pending') {
    return s.trimCount !== undefined ? { tone: 'muted', text: `Trimming the ${s.trimCount} met criteria.` } : { tone: 'muted', text: 'Trimming...' };
  }
  if (s.trim === 'trimmed' && s.note?.kind === 'trimmed') {
    return { tone: 'ok', text: `Trimmed ${s.note.moved} criteria into Already done` };
  }
  if (s.trim === 'refused' && s.note?.kind === 'refused') return { tone: 'danger', text: s.note.reason };
  if (s.trim === 'failed') return { tone: 'danger', text: 'Trim failed. Nothing changed.' };
  return undefined;
}
