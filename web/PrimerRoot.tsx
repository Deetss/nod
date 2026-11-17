import { useSyncExternalStore, type ReactNode } from 'react';
import { ThemeProvider } from '@primer/react';

type Mode = 'dark' | 'light';

/** The app theme lives on `<html data-theme>` (see `useTheme`); Primer follows it from there. */
function subscribe(notify: () => void): () => void {
  const watcher = new MutationObserver(notify);
  watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => watcher.disconnect();
}

function currentMode(): Mode {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Hosts Primer's theme context so Primer components match the active Nod theme.
 * `BaseStyles` is left out on purpose: its wrapper div breaks the fixed full-height layout
 * and the app already sets the base font and colours.
 */
export function PrimerRoot({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, currentMode, () => 'dark' as const);
  return (
    <ThemeProvider colorMode={mode === 'dark' ? 'night' : 'day'} nightScheme="dark" dayScheme="light">
      {children}
    </ThemeProvider>
  );
}
