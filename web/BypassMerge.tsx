import { useCallback, useEffect, useState } from 'react';
import { BYPASS_LABEL, bypassMethodFor, bypassStrip, bypassTooltip } from '../shared/pr-actions';
import type { ActionResult, PrDetail } from '../shared/types';
import { api } from './api';
import { AlertIcon, Btn, ToastIcon } from './ui';

export type BypassPhase = 'idle' | 'confirm' | 'busy';

export interface BypassControl {
  phase: BypassPhase;
  /** GitHub's text from the last failed try. Cleared by the next one. */
  error?: string;
  open: () => void;
  cancel: () => void;
  merge: () => void;
}

const BUTTON_SELECTOR = '[data-bypass-merge]';

/** GitHub's text, then the fact that nothing changed. */
export const failureText = (message: string): string => `${message.replace(/[.\s]+$/, '')}. Nothing changed.`;

/**
 * Merge (bypass) on the desktop: the inline confirm strip, the busy state and the failure row.
 * State resets when the PR changes. Enter merges and Esc cancels while the strip is open.
 */
export function useBypassMerge(p: {
  pr: { id: string; repo: string; number: number } | undefined;
  enabled: boolean;
  onDone: (res: ActionResult) => void;
}): BypassControl {
  const [phase, setPhase] = useState<BypassPhase>('idle');
  const [error, setError] = useState<string>();
  const { pr, enabled, onDone } = p;
  const prId = pr?.id;

  useEffect(() => {
    setPhase('idle');
    setError(undefined);
  }, [prId]);

  const open = useCallback(() => {
    if (!enabled) return;
    setError(undefined);
    setPhase('confirm');
  }, [enabled]);

  const cancel = useCallback(() => {
    setPhase('idle');
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(BUTTON_SELECTOR)?.focus());
  }, []);

  const merge = useCallback(() => {
    if (!pr || !enabled) return;
    setPhase('busy');
    void (async () => {
      try {
        const res = await api.bypassMerge(pr.repo, pr.number);
        if (res.ok) onDone(res);
        else setError(res.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Merge failed');
      } finally {
        setPhase('idle');
      }
    })();
  }, [pr, enabled, onDone]);

  useEffect(() => {
    if (phase !== 'confirm') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        merge();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, cancel, merge]);

  return { phase, ...(error !== undefined ? { error } : {}), open, cancel, merge };
}

/** The danger button in Admin merge's slot. Busy keeps its width and shows a spinner. */
export function BypassMergeBtn({ detail, control, disabled }: { detail: PrDetail; control: BypassControl; disabled: boolean }) {
  if (control.phase === 'busy') {
    return (
      <button type="button" className="btn btn-danger is-busy bypass-btn" disabled aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        Merging…
      </button>
    );
  }
  const method = bypassMethodFor(detail.mergeMethod, detail.mergeAllowed) ?? 'squash';
  return (
    <Btn
      className="btn-danger bypass-btn"
      keyHint="M"
      data-bypass-merge=""
      disabled={disabled}
      title={bypassTooltip(method)}
      onClick={control.open}
    >
      {BYPASS_LABEL}
    </Btn>
  );
}

/** The failed try's text, as a full-width first row of the bar. */
export function BypassError({ message }: { message: string }) {
  return (
    <div className="review-bar-error" role="alert">
      <ToastIcon ok={false} />
      <span className="ellipsis">{failureText(message)}</span>
    </div>
  );
}

/** The bar turned into a confirm strip: what is skipped, the method, and the checks and threads met. */
export function BypassStrip({ detail, control }: { detail: PrDetail; control: BypassControl }) {
  const strip = bypassStrip(detail);
  return (
    <div className="review-bar is-confirm" role="alertdialog" aria-labelledby="bypass-strip-title">
      <div className="bypass-strip">
        <span className="bypass-strip-icon">
          <AlertIcon size={16} />
        </span>
        <div className="bypass-strip-text">
          <div className="bypass-strip-title" id="bypass-strip-title">
            {strip.title}
          </div>
          {strip.lines.map((line, i) => (
            <div key={i} className={i === 0 ? 'bypass-strip-line is-lead' : 'bypass-strip-line'}>
              {line}
            </div>
          ))}
        </div>
      </div>
      <div className="review-bar-side review-bar-merge">
        <Btn keyHint="Esc" onClick={control.cancel}>
          Cancel
        </Btn>
        <Btn className="btn-danger" keyHint="Enter" autoFocus onClick={control.merge}>
          {BYPASS_LABEL}
        </Btn>
      </div>
    </div>
  );
}
