import { commentsNoun, shortRef, type ThreadItem } from '../shared/fix-comments';
import { FixButton } from './FixMenu';
import { Chevron } from './ui';
import { ALL_COMMENTS, type CommentControls } from './useFixComments';

/** Glyph slot after the label: the chevron, or a spinner while this button's menu is busy. */
const Glyph = ({ busy }: { busy: boolean }) =>
  busy ? <span className="spinner" aria-hidden="true" /> : <Chevron open size={12} />;

/** Fix on one inline review comment card. Hidden unless the thread is fixable. */
export function CommentFixButton({ fix, thread }: { fix: CommentControls; thread: ThreadItem }) {
  if (!fix.fixableIds.has(thread.id)) return null;
  return (
    <FixButton fix={fix} scope={thread.id} label={`Fix comment on ${shortRef(thread)}`} className="fix-comment">
      {(busy) => (
        <>
          Fix <Glyph busy={busy} />
        </>
      )}
    </FixButton>
  );
}

/** Fix all fixable comments, at the right end of the Thread header. Disabled at zero. */
export function ThreadFixButton({ fix }: { fix: CommentControls }) {
  const label = `Fix ${commentsNoun(fix.total)}`;
  return (
    <FixButton
      fix={fix}
      scope={ALL_COMMENTS}
      label={label}
      className="fix-all fix-thread"
      disabled={fix.total === 0 ? 'No comments to fix' : undefined}
    >
      {(busy) => (
        <>
          {label} <Glyph busy={busy} />
        </>
      )}
    </FixButton>
  );
}
