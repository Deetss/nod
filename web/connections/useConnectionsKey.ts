import { useEffect, useRef } from 'react';
import { isTyping } from '../hooks';

const CHORD_MS = 1000;

/**
 * `g c` toggles Connections from any view. `c` alone is comment in PRs and Issues. It listens in
 * the capture phase and swallows the `c`, so the view's own `g` handling never reads it as comment.
 * Like `,` it stays out of text fields and open dialogs.
 */
export function useConnectionsKey(enabled: boolean, onToggle: () => void): void {
  const toggle = useRef(onToggle);
  toggle.current = onToggle;
  useEffect(() => {
    if (!enabled) return;
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      if (document.querySelector('.scrim')) return;
      if (e.key === 'g') {
        gAt = Date.now();
        return;
      }
      const chord = gAt > 0 && Date.now() - gAt < CHORD_MS;
      gAt = 0;
      if (!chord || e.key !== 'c') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      toggle.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
