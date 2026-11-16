import { useEffect, useLayoutEffect, type RefObject } from 'react';
import { collapseProgress, snapTarget, steppedProgress, type PhoneTab } from './phone-logic';

const ACTIVE_LIST = '.ph-pane.is-active .ph-list';
const SETTLE_MS = 120;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Drives the large-title header. The active list's scroll position becomes `--ph-p` on the
 * phone root (0 expanded, 1 collapsed), and a list resting between the two states settles to one.
 */
export function useLargeTitle(root: RefObject<HTMLElement | null>, tab: PhoneTab, searching: boolean) {
  const apply = () => {
    const el = root.current;
    if (!el) return;
    const list = el.querySelector<HTMLElement>(ACTIVE_LIST);
    let p = searching ? 1 : collapseProgress(list?.scrollTop ?? 0);
    if (reducedMotion()) p = steppedProgress(p);
    el.style.setProperty('--ph-p', String(p));
  };

  // A tab change, or search opening or closing, takes the progress from the list now in front.
  useLayoutEffect(() => {
    if (searching) root.current?.querySelector(ACTIVE_LIST)?.scrollTo({ top: 0 });
    apply();
  }, [tab, searching]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let frame = 0;
    let settle = 0;
    let touching = false;

    const snap = () => {
      const list = el.querySelector<HTMLElement>(ACTIVE_LIST);
      const to = list ? snapTarget(list.scrollTop) : undefined;
      if (!list || to === undefined || touching || searching) return;
      list.scrollTo({ top: to, behavior: reducedMotion() ? 'auto' : 'smooth' });
    };
    const later = () => {
      clearTimeout(settle);
      settle = window.setTimeout(snap, SETTLE_MS);
    };
    const onScroll = (e: Event) => {
      if (!(e.target instanceof HTMLElement) || !e.target.matches(ACTIVE_LIST)) return;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          apply();
        });
      }
      later();
    };
    const onStart = () => {
      touching = true;
    };
    const onEnd = () => {
      touching = false;
      later();
    };

    // Scroll does not bubble, so one capture listener on the shell covers every list as it mounts.
    el.addEventListener('scroll', onScroll, { capture: true, passive: true });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll, { capture: true });
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [tab, searching]);
}
