export type FormatKind = 'bold' | 'italic' | 'code' | 'list' | 'link';

export interface Edit {
  text: string;
  start: number;
  end: number;
}

const WRAP: Record<'bold' | 'italic' | 'code', string> = { bold: '**', italic: '_', code: '`' };

/** Inserts markdown around the selection and returns the new text and selection. */
export function wrapSelection(text: string, start: number, end: number, kind: FormatKind): Edit {
  const sel = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);

  if (kind === 'list') {
    const lines = (sel || '').split('\n').map((l) => `- ${l}`).join('\n');
    return { text: before + lines + after, start, end: start + lines.length };
  }
  if (kind === 'link') {
    const label = sel || 'text';
    const insert = `[${label}](url)`;
    const urlAt = start + label.length + 3;
    return { text: before + insert + after, start: urlAt, end: urlAt + 3 };
  }
  const mark = WRAP[kind];
  return {
    text: before + mark + sel + mark + after,
    start: start + mark.length,
    end: start + mark.length + sel.length,
  };
}
