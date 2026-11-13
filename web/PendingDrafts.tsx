import { useState } from 'react';
import { api } from './api';
import { discardLabel, hasDrafts, pendingLabel } from './pending-review-state';
import type { PrDetail } from '../shared/types';
import { FinishReview } from './FinishReview';
import { Btn } from './ui';

/**
 * The bar's draft part (docs/design/inline-comments-spec.md, Review bar): the count, the
 * private-draft line, and Discard. Discard asks for a second click inside the button.
 */
export function PendingDrafts({
  detail,
  disabled,
  onChanged,
}: {
  detail: PrDetail;
  disabled: boolean;
  onChanged: () => void;
}) {
  const drafts = detail.pendingReview?.drafts ?? 0;
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!hasDrafts(drafts)) return null;

  const discard = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.discardReview(detail.summary.repo, detail.summary.number);
      if (!res.ok) setError(res.message);
      else onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discard failed');
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <div className="pending-review">
      <div className="pending-review-text">
        <span className="pending-review-count">{pendingLabel(drafts)}</span>
        <span className="muted small">Only you see these until you finish the review.</span>
        {error ? (
          <span className="pending-review-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      <Btn disabled={disabled || busy} onClick={() => void discard()}>
        {busy ? 'Discarding...' : discardLabel(drafts, armed)}
      </Btn>
      <FinishReview detail={detail} disabled={disabled} onDone={onChanged} />
    </div>
  );
}
