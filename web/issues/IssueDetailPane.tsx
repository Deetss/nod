import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import type { IssueDetail, IssueSummary } from '../../shared/issue-types';
import { retryCommand, splitCommand, splitHeld, type RetryState, type SplitState } from '../../shared/bot';
import { bot } from '../org-settings';
import { useDensityValue } from '../density';
import { Html } from '../Markdown';
import { Btn, KeyCap, formatAge } from '../ui';
import { commentsLabel } from './issue-utils';
import { Card, LabelChip, StatePill } from './parts';
import { IssueThread, type ThreadItem } from './IssueThread';
import { EmptyPane } from '../Logo';
import { useImagePaste } from '../useImagePaste';
import { ParentStrip } from './SubIssuesCard';
import { repoLabel } from '../repo-label';
import { MentionTextarea } from '../mentions/MentionTextarea';
import { screenPeople } from '../mentions/mention-logic';

function ArrowIcon({ up }: { up?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function threadOf(d: IssueDetail): ThreadItem[] {
  const items: ThreadItem[] = [
    ...d.comments.map((comment, index) => ({
      kind: 'comment' as const,
      at: Date.parse(comment.createdAt),
      comment,
      index,
    })),
    ...d.timeline.map((event) => ({ kind: 'event' as const, at: Date.parse(event.createdAt), event })),
  ];
  return items.sort((a, b) => a.at - b.at);
}

interface TitleProps {
  title: string;
  editing: boolean;
  disabled: boolean;
  onStart: () => void;
  onSave: (title: string) => void;
  onCancel: () => void;
}

function Title({ title, editing, disabled, onStart, onSave, onCancel }: TitleProps) {
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) {
      setValue(title);
      input.current?.focus();
      input.current?.select();
    }
  }, [editing, title]);

  if (editing) {
    return (
      <input
        ref={input}
        className="idetail-title-input"
        value={value}
        aria-label="Issue title"
        onChange={(e) => setValue(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
          if (e.key === 'Enter' && value.trim()) onSave(value.trim());
        }}
      />
    );
  }
  return (
    <h1
      className="idetail-title clamp2"
      title={disabled ? title : `${title} (click to edit)`}
      onClick={disabled ? undefined : onStart}
    >
      {title}
    </h1>
  );
}

export interface IssueDetailPaneProps {
  detail: IssueDetail | undefined;
  error: string | undefined;
  selectedLabel: string | undefined;
  /** The selected row from the list, shown as a header until its detail loads. */
  selectedItem: IssueSummary | undefined;
  compact: boolean;
  disabled: boolean;
  /** Comments from this index on show NEW. */
  unseenFrom: number;
  editingTitle: boolean;
  threadRef: Ref<HTMLDivElement>;
  composerRef: Ref<HTMLTextAreaElement>;
  showBack: boolean;
  onBack: () => void;
  onPrevComment: () => void;
  onNextComment: () => void;
  onEditTitle: () => void;
  onSaveTitle: (title: string) => void;
  onCancelTitle: () => void;
  onComment: (body: string) => Promise<boolean>;
  /** A pasted or dropped image could not be uploaded. */
  onUploadError: (message: string) => void;
  onClose: (reason: 'COMPLETED' | 'NOT_PLANNED') => void;
  onReopen: () => void;
  onLabels: () => void;
  onAssign: () => void;
  onMilestone: () => void;
  onNew: () => void;
  onMetadata: () => void;
  /** The Orca session strip, pinned between the header and the thread. */
  orcaStrip?: ReactNode;
  /** The sub-issues card, placed under the description. */
  subIssues?: ReactNode;
  /** The bot check strip above the thread at narrow widths. */
  botStrip?: ReactNode;
  /** Opens the parent from the strip above the title. */
  onParent: () => void;
  /** The bot's retry: hidden, offered, or posted and waiting for the bot. */
  retry: RetryState;
  onRetry: () => void;
  /** The bot's proposed split: hidden, offered, posted and waiting, or held by existing sub-issues. */
  split: SplitState;
  /** Opens the split preview. */
  onSplit: () => void;
}

