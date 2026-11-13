import { useEffect, useReducer, useRef, type KeyboardEvent } from 'react';
import { api } from './api';
import { MentionTextarea } from './mentions/MentionTextarea';
import {
  bodyRequired,
  canSubmit,
  FINISH_OPTIONS,
  finishReducer,
  initialFinish,
  submitLabel,
} from './pending-review-state';
import type { PrDetail } from '../shared/types';
import { Btn } from './ui';

/**
 * Finish review (docs/design/inline-comments-spec.md, frame 6): a menu of the three review events,
 * then a body and Submit review. The body is required only for Request changes.
 */
export function FinishReview({ detail, disabled, onDone }: { detail: PrDetail; disabled: boolean; onDone: () => void }) {
  const [state, dispatch] = useReducer(finishReducer, initialFinish);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Focus follows the menu: the highlighted row when it opens.
  useEffect(() => {
    if (state.menuOpen) itemRefs.current[state.focus]?.focus();
  }, [state.menuOpen, state.focus]);

  // A click outside the bar's menu closes it.
  useEffect(() => {
    if (!state.menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) dispatch({ type: 'close' });
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [state.menuOpen]);

  const closeMenu = () => {
    dispatch({ type: 'close' });
    // The trigger is the wrapper's first button; Btn does not forward a ref.
    wrapRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      dispatch({ type: 'move', delta: 1 });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      dispatch({ type: 'move', delta: -1 });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      dispatch({ type: 'choose', event: FINISH_OPTIONS[state.focus]!.event });
    }
  };

  const submit = async () => {
    if (!state.event || !canSubmit(state)) return;
    dispatch({ type: 'submit' });
    try {
      const res = await api.review(detail.summary.repo, detail.summary.number, state.event, state.body);
      if (!res.ok) {
        dispatch({ type: 'fail', message: res.message });
        return;
      }
      dispatch({ type: 'reset' });
      onDone();
    } catch (e) {
      dispatch({ type: 'fail', message: e instanceof Error ? e.message : 'Submit failed' });
    }
  };

  const onBodyKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const chosen = state.event ? FINISH_OPTIONS.find((o) => o.event === state.event) : undefined;
  const busy = state.status === 'submitting';

  return (
    <div className={`finish-review${chosen ? ' has-body' : ''}`} ref={wrapRef}>
      <Btn
        primary
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={state.menuOpen}
        onClick={() => (state.menuOpen ? closeMenu() : dispatch({ type: 'open' }))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !state.menuOpen) {
            e.preventDefault();
            dispatch({ type: 'open' });
          }
        }}
      >
        Finish review
      </Btn>
      {state.menuOpen ? (
        <div
          className="picker fix-menu finish-menu"
          role="menu"
          aria-label="Finish review"
          tabIndex={-1}
          onKeyDown={onMenuKey}
        >
          {FINISH_OPTIONS.map((o, i) => (
            <button
              key={o.event}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className={`picker-row fix-menu-row${i === state.focus ? ' is-focus' : ''}`}
              tabIndex={i === state.focus ? 0 : -1}
              onClick={() => dispatch({ type: 'choose', event: o.event })}
            >
              <span className="fix-menu-text">
                <span className="fix-menu-title">{o.title}</span>
                <span className="fix-menu-sub">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {chosen ? (
        <div className="finish-body">
          <div className="finish-body-head muted small">
            {chosen.title}
            {bodyRequired(state.event) ? ' (body required)' : ' (body optional)'}
          </div>
          <MentionTextarea
            repo={detail.summary.repo}
            value={state.body}
            onValueChange={(body) => dispatch({ type: 'edit', body })}
            onKeyDown={onBodyKey}
            readOnly={busy}
            rows={4}
            placeholder="Leave a review summary"
            aria-label="Review body"
            className="ic-text md"
          />
          {state.error ? (
            <div className="pending-review-error" role="alert">
              {state.error}
            </div>
          ) : null}
          <div className="finish-body-actions">
            <Btn disabled={busy} onClick={() => dispatch({ type: 'cancel' })}>
              Back
            </Btn>
            <Btn primary disabled={!canSubmit(state)} onClick={() => void submit()}>
              {submitLabel(state)}
            </Btn>
          </div>
        </div>
      ) : null}
    </div>
  );
}
