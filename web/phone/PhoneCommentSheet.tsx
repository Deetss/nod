import { useEffect, useRef } from 'react';
import type { ComposerState } from '../inline/composer-state';
import { PhoneFitSheet, PhoneSheetError } from './PhoneFitSheet';
import { commentTitle } from './usePhoneComments';

interface Props {
  state: ComposerState;
  /** The file path, or `Whole file`. */
  sub: string;
  onText: (text: string) => void;
  onSubmit: (draft: boolean) => void;
  onCancel: () => void;
}

/** Line, range or file comment in a bottom sheet: Add to review saves a draft, Comment posts now. */
export function PhoneCommentSheet(p: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const a = area.current;
    a?.focus();
    a?.setSelectionRange(a.value.length, a.value.length);
  }, []);

  const posting = p.state.status === 'posting';
  const failed = p.state.status === 'failed';
  const empty = p.state.text.trim() === '';
  const title = p.state.target ? commentTitle(p.state.target) : 'Comment';

  const bar = failed ? (
    <div className="ph-comment-bar">
      <button type="button" className="ph-btn is-primary" onClick={() => p.onSubmit(false)}>
        Retry
      </button>
      <button type="button" className="ph-btn" onClick={p.onCancel}>
        Cancel
      </button>
    </div>
  ) : (
    <div className="ph-comment-bar">
      <button type="button" className="ph-btn is-primary" disabled={posting || empty} aria-busy={posting || undefined} onClick={() => p.onSubmit(true)}>
        Add to review
      </button>
      <button type="button" className="ph-btn" disabled={posting || empty} aria-busy={posting || undefined} onClick={() => p.onSubmit(false)}>
        Comment
      </button>
      <button type="button" className="ph-btn is-wide" disabled={posting} onClick={p.onCancel}>
        Cancel
      </button>
    </div>
  );

  return (
    <PhoneFitSheet title={title} sub={p.sub} busy={posting} onClose={p.onCancel} bar={bar}>
      <div className={`ph-fit-form${posting ? ' is-locked' : ''}`}>
        <textarea
          ref={area}
          className="ph-fix-field ph-comment-text"
          aria-label="Comment text"
          placeholder="Leave a comment"
          value={p.state.text}
          readOnly={posting}
          onChange={(e) => p.onText(e.target.value)}
        />
        {posting ? (
          <p className="ph-muted" role="status">
            <span className="spinner" aria-hidden="true" /> Posting…
          </p>
        ) : null}
        {failed ? <PhoneSheetError>Not posted: {p.state.error}</PhoneSheetError> : null}
      </div>
    </PhoneFitSheet>
  );
}
