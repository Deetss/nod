import type { UpdateCheckResult } from '../shared/app-update';

/** Opening Nod checks for an update at most this often. */
export const OPEN_CHECK_GAP_MS = 10 * 60_000;

/**
 * Returns a call for each newly opened window or phone. It asks the updater to check, at most once
 * per gap. The updater already checks when the server starts, so the gap starts counting then.
 */
export function checkOnOpen(
  updates: { check(): Promise<UpdateCheckResult> } | undefined,
  gapMs: number = OPEN_CHECK_GAP_MS,
  now: () => number = Date.now,
): () => void {
  let last = now();
  return () => {
    if (!updates || now() - last < gapMs) return;
    last = now();
    void updates.check().catch(() => undefined);
  };
}
