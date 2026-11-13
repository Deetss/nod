import type { InlineCommentBody } from '../api';
import type { ComposerTarget } from './composer-state';

/**
 * The body of `POST comments/inline` and `POST comments/draft` for a composer target and its text.
 * Returns undefined when the text is blank, since the server refuses an empty body.
 * A file comment carries no line fields. A line comment carries `startSide` only with `startLine`.
 * The PR head is not sent: the server reads it fresh when it posts.
 */
export function commentRequestBody(target: ComposerTarget, text: string): InlineCommentBody | undefined {
  const body = text.trim();
  if (body === '') return undefined;
  if (target.subject === 'file') return { body, path: target.path, subjectType: 'file' };
  if (target.startLine !== undefined && target.startLine > target.line) {
    throw new Error('A range starts after its last line');
  }
  return {
    body,
    path: target.path,
    subjectType: 'line',
    line: target.line,
    side: target.side,
    ...(target.startLine === undefined ? {} : { startLine: target.startLine, startSide: target.side }),
  };
}
