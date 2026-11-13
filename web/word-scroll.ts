/** Space kept left of a revealed highlight, about six characters. */
export const WORD_CONTEXT_PX = 48;

/** A file body's horizontal scroller. `gutter` is the sticky line-number column covering its left edge. */
export interface SideView {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
  gutter: number;
}

/** A word highlight's horizontal extent, in the scroller's content coordinates. */
export interface WordSpan {
  left: number;
  right: number;
}

/**
 * The scrollLeft that brings the first changed word into view, or undefined to stay put:
 * when Wrap is on, the user already scrolled this file sideways, or the word is visible.
 */
export function wordScrollLeft(
  view: SideView,
  word: WordSpan,
  opts: { wrap: boolean; userScrolled: boolean },
): number | undefined {
  if (opts.wrap || opts.userScrolled) return undefined;
  const viewLeft = view.scrollLeft + view.gutter;
  const viewRight = view.scrollLeft + view.clientWidth;
  const fits = word.right - word.left <= viewRight - viewLeft;
  const visible = word.left >= viewLeft && (fits ? word.right <= viewRight : word.left < viewRight);
  if (visible) return undefined;
  const max = Math.max(0, view.scrollWidth - view.clientWidth);
  const target = Math.min(max, Math.max(0, word.left - view.gutter - WORD_CONTEXT_PX));
  return target === view.scrollLeft ? undefined : target;
}

/** Scrolls a `.df-body` so its first `.dl-word` is in view, and records the offset it set. */
export function revealFirstWord(body: HTMLElement, opts: { wrap: boolean; userScrolled: boolean }): void {
  const word = body.querySelector<HTMLElement>('.dl-word');
  const mark = body.querySelector<HTMLElement>('.dl-mark');
  if (!word || !mark) return;
  const bodyLeft = body.getBoundingClientRect().left;
  const origin = bodyLeft - body.scrollLeft;
  const rect = word.getBoundingClientRect();
  const target = wordScrollLeft(
    {
      scrollLeft: body.scrollLeft,
      clientWidth: body.clientWidth,
      scrollWidth: body.scrollWidth,
      gutter: mark.getBoundingClientRect().right - bodyLeft,
    },
    { left: rect.left - origin, right: rect.right - origin },
    opts,
  );
  if (target === undefined) return;
  body.scrollLeft = target;
  body.dataset.autoLeft = String(body.scrollLeft);
}

/** True when a scroll event on a `.df-body` came from the user, not from `revealFirstWord`. */
export function isUserSideScroll(body: HTMLElement): boolean {
  return Math.abs(body.scrollLeft - Number(body.dataset.autoLeft ?? 0)) >= 1;
}
