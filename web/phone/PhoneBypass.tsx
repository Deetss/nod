import { useCallback, useEffect, useState } from 'react';
import { BYPASS_LABEL, bypassStrip } from '../../shared/pr-actions';
import type { PrDetail, PrSummary } from '../../shared/types';
import { ToastIcon } from '../ui';
import type { PhoneWrites } from './usePhoneWrites';
import type { SheetStack } from './useSheetStack';

export type PhoneBypassPhase = 'idle' | 'confirm' | 'busy';

export interface PhoneBypass {
  phase: PhoneBypassPhase;
  /** GitHub's text from the last failed try. A tap on the strip clears it. */
  error?: string;
  detail: PrDetail;
  open: () => void;
  cancel: () => void;
  merge: () => void;
  clearError: () => void;
}

const LAYER = 'bypass-confirm';

/**
 * Merge (bypass) on the phone. The confirm strip is a history layer, so Android back cancels it.
 * Undefined unless the gate passes.
 */
export function usePhoneBypass(p: {
  pr: PrSummary | undefined;
  detail: PrDetail | undefined;
  allowed: boolean;
  writes: Pick<PhoneWrites, 'bypassMerge'>;
  sheets: Pick<SheetStack, 'openLayer' | 'closeLayer'>;
}): PhoneBypass | undefined {
  const [phase, setPhase] = useState<PhoneBypassPhase>('idle');
  const [error, setError] = useState<string>();
  const { pr, detail, allowed, writes, sheets } = p;
  const prId = pr?.id;

  useEffect(() => {
    setPhase('idle');
    setError(undefined);
  }, [prId]);

  const open = useCallback(() => {
    setError(undefined);
    setPhase('confirm');
    sheets.openLayer(LAYER, () => setPhase((ph) => (ph === 'confirm' ? 'idle' : ph)));
  }, [sheets]);

  const cancel = useCallback(() => {
    setPhase('idle');
    sheets.closeLayer(LAYER);
  }, [sheets]);

  const merge = useCallback(() => {
    if (!pr) return;
    sheets.closeLayer(LAYER);
    setPhase('busy');
    void writes.bypassMerge(pr).then((res) => {
      setPhase('idle');
      if (!res.ok) setError(res.message);
    });
  }, [pr, writes, sheets]);

  const clearError = useCallback(() => setError(undefined), []);

  // The busy and failed states outlive the gate: a refetch must not hide them mid-merge.
  if (!detail || (!allowed && phase !== 'busy' && error === undefined)) return undefined;
  return { phase, ...(error !== undefined ? { error } : {}), detail, open, cancel, merge, clearError };
}

/** The confirm strip with Cancel and Merge now, in place of the bar's pills. */
export function PhoneBypassConfirm({ bypass }: { bypass: PhoneBypass }) {
  const strip = bypassStrip(bypass.detail);
  return (
    <>
      <div className="ph-pending-bar ph-bypass-strip" role="alertdialog" aria-labelledby="ph-bypass-title">
        <span className="ph-pending-text">
          <strong id="ph-bypass-title">{strip.title}</strong>
          {strip.lines.map((line, i) => (
            <span key={i} className={i === 0 ? 'is-lead' : undefined}>
              {line}
            </span>
          ))}
        </span>
      </div>
      <button type="button" className="ph-btn" onClick={bypass.cancel}>
        Cancel
      </button>
      <button type="button" className="ph-btn is-danger ph-bypass-now" onClick={bypass.merge}>
        Merge now
      </button>
    </>
  );
}

/** GitHub's refusal above the pills. Merge (bypass) stays enabled for a retry. */
export function PhoneBypassError({ message, onClear }: { message: string; onClear: () => void }) {
  return (
    <div className="ph-pending-bar is-error" role="alert" onClick={onClear}>
      <ToastIcon ok={false} />
      <span className="ph-pending-text">
        <strong className="ellipsis">{message}</strong>
        <span>GitHub refused the merge. Nothing changed.</span>
      </span>
    </div>
  );
}

/** The pill in the Approve slot. Busy keeps its fill and shows a spinner. */
export function PhoneBypassPill({ bypass, off }: { bypass: PhoneBypass; off: boolean }) {
  const busy = bypass.phase === 'busy';
  return (
    <button
      type="button"
      className={`ph-btn is-bypass${busy ? ' is-busy' : ''}${off ? ' is-off' : ''}`}
      disabled={off}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={busy ? undefined : bypass.open}
    >
      {busy ? (
        <>
          <span className="spinner" aria-hidden="true" />
          Merging…
        </>
      ) : (
        BYPASS_LABEL
      )}
    </button>
  );
}
