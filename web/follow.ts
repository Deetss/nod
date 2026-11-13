import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { FollowKind, FollowState, PrSummary } from '../shared/types';

/** Display holds, ms. Everything else about a chip comes from the server's `follows`. */
export const APPROVED_HOLD_MS = 6000;
export const MERGED_HOLD_MS = 4000;
export const FADE_MS = 200;

export type FollowPhase = 'chip' | 'fade' | 'gone';

/** Where one follow entry is, `age` ms after the client first saw it. */
export function followPhase(kind: FollowKind, age: number, reduceMotion: boolean): FollowPhase {
  if (kind === 'approved') return age < APPROVED_HOLD_MS ? 'chip' : 'gone';
  if (kind !== 'merged') return 'chip';
  if (age < MERGED_HOLD_MS) return 'chip';
  return !reduceMotion && age < MERGED_HOLD_MS + FADE_MS ? 'fade' : 'gone';
}

/** Next age at which `followPhase` changes, or undefined when it never does. */
function nextEdge(kind: FollowKind, age: number, reduceMotion: boolean): number | undefined {
  const edges =
    kind === 'approved'
      ? [APPROVED_HOLD_MS]
      : kind === 'merged'
        ? [MERGED_HOLD_MS, ...(reduceMotion ? [] : [MERGED_HOLD_MS + FADE_MS])]
        : [];
  return edges.find((e) => e > age);
}

export interface FollowView {
  /** Chip to show, by PR id. */
  chips: Record<string, FollowKind>;
  /** Merged PRs in their exit fade. */
  fading: ReadonlySet<string>;
  /** Merged PRs still held, for rows that already left the open list. */
  held: PrSummary[];
}

export const NO_FOLLOW_VIEW: FollowView = { chips: {}, fading: new Set(), held: [] };

export const FollowContext = createContext<FollowView>(NO_FOLLOW_VIEW);

/** A `follows` entry wins; otherwise GitHub's own auto-merge flag shows the pending chip. */
export function useFollow(prId: string, autoMerge?: boolean): { kind: FollowKind | undefined; fading: boolean } {
  const v = useContext(FollowContext);
  return { kind: v.chips[prId] ?? (autoMerge === true ? 'auto-merge' : undefined), fading: v.fading.has(prId) };
}

const entryKey = (id: string, f: FollowState) => `${id}:${f.state}:${f.at}`;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Turns the server's `follows` into what to show. A chip lives while the server reports
 * it; only the approved and merged holds run on the client, timed from first sight.
 */
export function useFollowView(follows: Record<string, FollowState> | undefined): FollowView {
  const firstSeen = useRef(new Map<string, number>());
  const [, bump] = useState(0);
  const now = Date.now();
  const reduce = prefersReducedMotion();

  const entries = useMemo(() => Object.entries(follows ?? {}), [follows]);

  useEffect(() => {
    const t0 = Date.now();
    const live = new Set<string>();
    let wake: number | undefined;
    for (const [id, f] of entries) {
      const key = entryKey(id, f);
      live.add(key);
      if (!firstSeen.current.has(key)) firstSeen.current.set(key, t0);
      const age = t0 - (firstSeen.current.get(key) ?? t0);
      const edge = nextEdge(f.state, age, reduce);
      if (edge !== undefined) wake = Math.min(wake ?? Infinity, edge - age);
    }
    for (const key of firstSeen.current.keys()) if (!live.has(key)) firstSeen.current.delete(key);
    if (wake === undefined) return;
    const timer = setTimeout(() => bump((n) => n + 1), wake);
    return () => clearTimeout(timer);
  });

  const chips: Record<string, FollowKind> = {};
  const fading = new Set<string>();
  const held: PrSummary[] = [];
  for (const [id, f] of entries) {
    const age = now - (firstSeen.current.get(entryKey(id, f)) ?? now);
    const phase = followPhase(f.state, age, reduce);
    if (phase === 'gone') continue;
    chips[id] = f.state;
    if (phase === 'fade') fading.add(id);
    if (f.state === 'merged' && f.pr) held.push(f.pr);
  }
  // Same signature, same object, so consumers' memos and effects do not re-run on every tick.
  const sig = JSON.stringify([chips, [...fading], held.map((p) => p.id)]);
  const stable = useRef<{ sig: string; view: FollowView } | undefined>(undefined);
  if (stable.current?.sig !== sig) stable.current = { sig, view: { chips, fading, held } };
  return stable.current.view;
}
