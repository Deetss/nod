import type { CheckVerdict, IssueComment } from '../../shared/issue-types';
import { followUpFor, latestCheck } from '../../shared/bot';

/** The chip words for each verdict. The client sets them from the marker, so they can be translated later. */
export const VERDICT_WORDS: Record<CheckVerdict, string> = {
  valid: 'Still needed',
  partly: 'Partly done',
  done: 'Already done',
  obsolete: 'No longer applies',
  unclear: 'Cannot tell from the code',
};

/** The comment's text as lines, with tags, markers, bold stars and common entities removed. */
export function commentLines(html: string): string[] {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/(p|li|h[1-6]|div)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
  return text
    .split('\n')
    .map((s) => s.replace(/\*\*/g, '').trim())
    .filter((s) => s.length > 0);
}

/** What the card shows for the newest check: the verdict or the failure, with the comment's first line and next step. */
export interface CheckCard {
  verdict?: CheckVerdict;
  met?: number[];
  failed: boolean;
  firstLine: string;
  nextStep: string;
  comment: IssueComment;
}

/** The newest check the bot posted, read from its comment. Trust is already decided by `botTag`. */
export function checkCardOf(comments: readonly IssueComment[]): CheckCard | undefined {
  const last = latestCheck(comments);
  if (!last) return undefined;
  const comment = comments.findLast((c) => {
    const tag = c.bot;
    return typeof tag === 'object' ? tag.kind === 'check' : tag === 'check-failed';
  });
  if (!comment) return undefined;
  const lines = commentLines(comment.bodyHtml);
  const first = (lines[0] ?? '').replace(/^.*?check:\s*[a-z]+\.\s*/i, '');
  return {
    verdict: last.kind === 'check' ? last.verdict : undefined,
    met: last.kind === 'check' ? last.met : undefined,
    failed: last.kind === 'failed',
    firstLine: first,
    nextStep: lines.slice(1).join(' '),
    comment,
  };
}

/** Which existing action buttons take the primary style for a verdict. Trim lives on the card and is not listed. */
export interface Emphasis {
  close: boolean;
  notPlanned: boolean;
  hand: boolean;
}

export function emphasisFor(verdict: CheckVerdict | undefined): Emphasis {
  const f = verdict ? followUpFor(verdict) : undefined;
  return { close: f?.kind === 'close', notPlanned: f?.kind === 'not-planned', hand: f?.kind === 'hand' };
}

/** The Trim button's count when the newest check offers Trim, else undefined. */
export function trimCountFor(verdict: CheckVerdict | undefined, met: number[] | undefined): number | undefined {
  if (!verdict) return undefined;
  const f = followUpFor(verdict, met);
  return f?.kind === 'trim' ? f.count : undefined;
}

/** The newest Trim result after the newest check: moved, refused with its reason, or failed. */
export type TrimNote = { kind: 'trimmed'; moved: number } | { kind: 'refused'; reason: string } | { kind: 'failed' };

export function trimNoteOf(comments: readonly IssueComment[]): TrimNote | undefined {
  for (let i = comments.length - 1; i >= 0; i--) {
    const tag = comments[i]?.bot;
    if (typeof tag === 'object' && tag.kind === 'trim') return { kind: 'trimmed', moved: tag.moved };
    if (typeof tag === 'object' && tag.kind === 'trim-refused') return { kind: 'refused', reason: tag.reason };
    if (tag === 'trim-failed') return { kind: 'failed' };
    if (typeof tag === 'object' ? tag.kind === 'check' : tag === 'check-failed') return undefined;
  }
  return undefined;
}

/** The strip's open state is per issue: opening another issue starts collapsed. */
export interface StripState {
  issue?: string;
  open: boolean;
}

export const stripOpen = (state: StripState, issue: string | undefined): boolean => state.issue === issue && state.open;