interface SplitButtonProps {
  state: SplitState;
  disabled: boolean;
  onClick: () => void;
}

export function SplitButton({ state, disabled, onClick }: SplitButtonProps) {
  if (state === 'hidden') return null;
  if (state === 'held') return <span className="muted small split-held">{splitHeld(bot())}</span>;
  const pending = state === 'pending';
  return (
    <Btn
      keyHint={pending ? undefined : 'B'}
      disabled={disabled || pending}
      title={pending ? `Posted ${splitCommand(bot())}. Waiting for ${bot().name}.` : `Previews ${bot().name}’s split, then posts ${splitCommand(bot())}.`}
      onClick={onClick}
    >
      {pending ? 'Split requested' : 'Split'}
    </Btn>
  );
}

interface RetryButtonProps {
  state: RetryState;
  disabled: boolean;
  onClick: () => void;
}

function RetryButton({ state, disabled, onClick }: RetryButtonProps) {
  if (state === 'hidden') return null;
  const pending = state === 'pending';
  return (
    <Btn
      keyHint={pending ? undefined : 'T'}
      disabled={disabled || pending}
      title={pending ? `Posted ${retryCommand(bot())}. Waiting for ${bot().name}.` : `Posts ${retryCommand(bot())}. ${bot().name} reruns from the start.`}
      onClick={onClick}
    >
      {pending ? 'Retry requested' : `Retry ${bot().name}`}
    </Btn>
  );
}

