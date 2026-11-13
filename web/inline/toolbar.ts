/**
 * Pure text edits for the composer toolbar. Each returns the new text and the selection to set
 * after the edit, so the caller can write both to the textarea. `start` and `end` are the
 * selection (equal when there is no selection); offsets are UTF-16 indexes into `text`.
 */

export interface Edit {
  text: string;
  start: number;
  end: number;
}

/** Wraps the selection with `before` and `after`. With no selection, inserts the pair and puts the caret between. */
export function wrapSelection(text: string, start: number, end: number, before: string, after: string): Edit {
  const picked = text.slice(start, end);
  const next = text.slice(0, start) + before + picked + after + text.slice(end);
  const from = start + before.length;
  return { text: next, start: from, end: from + picked.length };
}

/** Inserts `insert` in place of the selection and puts the caret after it. */
export function insertAtCaret(text: string, start: number, end: number, insert: string): Edit {
  const next = text.slice(0, start) + insert + text.slice(end);
  const caret = start + insert.length;
  return { text: next, start: caret, end: caret };
}

/**
 * Adds a prefix to every line the selection touches. `prefix(i)` gets the line's index in the
 * selection (0-based), so a numbered list can count. A selection that ends right after a newline
 * does not touch the next line.
 */
export function prefixLines(text: string, start: number, end: number, prefix: (i: number) => string): Edit {
  const lineStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const last = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const nl = text.indexOf('\n', last);
  const lineEnd = nl === -1 ? text.length : nl;
  const block = text.slice(lineStart, lineEnd).split('\n');
  const out = block.map((line, i) => prefix(i) + line).join('\n');
  const next = text.slice(0, lineStart) + out + text.slice(lineEnd);
  const added = out.length - block.join('\n').length;
  // The first line's prefix sits before the selection start, so the start moves by it too.
  return { text: next, start: start + prefix(0).length, end: end + added };
}

export const numbered = (i: number) => `${i + 1}. `;
export const bullet = () => '- ';
export const task = () => '- [ ] ';
export const quote = () => '> ';
export const heading = () => '## ';
