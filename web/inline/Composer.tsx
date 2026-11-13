import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../api';
import { MentionTextarea } from '../mentions/MentionTextarea';
import type { MentionCandidate } from '../mentions/mention-logic';
import { sanitizeHtml } from '../sanitize';
import { primaryLabel, secondaryLabel, type ComposerAction, type ComposerState } from './composer-state';
import {
  BoldIcon,
  BulletListIcon,
  CloseIcon,
  CodeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  MentionIcon,
  NumberListIcon,
  QuoteIcon,
  ReferenceIcon,
  SpinnerIcon,
  TaskListIcon,
  UndoIcon,
  WarningIcon,
} from './icons';
import { composerKey } from './line-target';
import { PREVIEW_DEBOUNCE_MS } from './preview-debounce';
import { bullet, heading, insertAtCaret, numbered, prefixLines, quote, task, wrapSelection, type Edit } from './toolbar';

export interface ComposerProps {
  state: ComposerState;
  dispatch: (action: ComposerAction) => void;
  /** Posts the comment (`draft` false) or adds it to the viewer's pending review (`draft` true). */
  onSubmit: (draft: boolean) => void;
  repo: string;
  people?: readonly MentionCandidate[];
  teams?: readonly string[];
  hasPendingReview: boolean;
}

function headerText(state: ComposerState): string {
  const t = state.target;
  if (!t || t.subject === 'file') return 'Add comment on file';
  if (t.startLine !== undefined) return `Add comment on lines ${t.startLine} to ${t.line}`;
  return `Add comment on line ${t.line}`;
}

interface Preview {
  text: string;
  html?: string;
  error?: string;
}

