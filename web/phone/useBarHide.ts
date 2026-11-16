import { useEffect, type RefObject } from 'react';
import { BAR_SHOWN, barStep, type BarScroll } from './bottom-search';

const ACTIVE_LIST = '.ph-pane.is-active .ph-list';
const HIDDEN = 'is-bar-hidden';
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Hides the bottom bar while the active list scrolls down and shows it on any scroll up, by
 * toggling `.is-bar-hidden` on the phone root. Any change in `resetKey` (a tab, a sheet, search)
 * shows it again.
 */
export function useBarHide(root: RefObject<HTMLElement | null>, resetKey: string) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let state: BarScroll = BAR_SHOWN;
    let frame = 0;
    el.classList.remove(HIDDEN);

    const apply = () => {
      frame = 0;
      const list = el.querySelector<HTMLElement>(ACTIVE_LIST);
      const scrolls = !!list && list.scrollHeight > list.clientHeight && !list.matches('.is-short');
      state = scrolls && !reducedMotion() ? barStep(state, list.scrollTop) : BAR_SHOWN;
      el.classList.toggle(HIDDEN, state.hidden);
    };
    const onScroll = (e: Event) => {
      if (!(e.target instanceof HTMLElement) || !e.target.matches(ACTIVE_LIST)) return;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    el.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll, { capture: true });
      cancelAnimationFrame(frame);
    };
  }, [resetKey]);
}
