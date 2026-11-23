import { useCallback, useState } from 'react';
import type { SectionKey } from '../shared/types';
import { SECTION_ORDER } from '../shared/sections';

/** A list section the user can hide: one of the PR sections, or Closed. */
export type HideKey = SectionKey | 'closed';

const KEY = 'hiddenSections';
const VALID: readonly HideKey[] = [...SECTION_ORDER, 'closed'];

export function parseHidden(raw: string | null | undefined): HideKey[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return VALID.filter((k) => v.includes(k));
  } catch {
    return [];
  }
}

function load(): HideKey[] {
  try {
    return parseHidden(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

function save(keys: ReadonlySet<HideKey>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...keys]));
  } catch {
    // storage unavailable; the choice lasts for this session only
  }
}

export interface HiddenSections {
  hidden: ReadonlySet<HideKey>;
  hide: (k: HideKey) => void;
  show: (k: HideKey) => void;
}

/** Sections hidden from the PR list, saved per device. */
export function useHiddenSections(): HiddenSections {
  const [hidden, setHidden] = useState<ReadonlySet<HideKey>>(() => new Set(load()));
  const change = useCallback((k: HideKey, on: boolean) => {
    setHidden((cur) => {
      if (cur.has(k) === on) return cur;
      const next = new Set(cur);
      if (on) next.add(k);
      else next.delete(k);
      save(next);
      return next;
    });
  }, []);
  const hide = useCallback((k: HideKey) => change(k, true), [change]);
  const show = useCallback((k: HideKey) => change(k, false), [change]);
  return { hidden, hide, show };
}
