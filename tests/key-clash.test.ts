import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FOOTER_COMFORTABLE, FOOTER_FINDINGS, FOOTER_NARROW, FOOTER_WIDE } from '../web/keys';

const single = (list: { keys: string }[]): string[] => list.flatMap((k) => k.keys.split(/\s+/));

describe('finding card keys', () => {
  const card = FOOTER_FINDINGS.map((k) => k.keys).filter((k) => k.length === 1);

  it('has no two actions on the same key', () => {
    expect(new Set(card).size).toBe(card.length);
  });

  it.each([
    ['wide footer', FOOTER_WIDE],
    ['comfortable footer', FOOTER_COMFORTABLE],
    ['narrow footer', FOOTER_NARROW],
  ])('does not reuse a PR action key from the %s', (_n, list) => {
    const pr = single(list);
    expect(card.filter((k) => pr.includes(k))).toEqual([]);
  });

  it('draws the Reply button with the footer key', () => {
    const reply = FOOTER_FINDINGS.find((k) => k.label === 'reply')?.keys;
    const src = readFileSync('web/FindingList.tsx', 'utf8');
    expect(src).toContain('label="Reply" cap="' + reply + '"');
    expect(src).toContain(reply + ': thread && !thread.resolved');
  });
});
