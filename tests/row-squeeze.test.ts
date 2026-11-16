// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { squeezeMeta } from '../web/phone/row-squeeze';

const GAP = 12;

interface Part {
  cls: string;
  w: number;
  more?: number;
}

/**
 * A line 3 whose scrollWidth follows the squeeze classes the way the CSS does:
 * hidden items take no room, and a squeezed repo name shrinks to `--repo-min`.
 */
function meta(width: number, parts: Part[], chips: number[] = []): HTMLElement {
  const el = document.createElement('span');
  el.className = 'ph-lrow-meta';
  if (chips.length > 0) {
    const wrap = document.createElement('span');
    wrap.className = 'ph-lrow-chips';
    chips.forEach((w) => {
      const c = document.createElement('span');
      c.className = 'chip label-chip';
      c.dataset.w = String(w);
      wrap.append(c);
    });
    for (let k = 0; k <= chips.length; k++) {
      const m = document.createElement('span');
      m.className = 'chip chip-more';
      m.dataset.k = String(k);
      m.dataset.w = '24';
      m.hidden = k !== 0;
      wrap.append(m);
    }
    el.append(wrap);
  }
  for (const p of parts) {
    const s = document.createElement('span');
    s.className = p.cls;
    s.dataset.w = String(p.w);
    if (p.cls === 'ph-lrow-repo-name') Object.defineProperty(s, 'scrollWidth', { get: () => p.w });
    el.append(s);
  }
  const used = (): number => {
    const has = (c: string) => el.classList.contains(c);
    const widths: number[] = [];
    const chipEls = [...el.querySelectorAll<HTMLElement>('.ph-lrow-chips > *')].filter((c) => !c.hidden);
    if (chipEls.length) widths.push(chipEls.reduce((a, c) => a + Number(c.dataset.w), 0) + 6 * (chipEls.length - 1));
    for (const s of [...el.children] as HTMLElement[]) {
      if (s.classList.contains('ph-lrow-chips')) continue;
      if (s.classList.contains('ph-lrow-author') && has('is-no-author')) continue;
      if (s.classList.contains('ph-lrow-files') && has('is-no-files')) continue;
      const w = Number(s.dataset.w);
      const min = parseFloat(el.style.getPropertyValue('--repo-min')) || 64;
      widths.push(s.classList.contains('ph-lrow-repo-name') && has('is-squeezed') ? min : w);
    }
    return widths.reduce((a, b) => a + b, 0) + GAP * (widths.length - 1);
  };
  el.dataset.width = String(width);
  const client = () => Number(el.dataset.width);
  Object.defineProperty(el, 'clientWidth', { get: client });
  Object.defineProperty(el, 'scrollWidth', { get: () => Math.max(client(), used()) });
  return el;
}

const pr = (repo: number): Part[] => [
  { cls: 'ph-lrow-repo-name', w: repo },
  { cls: 'row-num', w: 40 },
  { cls: 'ph-lrow-author', w: 70 },
  { cls: 'ph-lrow-files', w: 40 },
  { cls: 'ph-lrow-end', w: 120 },
];

const classes = (el: HTMLElement) => [...el.classList].filter((c) => c.startsWith('is-'));

describe('squeezeMeta order', () => {
  it('leaves a row that fits alone', () => {
    const el = meta(420, pr(100));
    squeezeMeta(el);
    expect(classes(el)).toEqual([]);
  });

  it('drops the author first', () => {
    const el = meta(400, pr(140));
    squeezeMeta(el);
    expect(classes(el)).toEqual(['is-no-author']);
  });

  it('then lets the repo name ellipsize down to 64px', () => {
    const el = meta(330, pr(220));
    squeezeMeta(el);
    expect(classes(el)).toEqual(['is-no-author', 'is-squeezed']);
    expect(el.style.getPropertyValue('--repo-min')).toBe('64px');
  });

  it('then drops the files count on a PR row', () => {
    const el = meta(260, pr(220));
    squeezeMeta(el);
    expect(classes(el)).toEqual(['is-no-author', 'is-squeezed', 'is-no-files']);
  });

  it('never sets a repo minimum wider than the name itself', () => {
    const el = meta(260, pr(40));
    squeezeMeta(el);
    expect(el.style.getPropertyValue('--repo-min')).toBe('40px');
  });

  it('folds issue labels into +N one at a time, last label first', () => {
    const issue: Part[] = [
      { cls: 'ph-lrow-repo-name', w: 200 },
      { cls: 'row-num', w: 40 },
      { cls: 'ph-lrow-author', w: 70 },
      { cls: 'ph-lrow-end', w: 30 },
    ];
    const el = meta(300, issue, [60, 50]);
    squeezeMeta(el);
    const chips = [...el.querySelectorAll<HTMLElement>('.label-chip')].map((c) => c.hidden);
    const shown = [...el.querySelectorAll<HTMLElement>('.chip-more')].filter((m) => !m.hidden).map((m) => m.dataset.k);
    expect(classes(el)).toEqual(['is-no-author', 'is-squeezed']);
    expect(chips).toEqual([false, true]);
    expect(shown).toEqual(['1']);
  });

  it('starts from scratch on every run', () => {
    const el = meta(260, pr(220));
    squeezeMeta(el);
    el.dataset.width = '600';
    squeezeMeta(el);
    expect(classes(el)).toEqual([]);
    expect(el.style.getPropertyValue('--repo-min')).toBe('');
  });
});
