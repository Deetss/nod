import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HubStatus } from '../../shared/hub';
import { hubSource, type HubSource } from './hub-source';

/** What the Hub URL block shows. `empty` is no Hub URL; `status` holds the last check. */
export type HubPhase =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'checking' }
  | { kind: 'status'; status: HubStatus };

export interface HubState {
  source: HubSource | undefined;
  /** The text in the Hub URL field. */
  draft: string;
  setDraft: (v: string) => void;
  phase: HubPhase;
  /** True when this window shows the hub. */
  attached: boolean;
  /** A refused URL or a failed pairing, shown under the field. */
  error: string | undefined;
  check: () => void;
  pairing: boolean;
  pair: (input: string) => Promise<boolean>;
}

export function useHub(source: HubSource | undefined = hubSource()): HubState {
  const src = useRef(source).current;
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<HubPhase>({ kind: src ? 'loading' : 'empty' });
  const [attached, setAttached] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pairing, setPairing] = useState(false);
  const live = useRef(true);

  const run = useCallback(
    async (url: string) => {
      if (!src) return;
      setError(undefined);
      setPhase({ kind: url.trim() ? 'checking' : 'loading' });
      try {
        const res = await src.check(url);
        if (!live.current) return;
        if (!res.ok) {
          setError(res.error);
          setPhase((p) => (p.kind === 'checking' || p.kind === 'loading' ? { kind: 'empty' } : p));
          return;
        }
        setDraft(res.url);
        setPhase(res.status ? { kind: 'status', status: res.status } : { kind: 'empty' });
      } catch {
        if (live.current) setPhase({ kind: 'status', status: { state: 'unreachable' } });
      }
    },
    [src],
  );

  useEffect(() => {
    live.current = true;
    if (src) {
      void src.url().then(({ url, attached: on }) => {
        if (!live.current) return;
        setDraft(url);
        setAttached(on);
        if (url) void run(url);
        else setPhase({ kind: 'empty' });
      });
    }
    return () => {
      live.current = false;
    };
  }, [src, run]);

  const pair = useCallback(
    async (input: string) => {
      if (!src) return false;
      setPairing(true);
      setError(undefined);
      try {
        const res = await src.pair(input);
        if (!res.ok) setError(res.error);
        return res.ok;
      } finally {
        if (live.current) setPairing(false);
      }
    },
    [src],
  );

  const check = useCallback(() => void run(draft), [run, draft]);
  return useMemo(
    () => ({ source: src, draft, setDraft, phase, attached, error, check, pairing, pair }),
    [src, draft, phase, attached, error, check, pairing, pair],
  );
}

/** The role this desktop acts with, for the hosts section. Without a hub, this machine is its own admin. */
export function hubRole(state: Pick<HubState, 'attached' | 'phase'>): 'admin' | 'desktop' | 'phone' | undefined {
  if (!state.attached) return 'admin';
  return state.phase.kind === 'status' && state.phase.status.state === 'paired' ? state.phase.status.role : undefined;
}
