import { useEffect, useRef } from 'react';
import type { SplitPart } from '../../shared/issue-types';
import { splitCommand } from '../../shared/bot';
import { Btn } from '../ui';
import { useFocusTrap } from '../useFocusTrap';
import { bot } from '../org-settings';
import { repoLabel } from '../repo-label';

export const splitHeading = (count: number, number: number): string =>
  `${bot().name} will open ${count} ${count === 1 ? 'issue' : 'issues'} as sub-issues of #${number}`;

interface SplitPartsProps {
  parts: SplitPart[];
  className?: string;
}

/** Parts the bot proposes with their acceptance criteria collapsed. Rendered as text, so markup stays inert. */
export function SplitParts({ parts, className }: SplitPartsProps) {
  return (
    <ol className={`split-parts${className ? ` ${className}` : ''}`}>
      {parts.map((part, i) => (
        <li key={`${i}:${part.title}`}>
          {part.acceptanceCriteria.length === 0 ? (
            <span className="split-title">{part.title}</span>
          ) : (
            <details>
              <summary>
                <span className="split-title">{part.title}</span>
                <span className="muted small"> {part.acceptanceCriteria.length} criteria</span>
              </summary>
              <ul>
                {part.acceptanceCriteria.map((c, j) => (
                  <li key={`${j}:${c}`}>{c}</li>
                ))}
              </ul>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}

interface SplitDialogProps {
  issue: { repo: string; number: number; title: string };
  parts: SplitPart[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** Previews the bot's split. Split posts the split command; the bot opens the issues, never Nod. */
export function SplitDialog(p: SplitDialogProps) {
  const { repo, number, title } = p.issue;
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => confirm.current?.focus(), []);
  const trap = useFocusTrap();
  const heading = splitHeading(p.parts.length, number);

  return (
    <div className="scrim" onMouseDown={p.onCancel}>
      <div
        ref={trap}
        className="dialog split-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') p.onCancel();
        }}
      >
        <h2>{heading}</h2>
        <p className="muted ellipsis">
          {repoLabel(repo)} #{number} {title}
        </p>
        <SplitParts parts={p.parts} />
        <p className="muted small">Posts {splitCommand(bot())}. Each new issue starts unlabelled; use Start work on it when it is ready.</p>
        <div className="dialog-actions">
          <Btn keyHint="Esc" onClick={p.onCancel}>
            Cancel
          </Btn>
          <button ref={confirm} type="button" className="btn btn-primary" onClick={p.onConfirm}>
            Split
          </button>
        </div>
      </div>
    </div>
  );
}
