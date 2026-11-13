import { useEffect, useState } from 'react';
import type { NumberHit } from '../shared/number-query';
import { api } from './api';

/** Pause after the last keystroke before asking GitHub. */
const LOOKUP_DELAY_MS = 400;

/** Answers by `number|repos`, so retyping a query costs nothing. */
const answers = new Map<string, NumberHit[]>();

export interface NumberLookup {
  hits: NumberHit[];
  /** True once GitHub answered for the current number and repos. */
  done: boolean;
  error?: string;
}

/**
 * Asks GitHub once for issue or PR `number` in `repos`, after typing pauses. One call per repo,
 * made by the server. Nothing runs when `repos` is empty or `number` is undefined.
 */
export function useNumberLookup(number: number | undefined, repos: readonly string[], immediate = false): NumberLookup {
  const key = number === undefined || repos.length === 0 ? '' : `${number}|${repos.join(',')}`;
  const [state, setState] = useState<{ key: string; hits: NumberHit[]; error?: string }>({ key: '', hits: [] });

  useEffect(() => {
    if (!key || number === undefined) return;
    const known = answers.get(key);
    if (known) {
      setState({ key, hits: known });
      return;
    }
    let live = true;
    const t = setTimeout(
      () => {
        api
          .lookup(number, repos)
          .then((r) => {
            answers.set(key, r.hits);
            if (live) setState({ key, hits: r.hits });
          })
          .catch((e: unknown) => live && setState({ key, hits: [], error: e instanceof Error ? e.message : 'Lookup failed' }));
      },
      immediate ? 0 : LOOKUP_DELAY_MS,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
    // `repos` is folded into `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, immediate]);

  if (!key) return { hits: [], done: true };
  if (state.key !== key) return { hits: [], done: false };
  return { hits: state.hits, done: true, ...(state.error ? { error: state.error } : {}) };
}