/** The inline composer: Write and Preview tabs, the Markdown toolbar, and the Comment buttons. Controlled by the reducer. */
export function Composer(p: ComposerProps) {
  const { state, dispatch } = p;
  const area = useRef<HTMLTextAreaElement | null>(null);
  const posting = state.status === 'posting';
  const previewing = state.status === 'previewing';
  const [pv, setPv] = useState<Preview>();

  // Preview renders on the server, 300 ms after the last change. A stale result is never shown.
  useEffect(() => {
    if (!previewing) return;
    const text = state.text;
    if (text.trim() === '') {
      setPv({ text, html: '' });
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api.renderMarkdown(p.repo, text).then(
        (r) => live && setPv({ text, html: r.html }),
        (e: unknown) => live && setPv({ text, error: e instanceof Error ? e.message : 'Preview failed' }),
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [previewing, state.text, p.repo]);

  const previewHtml = useMemo(
    () => (pv && pv.text === state.text && pv.html !== undefined ? sanitizeHtml(pv.html) : undefined),
    [pv, state.text],
  );

  /** Writes an edit to the textarea's text and restores the selection it names. */
  function apply(edit: Edit) {
    dispatch({ type: 'edit', text: edit.text });
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(edit.start, edit.end);
    });
  }

  /** Edits the text from the textarea's current selection. */
  function edit(run: (text: string, start: number, end: number) => Edit) {
    const el = area.current;
    if (!el || posting) return;
    apply(run(state.text, el.selectionStart, el.selectionEnd));
  }

  /** `@` goes in as typed text, so the mention strip opens the way it does for a key press. */
  function mention() {
    const el = area.current;
    if (!el || posting) return;
    el.focus();
    el.setSelectionRange(el.selectionStart, el.selectionEnd);
    if (!document.execCommand('insertText', false, '@')) {
      apply(insertAtCaret(state.text, el.selectionStart, el.selectionEnd, '@'));
    }
  }

  function undo() {
    const el = area.current;
    if (!el || posting) return;
    el.focus();
    document.execCommand('undo');
  }

  const tools: { label: string; icon: typeof BoldIcon; run: () => void }[] = [
    { label: 'Heading', icon: HeadingIcon, run: () => edit((t, s, e) => prefixLines(t, s, e, heading)) },
    { label: 'Bold', icon: BoldIcon, run: () => edit((t, s, e) => wrapSelection(t, s, e, '**', '**')) },
    { label: 'Italic', icon: ItalicIcon, run: () => edit((t, s, e) => wrapSelection(t, s, e, '_', '_')) },
    { label: 'Quote', icon: QuoteIcon, run: () => edit((t, s, e) => prefixLines(t, s, e, quote)) },
    { label: 'Code', icon: CodeIcon, run: () => edit((t, s, e) => wrapSelection(t, s, e, '`', '`')) },
    { label: 'Link', icon: LinkIcon, run: () => edit((t, s, e) => wrapSelection(t, s, e, '[', '](url)')) },
    { label: 'Bulleted list', icon: BulletListIcon, run: () => edit((t, s, e) => prefixLines(t, s, e, bullet)) },
    { label: 'Numbered list', icon: NumberListIcon, run: () => edit((t, s, e) => prefixLines(t, s, e, numbered)) },
    { label: 'Task list', icon: TaskListIcon, run: () => edit((t, s, e) => prefixLines(t, s, e, task)) },
    { label: 'Mention', icon: MentionIcon, run: mention },
    { label: 'Reference', icon: ReferenceIcon, run: () => edit((t, s, e) => insertAtCaret(t, s, e, '#')) },
    { label: 'Undo', icon: UndoIcon, run: undo },
  ];

  /** Esc closes, and Ctrl+Enter posts. Handled on the root so the buttons get it too. */
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const k = composerKey(e);
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    if (k === 'close') {
      if (!posting) dispatch({ type: 'close' });
      return;
    }
    if (posting || state.text.trim() === '') return;
    p.onSubmit(k === 'draft');
  }

  const failed = state.status === 'failed';
  const canPost = !posting && state.text.trim() !== '';

  return (
    <div className="inline-composer" role="group" aria-label={headerText(state)} onKeyDown={onKey}>
      <div className="ic-head">
        <span className="ic-title">{headerText(state)}</span>
        <button
          type="button"
          className="ic-close"
          aria-label="Close comment"
          disabled={posting}
          onClick={() => dispatch({ type: 'close' })}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="ic-tabs seg" role="group" aria-label="Comment view">
        <button
          type="button"
          className={previewing ? '' : 'is-active'}
          aria-pressed={!previewing}
          onClick={() => dispatch({ type: 'tab', tab: 'write' })}
        >
          Write
        </button>
        <button
          type="button"
          className={previewing ? 'is-active' : ''}
          aria-pressed={previewing}
          onClick={() => dispatch({ type: 'tab', tab: 'preview' })}
        >
          Preview
        </button>
      </div>
      {previewing ? (
        <div className="ic-preview">
          {pv?.error ? (
            <div className="ic-error" role="alert">
              <WarningIcon /> Preview failed: {pv.error}
            </div>
          ) : null}
          {previewHtml ? (
            <div className="md" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <pre className="ic-raw">{state.text || 'Nothing to preview.'}</pre>
          )}
        </div>
      ) : (
        <>
          <div className="composer-tools" role="toolbar" aria-label="Formatting">
            {tools.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.label}
                  type="button"
                  className="ct-btn"
                  aria-label={t.label}
                  title={t.label}
                  disabled={posting}
                  onClick={t.run}
                >
                  <Icon />
                </button>
              );
            })}
          </div>
          <MentionTextarea
            textareaRef={area}
            repo={p.repo}
            {...(p.people ? { people: p.people } : {})}
            {...(p.teams ? { teams: p.teams } : {})}
            placement="below"
            value={state.text}
            onValueChange={(text) => dispatch({ type: 'edit', text })}
            readOnly={posting}
            rows={6}
            placeholder="Leave a comment"
            aria-label="Comment text"
            className="ic-text md"
          />
        </>
      )}
      <div className="ic-files" aria-disabled="true">
        Paste, drop, or click to add files
      </div>
      {failed ? (
        <div className="ic-error" role="alert">
          <WarningIcon /> <strong>Not posted</strong>: {state.error}
        </div>
      ) : null}
      {posting ? (
        <div className="ic-posting" role="status">
          <SpinnerIcon /> Posting comment…
        </div>
      ) : null}
      <div className="ic-foot">
        <span className="ic-hint muted">Ctrl+Enter comment · Ctrl+Shift+Enter add to review · Esc close</span>
        <button type="button" className="btn" disabled={posting} onClick={() => dispatch({ type: 'close' })}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={!canPost} onClick={() => p.onSubmit(true)}>
          {secondaryLabel(p.hasPendingReview)}
        </button>
        <button type="button" className="btn btn-primary" disabled={!canPost} onClick={() => p.onSubmit(false)}>
          {primaryLabel(state)}
        </button>
      </div>
    </div>
  );
}
