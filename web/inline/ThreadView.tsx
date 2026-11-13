import { useState, type KeyboardEvent } from 'react';
import { api } from '../api';
import { MentionTextarea } from '../mentions/MentionTextarea';
import type { MentionCandidate } from '../mentions/mention-logic';
import type { GroupedThread } from './group-threads';
import { CheckIcon, ClockIcon, OutdatedIcon, WarningIcon } from './icons';
import { commentText, threadControls, threadKeyAction, threadLabel, threadMode } from './thread-view-state';

export interface ThreadHost {
  repo: string;
  number: number;
  people?: readonly MentionCandidate[];
  teams?: readonly string[];
  /** Refetches the PR detail after a write, as other actions do. */
  onPosted: () => void;
}

type Busy = { status: 'idle' } | { status: 'posting' } | { status: 'failed'; error: string };

const message = (e: unknown) => (e instanceof Error ? e.message : 'Request failed');

const count = (n: number) => `${n} ${n === 1 ? 'comment' : 'comments'}`;

/**
 * One thread drawn under its line: the conversation with a reply box and Resolve, the collapsed
 * resolved row, or the viewer's pending draft with Edit and Delete.
 */
export function ThreadView({ g, host }: { g: GroupedThread; host: ThreadHost }) {
  const t = g.thread;
  const where = threadLabel(t);
  const [expanded, setExpanded] = useState(false);
  const mode = threadMode(g, expanded);
  const controls = threadControls(g, mode);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<Busy>({ status: 'idle' });
  const [resolveBusy, setResolveBusy] = useState<Busy>({ status: 'idle' });
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const root = t.comments[0];
  const commentId = root?.id ?? '';
  const threadId = t.threadId;

  const postReply = async () => {
    if (!threadId || reply.trim() === '' || busy.status === 'posting') return;
    setBusy({ status: 'posting' });
    try {
      const r = await api.replyToThread(host.repo, host.number, threadId, reply);
      if (r.ok) {
        setReply('');
        setBusy({ status: 'idle' });
        host.onPosted();
      } else {
        setBusy({ status: 'failed', error: r.message });
      }
    } catch (e) {
      setBusy({ status: 'failed', error: message(e) });
    }
  };

  const toggleResolve = async () => {
    if (!threadId || resolveBusy.status === 'posting') return;
    setResolveBusy({ status: 'posting' });
    try {
      const r = t.resolved
        ? await api.unresolveThread(host.repo, host.number, threadId)
        : await api.resolveThread(host.repo, host.number, threadId);
      if (r.ok) {
        setResolveBusy({ status: 'idle' });
        host.onPosted();
      } else {
        setResolveBusy({ status: 'failed', error: r.message });
      }
    } catch (e) {
      setResolveBusy({ status: 'failed', error: message(e) });
    }
  };

  const saveDraft = async () => {
    if (!commentId || draftText.trim() === '' || busy.status === 'posting') return;
    setBusy({ status: 'posting' });
    try {
      const r = await api.editDraft(host.repo, host.number, commentId, draftText);
      if (r.ok) {
        setEditing(false);
        setBusy({ status: 'idle' });
        host.onPosted();
      } else {
        setBusy({ status: 'failed', error: r.message });
      }
    } catch (e) {
      setBusy({ status: 'failed', error: message(e) });
    }
  };

  const deleteDraft = async () => {
    if (!commentId) return;
    try {
      const r = await api.deleteDraft(host.repo, host.number, commentId);
      if (r.ok) host.onPosted();
      else setBusy({ status: 'failed', error: r.message });
    } catch (e) {
      setBusy({ status: 'failed', error: message(e) });
    }
  };

  // `x` resolves or reopens the focused thread. Typing in the reply box does not reach here.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
    if (threadKeyAction(e.key, e.ctrlKey || e.metaKey, typing) === 'resolve' && threadId) {
      e.preventDefault();
      void toggleResolve();
    }
  };

  // Ctrl+Enter posts the reply from the reply box.
  const onReplyKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void postReply();
    }
  };

  const failure = busy.status === 'failed' ? busy : resolveBusy.status === 'failed' ? resolveBusy : undefined;

  if (controls.pendingPill) {
    const text = commentText(root ?? { bodyHtml: '' });
    return (
      <div className="thread-card thread-draft" role="group" aria-label={`Pending draft on ${where}`}>
        <div className="thread-head">
          <span className="thread-pill pill-pending">
            <ClockIcon />
            <span>Pending</span>
          </span>
          <span className="thread-meta">{where}</span>
        </div>
        {editing ? (
          <div className="thread-reply">
            <MentionTextarea
              aria-label={`Edit draft on ${where}`}
              value={draftText}
              onValueChange={setDraftText}
              repo={host.repo}
              {...(host.people ? { people: host.people } : {})}
              {...(host.teams ? { teams: host.teams } : {})}
              placement="below"
              rows={3}
            />
            <div className="thread-actions">
              <button type="button" className="thread-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="thread-btn thread-btn-primary"
                disabled={busy.status === 'posting' || draftText.trim() === ''}
                onClick={() => void saveDraft()}
              >
                {busy.status === 'posting' ? 'Posting...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="thread-body">{text}</div>
        )}
        {failure ? (
          <div className="thread-error" role="alert">
            <WarningIcon />
            <span>{failure.status === 'failed' ? failure.error : ''}</span>
          </div>
        ) : null}
        {!editing ? (
          <div className="thread-actions">
            <button
              type="button"
              className="thread-btn"
              aria-label={`Edit draft on ${where}`}
              onClick={() => {
                setDraftText(text);
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button type="button" className="thread-btn" aria-label={`Delete draft on ${where}`} onClick={() => void deleteDraft()}>
              Delete
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (mode === 'resolved-collapsed') {
    return (
      <div className="thread-card thread-resolved" onKeyDown={onKey}>
        <div className="thread-head">
          <span className="thread-pill pill-resolved">
            <CheckIcon />
            <span>Resolved</span>
          </span>
          <span className="thread-meta">
            {root?.author ?? ''} · {where} · {count(t.comments.length)}
          </span>
          <button type="button" className="thread-btn thread-link" aria-expanded={false} onClick={() => setExpanded(true)}>
            Show conversation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="thread-card" role="group" aria-label={`Thread on ${where}`} onKeyDown={onKey} tabIndex={-1}>
      <div className="thread-head">
        {controls.outdatedMarker ? (
          <span className="thread-pill pill-outdated">
            <OutdatedIcon />
            <span>Outdated</span>
          </span>
        ) : null}
        {g.resolved ? (
          <span className="thread-pill pill-resolved">
            <CheckIcon />
            <span>Resolved</span>
          </span>
        ) : null}
        <span className="thread-meta">
          {where} · {count(t.comments.length)}
        </span>
      </div>
      {t.comments.map((c) => (
        <div key={c.id} className="thread-comment">
          <div className="thread-author">
            <strong>{c.author}</strong> <time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString()}</time>
          </div>
          <div className="thread-body">{commentText(c)}</div>
        </div>
      ))}
      {failure ? (
        <div className="thread-error" role="alert">
          <WarningIcon />
          <span>{failure.status === 'failed' ? failure.error : ''}</span>
          <button type="button" className="thread-btn" onClick={() => (busy.status === 'failed' ? void postReply() : void toggleResolve())}>
            Retry
          </button>
        </div>
      ) : null}
      {controls.reply && threadId ? (
        <>
          <div className="thread-reply">
            <MentionTextarea
              aria-label={`Reply on ${where}`}
              value={reply}
              onValueChange={setReply}
              onKeyDown={onReplyKey}
              placeholder="Reply…"
              repo={host.repo}
              {...(host.people ? { people: host.people } : {})}
              {...(host.teams ? { teams: host.teams } : {})}
              placement="below"
              rows={2}
            />
          </div>
          <div className="thread-actions">
            <button type="button" className="thread-btn" disabled={resolveBusy.status === 'posting'} onClick={() => void toggleResolve()}>
              {resolveBusy.status === 'posting' ? 'Posting...' : 'Resolve conversation'}
            </button>
            <button
              type="button"
              className="thread-btn thread-btn-primary"
              disabled={busy.status === 'posting' || reply.trim() === ''}
              onClick={() => void postReply()}
            >
              {busy.status === 'posting' ? 'Posting...' : 'Reply'}
            </button>
          </div>
        </>
      ) : null}
      {controls.unresolve && threadId ? (
        <div className="thread-actions">
          <button type="button" className="thread-btn" disabled={resolveBusy.status === 'posting'} onClick={() => void toggleResolve()}>
            {resolveBusy.status === 'posting' ? 'Posting...' : 'Unresolve'}
          </button>
          <button type="button" className="thread-btn thread-link" aria-expanded={true} onClick={() => setExpanded(false)}>
            Hide conversation
          </button>
        </div>
      ) : null}
    </div>
  );
}
