import { useReducer } from 'react';
import { api } from '../api';
import { bodyRequired, canSubmit, finishReducer, FINISH_OPTIONS, initialFinish, submitLabel } from '../pending-review-state';
import { PhoneFitSheet, PhoneSheetBar, PhoneSheetError } from './PhoneFitSheet';

interface Props {
  repo: string;
  number: number;
  drafts: number;
  /** The viewer opened the PR, so GitHub allows only a comment review. */
  ownPr: boolean;
  onDone: () => void;
  onCancel: () => void;
}

const OWN_PR_REASON = 'GitHub only allows comments on your own PR';

/** Finish review: pick Comment, Approve or Request changes, add a summary, and submit with the drafts. */
export function PhoneFinishReview(p: Props) {
  const [state, dispatch] = useReducer(finishReducer, { ...initialFinish, event: 'COMMENT' });
  const busy = state.status === 'submitting';

  const submit = async () => {
    if (!state.event || !canSubmit(state)) return;
    dispatch({ type: 'submit' });
    try {
      const res = await api.review(p.repo, p.number, state.event, state.body);
      if (!res.ok) return dispatch({ type: 'fail', message: res.message });
      dispatch({ type: 'reset' });
      p.onDone();
    } catch (e) {
      dispatch({ type: 'fail', message: e instanceof Error ? e.message : 'Submit failed' });
    }
  };

  return (
    <PhoneFitSheet
      title="Finish review"
      sub={`${p.drafts} pending ${p.drafts === 1 ? 'comment goes' : 'comments go'} with it`}
      busy={busy}
      onClose={p.onCancel}
      bar={
        <PhoneSheetBar
          busy={busy}
          primary={submitLabel(state)}
          busyLabel={submitLabel(state)}
          disabled={!canSubmit(state)}
          onCancel={p.onCancel}
          onPrimary={() => void submit()}
        />
      }
    >
      <div className={`ph-fit-form${busy ? ' is-locked' : ''}`}>
        <div className="ph-finish-options" role="radiogroup" aria-label="Review event">
          {FINISH_OPTIONS.map((o) => {
            const off = p.ownPr && o.event !== 'COMMENT';
            const on = state.event === o.event;
            return (
              <button
                key={o.event}
                type="button"
                role="radio"
                aria-checked={on}
                className={`ph-finish-option${on ? ' is-on' : ''}`}
                disabled={busy || off}
                onClick={() => dispatch({ type: 'choose', event: o.event })}
              >
                <span className="ph-finish-dot" aria-hidden="true" />
                <span className="ph-finish-text">
                  <span className="ph-finish-title">{o.title}</span>
                  <span className="ph-finish-sub">{off ? OWN_PR_REASON : o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        <textarea
          className="ph-fix-field ph-finish-body"
          aria-label="Review summary"
          placeholder={bodyRequired(state.event) ? 'Say what needs to change' : 'Summary (optional)'}
          value={state.body}
          readOnly={busy}
          onChange={(e) => dispatch({ type: 'edit', body: e.target.value })}
        />
        {state.status === 'failed' ? <PhoneSheetError>Not submitted: {state.error}</PhoneSheetError> : null}
      </div>
    </PhoneFitSheet>
  );
}
