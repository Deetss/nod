import { describe, expect, it } from 'vitest';
import { highlight } from '../web/highlight';

const comments = (text: string, yaml = false) => highlight(text, yaml).filter((t) => t.comment).map((t) => t.text);

describe('highlight comments', () => {
  it('draws a whole // line as one comment token, with no keyword colours inside', () => {
    const toks = highlight("  // In dev, don't return unless the module opts in.", false);
    expect(toks.filter((t) => t.comment)).toHaveLength(1);
    expect(toks.find((t) => t.comment)?.text).toBe("// In dev, don't return unless the module opts in.");
    expect(toks.filter((t) => !t.comment && t.color)).toEqual([]);
  });

  it('keeps code before a trailing comment highlighted', () => {
    const toks = highlight("const a = 'x'; // note: return", false);
    expect(toks.find((t) => t.text === 'const')?.color).toBeDefined();
    expect(toks.find((t) => t.text === "'x'")?.color).toBeDefined();
    expect(comments("const a = 'x'; // note: return")).toEqual(['// note: return']);
  });

  it('does not treat // inside a string or a URL as a comment', () => {
    expect(comments('const u = "https://example.test/a // b";')).toEqual([]);
    expect(comments('url: https://example.test/path', true)).toEqual([]);
    expect(comments("const u = 'http://x'; return u;")).toEqual([]);
  });

  it('handles # comments in Ruby and YAML but not a bare # in code', () => {
    expect(comments('  # rubocop:disable Metrics')).toEqual(['# rubocop:disable Metrics']);
    expect(comments('key: value # trailing', true)).toEqual(['# trailing']);
    expect(comments('color: "#fff"', true)).toEqual([]);
    expect(comments('const id = `#${name}`;')).toEqual([]);
  });

  it('handles block comment openers and bodies', () => {
    expect(comments('/** Returns the sale. */')).toEqual(['/** Returns the sale. */']);
    expect(comments(' * @param id the sale id')).toEqual(['* @param id the sale id']);
    expect(comments(' */')).toEqual(['*/']);
    expect(comments('  * 2', true)).toEqual([]);
  });

  it('leaves plain code unchanged', () => {
    expect(comments('export const bootAnalytics = () => {')).toEqual([]);
    expect(highlight('if (x) return y;', false).find((t) => t.text === 'return')?.color).toBeDefined();
  });
});
