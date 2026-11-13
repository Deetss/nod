import { useEffect, useRef, useState } from 'react';
import type { PrSummary } from '../shared/types';
import type { ActionKind } from './DetailBody';
import { HELP_KEYS, type KeyDef } from './keys';
import { Btn, Legend } from './ui';
import { useFocusTrap } from './useFocusTrap';
import { useImagePaste } from './useImagePaste';
import { repoLabel } from './repo-label';
import { MentionTextarea } from './mentions/MentionTextarea';
import type { MentionCandidate } from './mentions/mention-logic';

interface ActionDialogProps {
  kind: ActionKind;
  pr: PrSummary;
  methodLabel: string;
  busy: boolean;
  onConfirm: (body: string) => void;
  onCancel: () => void;
  /** A pasted or dropped image could not be uploaded. */
  onUploadError: (message: string) => void;
  /** People on screen for @mention suggestions. Optional. */
  mentionPeople?: readonly MentionCandidate[];
  /** The viewer's team slugs in this repo's owner. Optional. */
  mentionTeams?: readonly string[];
}

const COPY: Record<ActionKind, { title: string; confirm: string; busy: string; needsBody: boolean }> = {
  approve: { title: 'Approve', confirm: 'Approve', busy: 'Approving...', needsBody: false },
  request: { title: 'Request changes on', confirm: 'Request changes', busy: 'Requesting changes...', needsBody: true },
  comment: { title: 'Comment on', confirm: 'Comment', busy: 'Commenting...', needsBody: true },
  merge: { title: 'Enable auto-merge on', confirm: 'Enable auto-merge', busy: 'Enabling auto-merge...', needsBody: false },
  admin: { title: 'Admin merge', confirm: 'Admin merge', busy: 'Merging...', needsBody: false },
  ready: { title: 'Mark ready for review:', confirm: 'Ready for review', busy: 'Marking ready...', needsBody: false },
};

export function ActionDialog(p: ActionDialogProps) {
  const [body, setBody] = useState('');
  const images = useImagePaste({ repo: p.pr.repo, update: setBody, onError: p.onUploadError });
  const area = useRef<HTMLTextAreaElement>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const copy = COPY[p.kind];
  const admin = p.kind === 'admin';
  const hasBox = p.kind !== 'merge' && p.kind !== 'ready' && !admin;
  const [typed, setTyped] = useState('');
  const typedOk = !admin || typed.trim() === String(p.pr.number);
  const blocked = p.busy || !typedOk || (copy.needsBody && body.trim() === '');
  const typedInput = useRef<HTMLInputElement>(null);
  const trap = useFocusTrap();

  useEffect(() => {
    (area.current ?? typedInput.current ?? confirmBtn.current)?.focus();
  }, []);

  return (
    <div className="scrim" onMouseDown={() => !p.busy && p.onCancel()}>
      <div
        ref={trap}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${copy.title} ${repoLabel(p.pr.repo)} #${p.pr.number}`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !p.busy) p.onCancel();
          if (e.key !== 'Enter' || e.nativeEvent.isComposing || blocked) return;
          const modified = e.metaKey || e.ctrlKey;
          // Buttons handle Enter themselves, so Cancel cancels and Confirm does not fire twice.
          const plain = !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLTextAreaElement);
          if (modified || plain) {
            e.preventDefault();
            p.onConfirm(admin ? typed.trim() : body);
          }
        }}
      >
        <h2>
          {copy.title} {repoLabel(p.pr.repo)} #{p.pr.number}?
        </h2>
        <p className="muted ellipsis">{p.pr.title}</p>
        {admin ? (
          <>
            <p>
              <strong>Bypasses required review.</strong> Merges now with <strong>{p.methodLabel}</strong>.
              This cannot be undone.
            </p>
            <input
              ref={typedInput}
              className="confirm-input mono"
              value={typed}
              inputMode="numeric"
              placeholder={`Type ${p.pr.number} to confirm`}
              aria-label={`Type the PR number ${p.pr.number} to confirm`}
              onChange={(e) => setTyped(e.target.value)}
            />
          </>
        ) : null}
        {p.kind === 'ready' ? (
          <p>This takes the PR out of draft and lets GitHub notify reviewers. Merging is blocked until you do.</p>
        ) : null}
        {p.kind === 'merge' ? (
          <p>
            GitHub merges when required checks and reviews pass. Method: <strong>{p.methodLabel}</strong>.
          </p>
        ) : null}
        {hasBox ? (
          <MentionTextarea
            textareaRef={area}
            repo={p.pr.repo}
            people={p.mentionPeople}
            teams={p.mentionTeams}
            value={body}
            onValueChange={setBody}
            rows={6}
            placeholder={copy.needsBody ? 'Review comment (required)' : 'Optional comment'}
            aria-label="Review comment"
            {...images}
          />
        ) : null}
        <div className="dialog-actions">
          <Btn onClick={p.onCancel} disabled={p.busy}>
            Cancel
          </Btn>
          <button
            ref={confirmBtn}
            type="button"
            className={`btn ${admin ? 'btn-danger' : 'btn-primary'}${p.busy ? ' is-busy' : ''}`}
            disabled={!p.busy && blocked}
            aria-disabled={p.busy || undefined}
            aria-busy={p.busy || undefined}
            onClick={() => !blocked && p.onConfirm(admin ? typed.trim() : body)}
          >
            {p.busy ? <span className="spinner" aria-hidden="true" /> : null}
            {p.busy ? copy.busy : copy.confirm}
          </button>
        </div>
        <span className="sr-only" role="status">
          {p.busy ? `${copy.busy.replace('...', '')} ${repoLabel(p.pr.repo)} #${p.pr.number}` : ''}
        </span>
      </div>
    </div>
  );
}

export function HelpSheet({ onClose, keys = HELP_KEYS }: { onClose: () => void; keys?: KeyDef[] }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const half = Math.ceil(keys.length / 2);
  const trap = useFocusTrap();
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        ref={trap}
        tabIndex={-1}
        className="dialog help"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard help"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Keyboard help</h2>
        <div className="help-cols">
          {[keys.slice(0, half), keys.slice(half)].map((col, i) => (
            <div key={i}>
              {col.map((k) => (
                <div className="help-row" key={k.keys}>
                  <span className="help-key mono">{k.keys}</span>
                  <span>{k.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <Legend className="legend help-legend" />
        <p className="muted small">Every key has a visible button. Mouse covers all of it.</p>
      </div>
    </div>
  );
}
