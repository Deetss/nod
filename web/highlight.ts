export interface Token {
  text: string;
  color?: string;
  /** The token is part of a comment; drawn muted and italic. */
  comment?: boolean;
}

const KEYWORDS = new Set([
  'do', 'end', 'class', 'module', 'def', 'if', 'else', 'elsif', 'unless', 'return', 'begin',
  'rescue', 'true', 'false', 'nil', 'function', 'const', 'import', 'export', 'from', 'async',
  'await', 'interface', 'type',
]);

const KEYWORD = 'var(--prettylights-syntax-keyword)';
const STRING = 'var(--prettylights-syntax-string)';
const CONSTANT = 'var(--prettylights-syntax-constant)';
const TAG = 'var(--prettylights-syntax-entity-tag)';

const COMMENT = 'var(--prettylights-syntax-comment)';

// Comments need a line start or whitespace before them, so a URL such as https://x is not one.
const TOKEN_RE =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(:[A-Za-z_]\w*[?!]?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
const YAML_KEY_RE = /^(\s*(?:- )?)([\w\-/{}.]+)(:)(\s|$)/;
const LINE_COMMENT_RE = /(?<=^|\s)(?:\/\/|#(?=\s|$)).*$/;
const BLOCK_OPEN_RE = /(?<=^|\s)\/\*.*$/;
const BLOCK_BODY_RE = /^\s*\*(?:\/|\s|$).*$/;

/** Start of a trailing comment outside any string, or -1. Strings are skipped so `"a // b"` stays code. */
function commentStart(text: string, yaml: boolean): number {
  let at = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (m[1]) {
      const c = commentIn(text.slice(at, idx), at, yaml);
      if (c >= 0) return c;
      at = idx + m[0].length;
    }
  }
  return commentIn(text.slice(at), at, yaml);
}

function commentIn(chunk: string, offset: number, yaml: boolean): number {
  const atLineStart = offset === 0;
  if (atLineStart && !yaml && BLOCK_BODY_RE.test(chunk)) return chunk.search(/\S/) + offset;
  const m = LINE_COMMENT_RE.exec(chunk) ?? BLOCK_OPEN_RE.exec(chunk);
  return m ? m.index + offset : -1;
}

/** Light-weight highlighter: comments, strings, symbols, numbers, keywords and YAML keys. */
export function highlight(text: string, yaml: boolean): Token[] {
  const cut = commentStart(text, yaml);
  if (cut >= 0) {
    const head = cut > 0 ? highlight(text.slice(0, cut), yaml) : [];
    return [...head, { text: text.slice(cut), color: COMMENT, comment: true }];
  }
  const out: Token[] = [];
  let rest = text;
  if (yaml) {
    const m = YAML_KEY_RE.exec(text);
    if (m) {
      out.push({ text: m[1] ?? '' }, { text: m[2] ?? '', color: TAG }, { text: ':' });
      rest = text.slice((m[1]?.length ?? 0) + (m[2]?.length ?? 0) + 1);
    }
  }
  let last = 0;
  for (const m of rest.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: rest.slice(last, at) });
    const tok = m[0];
    let color: string | undefined;
    if (m[1]) color = STRING;
    else if (m[2] || m[3]) color = CONSTANT;
    else if (m[4] && KEYWORDS.has(tok)) color = KEYWORD;
    out.push({ text: tok, color });
    last = at + tok.length;
  }
  if (last < rest.length) out.push({ text: rest.slice(last) });
  return out;
}
