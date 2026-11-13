import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/** Row and pane spacing. Comfortable is the default; compact is the original dense layout. */
export type Density = 'comfortable' | 'compact';

const KEY = 'density';

export function parseDensity(v: string | null | undefined): Density | undefined {
  return v === 'comfortable' || v === 'compact' ? v : undefined;
}

export function savedDensity(): Density | undefined {
  try {
    return parseDensity(window.localStorage.getItem(KEY));
  } catch {
    return undefined;
  }
}

export function saveDensity(d: Density): void {
  try {
    window.localStorage.setItem(KEY, d);
  } catch {
    // storage unavailable; the choice lasts for this session only
  }
}

/** Initial density: `?density=` wins for this page load, then the stored choice, then comfortable. */
export function initialDensity(search: string): Density {
  return parseDensity(new URLSearchParams(search).get('density')) ?? savedDensity() ?? 'comfortable';
}

export const DensityContext = createContext<Density>('comfortable');

/** The active density, for components whose markup differs between densities. */
export function useDensityValue(): Density {
  return useContext(DensityContext);
}

export function useDensity():[Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>(() => initialDensity(window.location.search));
  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);
  const choose = useCallback((d: Density) => {
    saveDensity(d);
    setDensity(d);
  }, []);
  return [density, choose];
}

/** Mirrors the Alt key onto `html.alt-held` so key caps can show while it is down. */
export function useAltHeld(): void {
  useEffect(() => {
    const root = document.documentElement;
    const set = (on: boolean) => root.classList.toggle('alt-held', on);
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') set(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') set(false);
    };
    const clear = () => set(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, []);
}
