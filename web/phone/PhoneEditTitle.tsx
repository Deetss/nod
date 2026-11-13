import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../useFocusTrap';
import { useKeyboardInset } from './useKeyboardInset';

interface EditTitleProps {
  /** The title now on GitHub. */
  current: string;
  /** `acme-web #42`, shown in the header. */
  issueRef: string;
  writesOff: boolean;
  busy: boolean;
  onSave: (title: string) => void;
  onClose: () => void;
}

/** True when Save may run: a changed, non empty title and a connection. */
export const canSaveTitle = (draft: string, current: string, writesOff: boolean): boolean => {
  const t = draft.trim();
  return !writesOff && t !== '' && t !== current.trim();
};

/** Bottom sheet that sits on the keyboard. Enter or Done on the keyboard saves. */
export function PhoneEditTitle(p: EditTitleProps) {
  const [draft, setDraft] = useState(p.current);
  const input = useRef<HTMLInputElement>(null);
  const height = useKeyboardInset();
  const empty = draft.trim() === '';
  const can = canSaveTitle(draft, p.current, p.writesOff);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const close = () => {
    if (!p.busy) p.onClose();
  };
  const save = () => {
    if (can && !p.busy) p.onSave(draft.trim());
  };
  const trap = useFocusTrap(close);

  return (
    <div className="ph-scrim" style={{ zIndex: 60, height: height ? height : undefined }} onClick={close}>
      <div ref={trap} className="ph-etitle" role="dialog" aria-modal="true" aria-label="Edit title" onClick={(e) => e.stopPropagation()}>
        <span className="ph-handle" aria-hidden="true" />
        <div className="ph-etitle-head">
          <h2>Edit title</h2>
          <span className="ph-muted">{p.issueRef}</span>
        </div>
        <input
          ref={input}
          className="ph-input ph-etitle-input"
          type="text"
          value={draft}
          readOnly={p.busy}
          aria-label="Title"
          aria-invalid={empty || undefined}
          enterKeyHint="done"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            save();
          }}
        />
        {empty ? (
          <p className="ph-etitle-note ph-etitle-err">Title cannot be empty.</p>
        ) : (
          <p className="ph-etitle-note">Press Done on the keyboard to save.</p>
        )}
        <div className="ph-etitle-actions">
          <button
            type="button"
            className={`ph-btn is-primary${can || p.busy ? '' : ' is-off'}${p.busy ? ' is-busy' : ''}`}
            disabled={!can && !p.busy}
            aria-disabled={p.busy || undefined}
            aria-busy={p.busy || undefined}
            onClick={save}
          >
            {p.busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </button>
          <button type="button" className="ph-btn ph-etitle-cancel" disabled={p.busy} onClick={close}>
            Cancel
          </button>
        </div>
        <span className="sr-only" role="status">
          {p.busy ? 'Saving title' : ''}
        </span>
      </div>
    </div>
  );
}
