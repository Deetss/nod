import { describe, expect, it } from 'vitest';
import { parseHidden } from '../web/hidden-sections';

describe('parseHidden', () => {
  it('keeps known section keys in list order', () => {
    expect(parseHidden('["closed","dependabot","org"]')).toEqual(['org', 'dependabot', 'closed']);
  });

  it('drops unknown keys', () => {
    expect(parseHidden('["org","nope",3]')).toEqual(['org']);
  });

  it('returns nothing for missing, malformed or non-array values', () => {
    expect(parseHidden(null)).toEqual([]);
    expect(parseHidden('{bad')).toEqual([]);
    expect(parseHidden('{"org":true}')).toEqual([]);
  });
});