export function IssueDetailPane(p: IssueDetailPaneProps) {
  const d = p.detail;
  const [draft, setDraft] = useState('');
  const images = useImagePaste({ repo: d?.summary.repo, update: setDraft, onError: p.onUploadError });
  const [sending, setSending] = useState(false);
  const [more, setMore] = useState(false);
  const thread = useMemo(() => (d ? threadOf(d) : []), [d]);
  const unseenCount = d ? Math.max(0, d.comments.length - p.unseenFrom) : 0;
  // People on the issue for @mention suggestions: author, assignees, then commenters and participants.
  const mentionPeople = useMemo(
    () =>
      d
        ? screenPeople(
            d.summary.author,
            [],
            d.assignees.map((a) => a.login),
            [...d.comments.map((c) => c.author), ...d.participants.map((u) => u.login)],
          )
        : [],
    [d],
  );
  const closed = d?.summary.state === 'closed';
  // Comfortable three-pane markup; the narrow layouts keep the compact one.
  const comfy = useDensityValue() === 'comfortable' && !p.compact;

  // A different issue starts with an empty composer.
  const id = d?.summary.id;
  useEffect(() => {
    setDraft('');
    setMore(false);
  }, [id]);

  const send = async () => {
    if (!draft.trim() || sending || p.disabled) return;
    setSending(true);
    const ok = await p.onComment(draft.trim());
    setSending(false);
    if (ok) setDraft('');
  };

  const sendBtn = (
    <button
      type="button"
      className="btn btn-primary"
      disabled={!draft.trim() || sending || p.disabled}
      onClick={() => void send()}
    >
      {sending ? 'Sending...' : 'Comment'}
      {p.compact ? null : <KeyCap>Ctrl+Enter</KeyCap>}
    </button>
  );

  return (
    <section className="pane idetail" aria-label="Issue detail">
      <div className="pane-h idetail-h">
        {comfy ? (
          <>
            <span />
            <span className="idetail-tools">
              <Btn disabled={!d || p.disabled} onClick={p.onEditTitle}>
                Edit title
              </Btn>
              <button type="button" className="btn icon-btn" aria-label="Previous comment" onClick={p.onPrevComment}>
                <ArrowIcon up />
              </button>
              <button type="button" className="btn icon-btn" aria-label="Next comment" onClick={p.onNextComment}>
                <ArrowIcon />
              </button>
            </span>
          </>
        ) : (
          <>
            <span>
              {p.showBack ? (
                <button type="button" className="btn icon-btn" onClick={p.onBack} aria-label="Back to issues">
                  Back
                </button>
              ) : null}{' '}
              <span className="pane-cap">ISSUE DETAIL + THREAD</span>
            </span>
            <span className="idetail-hints">
              <span>
                <KeyCap>e</KeyCap> edit title
              </span>
              <span>
                <KeyCap>[</KeyCap>
                <KeyCap>]</KeyCap> prev/next comment
              </span>
            </span>
          </>
        )}
      </div>
      {p.orcaStrip}
      <div className="scroll idetail-scroll" ref={p.threadRef}>
        {!d && !p.error && !p.selectedLabel ? (
          <EmptyPane title="Select an issue." hint="j k to move · Enter to open" />
        ) : !d && !p.error && p.selectedItem ? (
          <div className="idetail-body">
            <h1 className="idetail-title clamp2" title={p.selectedItem.title}>
              {p.selectedItem.title}
            </h1>
            <div className="muted ellipsis">
              {repoLabel(p.selectedItem.repo)} <span className="row-num">#{p.selectedItem.number}</span> by {p.selectedItem.author}
            </div>
            <div className="placeholder muted">Loading details</div>
          </div>
        ) : !d ? (
          <div className="placeholder muted">{p.error ?? 'Loading...'}</div>
        ) : (
          <div className={`idetail-body${comfy ? ' idetail-c' : ''}`}>
            {d.parent ? <ParentStrip parent={d.parent} onOpen={p.onParent} /> : null}
            <Title
              title={d.summary.title}
              editing={p.editingTitle}
              disabled={p.disabled}
              onStart={p.onEditTitle}
              onSave={p.onSaveTitle}
              onCancel={p.onCancelTitle}
            />
            {p.compact ? p.botStrip : null}
            {comfy ? (
              <>
                <div className="idetail-sub">
                  <StatePill state={d.summary.state} reason={d.summary.closeReason} />
                  <span className="muted ellipsis">
                    {repoLabel(d.summary.repo)} <span className="row-num">#{d.summary.number}</span> · opened{' '}
                    {formatAge(d.summary.createdAt)} ago by{' '}
                    {d.summary.author}
                  </span>
                </div>
                <Html html={d.bodyHtml || '<p><em>No description.</em></p>'} className="idetail-md" />
                {p.subIssues}
                <div className="thread-h thread-h-c">
                  <strong>Thread</strong>
                  <span className="muted">
                    {d.comments.length} comment{d.comments.length === 1 ? '' : 's'}
                    {unseenCount > 0 ? ` · ${unseenCount} new` : ''}
                  </span>
                </div>
                <IssueThread items={thread} unseenFrom={p.unseenFrom} />
              </>
            ) : (
              <>
            <div className="idetail-meta muted ellipsis">
              {repoLabel(d.summary.repo)} <span className="row-num">#{d.summary.number}</span> <span className="gap" /> by{' '}
              {d.summary.author}{' '}
              <span className="gap" /> opened {formatAge(d.summary.createdAt)} ago <span className="gap" />{' '}
              {commentsLabel(d.summary.commentCount)}
            </div>
            <div className="idetail-chips">
              <StatePill state={d.summary.state} reason={d.summary.closeReason} />
              {d.summary.labels.map((l) => (
                <LabelChip key={l.name} label={l} />
              ))}
              {p.compact ? (
                <>
                  {d.assignees.map((a) => (
                    <span key={a.login} className="npill">
                      {a.login}
                    </span>
                  ))}
                  {d.milestone ? <span className="npill">{d.milestone}</span> : null}
                  {d.linkedPrs.map((pr) => (
                    <span key={pr.number} className="npill npill-dashed">
                      PR #{pr.number}
                      {pr.isDraft ? ' draft' : ''}
                    </span>
                  ))}
                </>
              ) : null}
            </div>
            {p.compact ? (
              <div className="meta-strip">
                <span className="muted ellipsis">
                  {d.assignees.length} assignee{d.assignees.length === 1 ? '' : 's'}
                  {d.milestone ? `, ${d.milestone}` : ''}, {d.linkedPrs.length} linked PR
                </span>
                <Btn keyHint="i" onClick={p.onMetadata}>
                  Metadata
                </Btn>
              </div>
            ) : null}
            <Card title="Description" hint={<><KeyCap>e</KeyCap> edit</>}>
              <Html html={d.bodyHtml || '<p><em>No description.</em></p>'} />
            </Card>
            {p.subIssues}
            <div className="thread-h">
              <strong>Thread</strong>
              <span className="muted">{commentsLabel(d.comments.length).replace('no comments', '0 comments')}</span>
              <span className="thread-h-r muted small">
                {unseenCount > 0 ? (
                  <>
                    <span className="dot dot-static" aria-hidden="true" /> {unseenCount} new since you looked{' '}
                  </>
                ) : null}
                oldest first
              </span>
            </div>
            <IssueThread items={thread} unseenFrom={p.unseenFrom} />
              </>
            )}
          </div>
        )}
      </div>
      <div className={`composer${comfy ? ' composer-c' : ''}`}>
        <div className="composer-box">
          <MentionTextarea
            textareaRef={p.composerRef}
            repo={d?.summary.repo ?? ''}
            people={mentionPeople}
            placement="above"
            value={draft}
            onValueChange={setDraft}
            rows={Math.min(3, Math.max(1, draft.split('\n').length))}
            placeholder="Write a comment. Markdown supported. Ctrl+Enter sends."
            aria-label="Comment"
            disabled={!d || p.disabled}
            {...images}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
              if (e.key === 'Escape') e.currentTarget.blur();
            }}
          />
          <KeyCap>c</KeyCap>
        </div>
        <div className="composer-actions">
          {sendBtn}
          <RetryButton state={p.retry} disabled={!d || p.disabled} onClick={p.onRetry} />
          <SplitButton state={p.split} disabled={!d || p.disabled} onClick={p.onSplit} />
          {comfy ? null : closed ? (
            <Btn keyHint="o" disabled={!d || p.disabled} onClick={p.onReopen}>
              Reopen
            </Btn>
          ) : (
            <Btn keyHint="x" disabled={!d || p.disabled} onClick={() => p.onClose('COMPLETED')}>
              {p.compact ? 'Close' : 'Close as completed'}
            </Btn>
          )}
          {comfy ? null : p.compact ? (
            <>
              <Btn keyHint="l" disabled={!d || p.disabled} onClick={p.onLabels}>
                Labels
              </Btn>
              <Btn keyHint="a" disabled={!d || p.disabled} onClick={p.onAssign}>
                Assign
              </Btn>
              <div className="more">
                <button
                  type="button"
                  className="btn more-btn"
                  aria-expanded={more}
                  disabled={!d || p.disabled}
                  onClick={() => setMore((m) => !m)}
                >
                  More <KeyCap>.</KeyCap>
                </button>
                {more ? (
                  <ul className="dd-menu more-menu">
                    {[
                      ['Not planned', 'X', () => p.onClose('NOT_PLANNED')],
                      ['Milestone', 'm', p.onMilestone],
                      ['Reopen', 'o', p.onReopen],
                      ['New issue', 'n', p.onNew],
                    ].map(([label, key, run]) => (
                      <li key={String(label)}>
                        <button
                          type="button"
                          onClick={() => {
                            setMore(false);
                            (run as () => void)();
                          }}
                        >
                          {String(label)} <KeyCap>{String(key)}</KeyCap>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : (
            <Btn keyHint="X" disabled={!d || p.disabled || closed} onClick={() => p.onClose('NOT_PLANNED')}>
              Not planned
            </Btn>
          )}
        </div>
      </div>
    </section>
  );
}
