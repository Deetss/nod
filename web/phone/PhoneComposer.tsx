import { useCallback, useEffect, useRef, useState } from 'react';
import { useImagePaste, type ImagePasteOptions } from '../useImagePaste';
import { wrapSelection, type FormatKind } from './composer-format';
import { useKeyboardInset } from './useKeyboardInset';
import { useFocusTrap } from '../useFocusTrap';

interface ComposerProps {
  /** Draft storage key, per issue or PR. */
  draftKey: string;
  title: string;
  submitLabel: string;
  writesOff: boolean;
  busy: boolean;
  onSubmit: (body: string) => void;
  onClose: () => void;
  /** Field name for screen readers and the placeholder. Defaults to a comment. */
  fieldLabel?: string;
  /** Starts the field with this text instead of the stored draft when it is not empty. */
  initialText?: string;
  /** Submit stays on for an empty field, so a stored value can be cleared. */
  allowEmpty?: boolean;
  /** Repo that pasted or dropped images upload against. */
  repo?: string;
  onUploadError?: (message: string) => void;
  /** Test seam for the image upload. */
  upload?: ImagePasteOptions['upload'];
}

const TOOLS: [FormatKind, string][] = [
  ['bold', 'B'],
  ['italic', 'I'],
  ['code', '<>'],
  ['list', '•'],
  ['link', 'Link'],
];

function loadDraft(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function saveDraft(key: string, text: string): void {
  try {
    if (text) window.localStorage.setItem(key, text);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be blocked; the draft stays in memory.
  }
}

/** Full-screen composer. It sizes to the visual viewport so the field stays above the keyboard. */
export function PhoneComposer(p: ComposerProps) {
  const [text, setText] = useState(() => p.initialText || loadDraft(p.draftKey));
  const [asking, setAsking] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const height = useKeyboardInset();

  useEffect(() => {
    area.current?.focus();
  }, []);

  const change = (v: string) => {
    setText(v);
    saveDraft(p.draftKey, v);
  };
  const { draftKey, onUploadError } = p;
  const update = useCallback(
    (edit: (t: string) => string) =>
      setText((t) => {
        const next = edit(t);
        saveDraft(draftKey, next);
        return next;
      }),
    [draftKey],
  );
  const onError = useCallback((m: string) => onUploadError?.(m), [onUploadError]);
  const images = useImagePaste({ repo: p.repo, update, onError, upload: p.upload });
  const format = (kind: FormatKind) => {
    const el = area.current;
    if (!el) return;
    const next = wrapSelection(text, el.selectionStart, el.selectionEnd, kind);
    change(next.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };
  const discard = () => {
    if (text.trim() === '') return p.onClose();
    setAsking(true);
  };
  const empty = text.trim() === '';
  const blocked = empty && !p.allowEmpty;
  const trap = useFocusTrap(() => {
    if (!asking) discard();
  });

  return (
    <div ref={trap} className="ph-composer" role="dialog" aria-modal="true" aria-label={p.title} style={height ? { height } : undefined}>
      <header className="ph-composer-head">
        <h2>{p.title}</h2>
      </header>
      <textarea
        ref={area}
        className="ph-composer-field"
        value={text}
        placeholder={`Write a ${(p.fieldLabel ?? 'Comment').toLowerCase()}. Markdown supported.`}
        aria-label={p.fieldLabel ?? 'Comment'}
        onChange={(e) => change(e.target.value)}
        {...images}
      />
      <div className="ph-composer-tools">
        {TOOLS.map(([kind, label]) => (
          <button key={kind} type="button" className="ph-btn" aria-label={kind} onClick={() => format(kind)}>
            {label}
          </button>
        ))}
        <span className="ph-muted ph-composer-md">Markdown</span>
      </div>
      <div className="ph-composer-actions">
        <button type="button" className="ph-btn" onClick={discard}>
          Discard
        </button>
        <button
          type="button"
          className={`ph-btn is-primary${blocked || p.writesOff ? ' is-off' : ''}`}
          disabled={blocked || p.writesOff || p.busy}
          onClick={() => p.onSubmit(text.trim())}
        >
          {p.busy ? 'Working…' : p.submitLabel}
        </button>
      </div>
      {asking ? (
        <div className="ph-scrim is-center" style={{ zIndex: 80 }} onClick={() => setAsking(false)}>
          <div className="ph-confirm" role="alertdialog" aria-label="Discard draft?" onClick={(e) => e.stopPropagation()}>
            <h2>Discard draft?</h2>
            <button
              type="button"
              className="ph-btn is-danger"
              onClick={() => {
                saveDraft(p.draftKey, '');
                p.onClose();
              }}
            >
              Discard
            </button>
            <button type="button" className="ph-btn" onClick={() => setAsking(false)}>
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Clears a saved draft once its comment has posted. */
export function clearDraft(key: string): void {
  saveDraft(key, '');
}
