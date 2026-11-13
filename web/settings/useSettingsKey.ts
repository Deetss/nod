import { useEffect, useRef } from 'react';
import { isTyping } from '../hooks';

/**
 * `,` opens the settings dialog from any page. It stays out of text fields, key chords and any
 * open dialog (every dialog sits in a `.scrim`), so it never fires mid-edit.
 */
export function useSettingsKey(enabled: boolean, onOpen: () => void): void {
  const open = useRef(onOpen);
  open.current = onOpen;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ',' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTyping(e.target) || document.querySelector('.scrim')) return;
      e.preventDefault();
      open.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
