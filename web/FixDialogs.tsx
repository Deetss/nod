import { useEffect, useRef, useState } from 'react';
import { botComment, checksNoun, COMMENT_MAX, commentProblem, fixPrompt, fixWorktreeName, mustStartWith } from '../shared/fix-checks';
import { DispatchDialog } from './issues/IssueDialogs';
import { bot } from './org-settings';
import { Btn, KeyCap } from './ui';
import type { FixDialogState } from './useFixChecks';
import { repoLabel } from './repo-label';
import { AppDialog } from './AppDialog';

type Props = Pick<FixDialogState, 'repo' | 'number' | 'scope' | 'busy' | 'close'> & {
  onConfirm: (comment: string) => void;
};

/** Confirm dialog for the bot command comment. The comment is prefilled and editable. */
export function AskBotDialog(p: Props) {
  const b = bot();
  const [comment, setComment] = useState(() => botComment(p.scope, b));
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => confirm.current?.focus(), []);

  const ref = `${repoLabel(p.repo)} #${p.number}`;
  const title = `Ask ${b.name} to fix ${checksNoun(p.scope.length)}?`;
  const problem = commentProblem(comment, b);
  const go = () => {
    if (!problem && !p.busy) p.onConfirm(comment.trim());
  };

  return (
    <AppDialog
      title={title}
      onClose={p.close}
      busy={p.busy}
      width={520}
      className="fix-dialog"
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
        const inText = e.target instanceof HTMLTextAreaElement;
        // Buttons handle Enter themselves; the textarea needs Ctrl+Enter.
        if (inText ? e.ctrlKey : !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          go();
        }
      }}
      footer={
        <>
          <Btn disabled={p.busy} onClick={p.close}>
            Cancel <KeyCap>Esc</KeyCap>
          </Btn>
          <button
            ref={confirm}
            type="button"
            className={`btn btn-primary${p.busy ? ' is-busy' : ''}`}
            disabled={!p.busy && problem !== undefined}
            aria-disabled={p.busy || undefined}
            aria-busy={p.busy || undefined}
            onClick={go}
          >
            {p.busy ? <span className="spinner" aria-hidden="true" /> : null}
            {p.busy ? 'Posting comment...' : 'Post comment'}
            <KeyCap>Enter</KeyCap>
          </button>
        </>
      }
    >
      <p className="muted small">{ref}</p>
      <label className="field-label" htmlFor="fx-comment">
        Comment to post
      </label>
      <textarea
        id="fx-comment"
        className="mono"
        rows={4}
        value={comment}
        readOnly={p.busy}
        aria-invalid={problem !== undefined}
        onChange={(e) => setComment(e.target.value)}
      />
      <span className="muted small fix-count">
        {comment.length} / {COMMENT_MAX}
      </span>
      <p className="muted small">
        {problem === mustStartWith(b) ? problem : `Posts as you on ${ref}. ${b.name} starts on its own.`}
      </p>
      <span className="sr-only" role="status">
        {p.busy ? `Posting comment on ${ref}` : ''}
      </span>
    </AppDialog>
  );
}

/** The two Fix dialogs, mounted once by the app. */
export function FixDialogs({ fix }: { fix: FixDialogState | undefined }) {
  if (!fix?.dialog) return null;
  if (fix.dialog === 'bot') {
    return <AskBotDialog {...fix} onConfirm={fix.postComment} />;
  }
  const { repo, number, headRef, scope } = fix;
  return (
    <DispatchDialog
      issue={{ repo, number, title: '', url: '' }}
      agents={fix.agents}
      busy={fix.busy}
      error={fix.error}
      pr={{ headRef, name: fixWorktreeName(number), prompt: fixPrompt(repo, number, headRef, scope) }}
      onConfirm={fix.dispatch}
      onCancel={fix.close}
    />
  );
}
