import { useEffect, useRef, useState, type KeyboardEventHandler } from 'react';
import type { CloseReason, IssueLabel, RepoMeta } from '../../shared/issue-types';
import type { BulkFailure } from '../../shared/bulk';
import { dispatchPrompt, worktreeName, type OrcaDispatchRequest } from '../../shared/orca';
import { DispatchFields, useDispatchFields } from '../orca/DispatchFields';
import { HostFallback, NewWorktreeRow, useWorktreeHost } from '../orca/HostPicker';
import { useHostChoice } from '../orca/OrcaContext';
import { bot } from '../org-settings';
import { Btn, KeyCap } from '../ui';
import { AppDialog } from '../AppDialog';
import { CircleCheckIcon, CircleDotIcon, LabelChip, SlashCircleIcon } from './parts';
import { repoLabel } from '../repo-label';

interface CloseDialogProps {
  /** One issue, or several in bulk mode. */
  targets: { repo: string; number: number; title: string }[];
  linkedPr?: string;
  initial: CloseReason;
  busy: boolean;
  onConfirm: (reason: CloseReason, comment: string) => void;
  onCancel: () => void;
}

export function CloseDialog(p: CloseDialogProps) {
  const [reason, setReason] = useState<CloseReason>(p.initial);
  const [comment, setComment] = useState('');
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => confirm.current?.focus(), []);

  const onKeyDown: KeyboardEventHandler = (e) => {
    if (e.key === '1') setReason('COMPLETED');
    if (e.key === '2') setReason('NOT_PLANNED');
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !p.busy) {
      e.preventDefault();
      p.onConfirm(reason, comment);
    }
  };

  const one = p.targets.length === 1 ? p.targets[0] : undefined;

  return (
    <AppDialog
      title={one ? `Close ${repoLabel(one.repo)} #${one.number}?` : `Close ${p.targets.length} issues?`}
      onClose={p.onCancel}
      busy={p.busy}
      className="close-dialog"
      initialFocusRef={confirm}
      onKeyDown={onKeyDown}
      footer={[
        <Btn key="cancel" onClick={p.onCancel}>
          Cancel <KeyCap>Esc</KeyCap>
        </Btn>,
        <button
          key="confirm"
          ref={confirm}
          type="button"
          className="btn btn-done"
          disabled={p.busy}
          onClick={() => p.onConfirm(reason, comment)}
        >
          {p.busy ? 'Closing...' : 'Close issue'}
          <KeyCap>Enter</KeyCap>
        </button>,
      ]}
    >
      <div className="state-chips">
        <span className="muted small">State chips</span>
        <span className="state-pill state-open">
          <CircleDotIcon /> Open
        </span>
        <span aria-hidden="true">→</span>
        <span className="state-pill state-closed">
          <CircleCheckIcon /> Closed
        </span>
        <span className="muted small">then Reopen (o) enables</span>
      </div>
      <p className="muted ellipsis small">
        {one ? one.title : p.targets.map((t) => `${repoLabel(t.repo)} #${t.number}`).join(', ')}
      </p>
      <div className="radio-cards" role="radiogroup" aria-label="Close reason">
        <label className={`radio-card${reason === 'COMPLETED' ? ' is-on' : ''}`}>
          <input type="radio" name="reason" checked={reason === 'COMPLETED'} onChange={() => setReason('COMPLETED')} />
          <span className="rc-done">
            <CircleCheckIcon />
          </span>
          <span className="rc-text">
            <strong>Close as completed</strong>
            <span className="muted small">Done, fixed or shipped.</span>
          </span>
          <span className="kbd">1</span>
        </label>
        <label className={`radio-card${reason === 'NOT_PLANNED' ? ' is-on' : ''}`}>
          <input type="radio" name="reason" checked={reason === 'NOT_PLANNED'} onChange={() => setReason('NOT_PLANNED')} />
          <span className="muted">
            <SlashCircleIcon />
          </span>
          <span className="rc-text">
            <strong>Close as not planned</strong>
            <span className="muted small">Won&apos;t fix, duplicate or stale.</span>
          </span>
          <span className="kbd">2</span>
        </label>
      </div>
      <label className="field-label" htmlFor="close-comment">
        Comment (optional)
      </label>
      <textarea
        id="close-comment"
        rows={3}
        value={comment}
        placeholder="Closing note. Posted before the issue closes."
        onChange={(e) => setComment(e.target.value)}
      />
      {p.linkedPr ? (
        <label className="check-row is-disabled">
          <input type="checkbox" disabled />
          <span>Also unlink PR {p.linkedPr}</span>
          <span className="muted small">not available yet</span>
        </label>
      ) : null}
    </AppDialog>
  );
}

interface NewIssueDialogProps {
  repos: string[];
  initialRepo: string;
  meta: RepoMeta | undefined;
  busy: boolean;
  onRepo: (repo: string) => void;
  onPickLabels: (current: string[], set: (names: string[]) => void) => void;
  onPickAssignees: (current: string[], set: (logins: string[]) => void) => void;
  onCreate: (v: { repo: string; title: string; body: string; labels: string[]; assignees: string[] }) => void;
  onCancel: () => void;
}

export function NewIssueDialog(p: NewIssueDialogProps) {
  const [repo, setRepo] = useState(p.initialRepo);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [labels, setLabels] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  // The repo's issue template fills the description until the user types there.
  const template = p.meta?.template;
  useEffect(() => {
    if (template && !touched) setBody(template);
  }, [template, touched]);

  const chips: IssueLabel[] = labels.map(
    (n) => p.meta?.labels.find((l) => l.name === n) ?? { name: n, color: '6e7167' },
  );
  const ready = title.trim() !== '' && !p.busy;
  const create = () => ready && p.onCreate({ repo, title: title.trim(), body, labels, assignees });

  const onKeyDown: KeyboardEventHandler = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) create();
  };

  return (
    <AppDialog
      title="New issue"
      onClose={p.onCancel}
      busy={p.busy}
      className="new-issue"
      initialFocusRef={titleRef}
      onKeyDown={onKeyDown}
      footer={[
        <Btn key="create" primary keyHint="Ctrl+Enter" disabled={!ready} onClick={create}>
          {p.busy ? 'Creating...' : 'Create issue'}
        </Btn>,
        <Btn key="cancel" keyHint="Esc" onClick={p.onCancel}>
          Cancel
        </Btn>,
      ]}
    >
      <label className="field-label" htmlFor="ni-repo">
        Repository
      </label>
      <select
        id="ni-repo"
        value={repo}
        onChange={(e) => {
          setRepo(e.target.value);
          setLabels([]);
          setAssignees([]);
          p.onRepo(e.target.value);
        }}
      >
        {p.repos.map((r) => (
          <option key={r} value={r}>
            {repoLabel(r)}
          </option>
        ))}
      </select>
      <label className="field-label" htmlFor="ni-title">
        Title
      </label>
      <input
        id="ni-title"
        ref={titleRef}
        value={title}
        placeholder="Short summary"
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="field-label">Description</div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? 'is-on' : ''} onClick={() => setTab('write')}>
          Write
        </button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'is-on' : ''} onClick={() => setTab('preview')}>
          Preview
        </button>
      </div>
      {tab === 'write' ? (
        <textarea
          rows={6}
          value={body}
          placeholder="Markdown. The repo issue template loads here."
          aria-label="Description"
          onChange={(e) => {
            setTouched(true);
            setBody(e.target.value);
          }}
        />
      ) : (
        <pre className="preview-box">{body || 'Nothing to preview. GitHub renders the markdown after creating.'}</pre>
      )}
      <div className="ni-row">
        <span className="field-label">Labels</span>
        {chips.map((l) => (
          <LabelChip key={l.name} label={l} />
        ))}
        <button type="button" className="btn" onClick={() => p.onPickLabels(labels, setLabels)}>
          + add <KeyCap>l</KeyCap>
        </button>
      </div>
      <div className="ni-row">
        <span className="field-label">Assignee</span>
        {assignees.map((a) => (
          <span className="npill" key={a}>
            {a}
          </span>
        ))}
        <button type="button" className="btn" onClick={() => p.onPickAssignees(assignees, setAssignees)}>
          + add <KeyCap>a</KeyCap>
        </button>
      </div>
    </AppDialog>
  );
}

interface BotDialogProps {
  issue: { repo: string; number: number; title: string };
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BotDialog(p: BotDialogProps) {
  const { repo, number, title } = p.issue;
  const b = bot();
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => confirm.current?.focus(), []);

  const onKeyDown: KeyboardEventHandler = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || p.busy) return;
    // Buttons handle Enter themselves, so Cancel cancels and Confirm does not fire twice.
    if (!(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      p.onConfirm();
    }
  };

  return (
    <AppDialog
      title={`Hand #${number} to ${b.name}?`}
      onClose={p.onCancel}
      busy={p.busy}
      className=""
      initialFocusRef={confirm}
      onKeyDown={onKeyDown}
      footer={[
        <Btn key="cancel" onClick={p.onCancel} disabled={p.busy}>
          Cancel
        </Btn>,
        <button
          key="confirm"
          ref={confirm}
          type="button"
          className={`btn btn-primary${p.busy ? ' is-busy' : ''}`}
          aria-disabled={p.busy || undefined}
          aria-busy={p.busy || undefined}
          onClick={() => !p.busy && p.onConfirm()}
        >
          {p.busy ? <span className="spinner" aria-hidden="true" /> : null}
          {p.busy ? `Handing to ${b.name}...` : `Hand to ${b.name}`}
        </button>,
      ]}
    >
      <p className="muted ellipsis">{title}</p>
      <p>
        Adds the {b.label} label to {repoLabel(repo)} #{number}, creating the label in the repo first if it is missing.{' '}
        {b.name} starts on its own.
      </p>
      <span className="sr-only" role="status">
        {p.busy ? `Handing ${repoLabel(repo)} #${number} to ${b.name}` : ''}
      </span>
    </AppDialog>
  );
}

interface DispatchDialogProps {
  issue: { repo: string; number: number; title: string; url: string };
  agents: string[];
  busy: boolean;
  /** The CLI's error text from the last attempt. */
  error: string | undefined;
  onConfirm: (v: Omit<OrcaDispatchRequest, 'repo' | 'number'>) => void;
  onCancel: () => void;
  /** PR mode: the worktree starts on the PR head, which is shown read only in place of the base branch. */
  pr?: { headRef: string; name: string; prompt: string };
}

export function DispatchDialog(p: DispatchDialogProps) {
  const { repo, number, title, url } = p.issue;
  const f = useDispatchFields(p.agents, p.pr?.name ?? worktreeName(number, title));
  const [baseBranch, setBaseBranch] = useState('');
  const [prompt, setPrompt] = useState(() => p.pr?.prompt ?? dispatchPrompt(repo, number, title, url));
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => confirm.current?.focus(), []);

  const base = baseBranch.trim();
  const baseOk = base === '' || /^[A-Za-z0-9._/-]{1,100}$/.test(base);
  const promptOk = prompt.trim() !== '' && prompt.length <= 4000;
  const ready = f.valid && baseOk && promptOk && !p.busy;
  const wh = useWorktreeHost(useHostChoice(repo));
  const go = () => {
    if (!ready) return;
    const host = wh.multi ? { host: wh.host } : {};
    if (p.pr) p.onConfirm({ ...f.request(), ...host, baseBranch: p.pr.headRef, prompt, pr: true });
    else p.onConfirm({ ...f.request(), ...host, ...(base ? { baseBranch: base } : {}), prompt });
  };

  const onKeyDown: KeyboardEventHandler = (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
      go();
    }
  };

  return (
    <AppDialog
      title="Dispatch with Orca"
      onClose={p.onCancel}
      busy={p.busy}
      className="dispatch-dialog"
      initialFocusRef={confirm}
      onKeyDown={onKeyDown}
      footer={[
        <Btn key="cancel" onClick={p.onCancel}>
          Cancel <KeyCap>Esc</KeyCap>
        </Btn>,
        <button
          key="confirm"
          ref={confirm}
          type="button"
          className="btn btn-primary"
          disabled={!ready}
          onClick={go}
        >
          {p.busy ? <span className="spinner" aria-hidden="true" /> : null}
          {p.busy ? 'Dispatching...' : 'Dispatch'}
          <KeyCap>Enter</KeyCap>
        </button>,
      ]}
    >
      <p className="muted small">
        {repoLabel(repo)} #{number}
      </p>
      {wh.multi ? (
        <>
          <div className="orca-new-box">
            <NewWorktreeRow hosts={wh.hosts} host={wh.host} on busy={p.busy} onPick={wh.pick} />
          </div>
          <HostFallback fallback={wh.fallback} />
        </>
      ) : null}
      <DispatchFields f={f} agents={p.agents} />
      {p.pr ? (
        <>
          <label className="field-label" htmlFor="dp-head">
            Head branch
          </label>
          <input id="dp-head" className="dispatch-locked mono" value={p.pr.headRef} readOnly />
          <span className="muted small">Locked. The agent works on the PR head and pushes its fix there.</span>
        </>
      ) : (
        <>
          <label className="field-label" htmlFor="dp-base">
            Base branch
          </label>
          <input
            id="dp-base"
            value={baseBranch}
            placeholder="Orca's default"
            aria-invalid={!baseOk}
            onChange={(e) => setBaseBranch(e.target.value)}
          />
        </>
      )}
      <label className="field-label" htmlFor="dp-prompt">
        Prompt
      </label>
      <textarea id="dp-prompt" rows={9} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <span className="muted small">{prompt.length} / 4000</span>
      {p.error ? (
        <p className="dispatch-error" role="alert">
          {p.error}
        </p>
      ) : null}
    </AppDialog>
  );
}

interface BulkReportProps {
  title: string;
  total: number;
  failures: BulkFailure<{ repo: string; number: number }>[];
  onRetry: () => void;
  onDismiss: () => void;
}

/** Shown after a bulk run that had failures. Successes stay applied. */
export function BulkReport(p: BulkReportProps) {
  return (
    <AppDialog
      title={p.title}
      onClose={p.onDismiss}
      footer={[
        <Btn key="dismiss" onClick={p.onDismiss}>
          Dismiss <KeyCap>Esc</KeyCap>
        </Btn>,
        <Btn key="retry" primary onClick={p.onRetry}>
          Retry failed
        </Btn>,
      ]}
    >
      <p>
        {p.total - p.failures.length} of {p.total} done. {p.failures.length} failed and nothing changed on
        those. The rest stay applied.
      </p>
      <ul className="fail-list">
        {p.failures.map((f) => (
          <li key={`${f.item.repo}#${f.item.number}`}>
            <strong>
              {repoLabel(f.item.repo)} #{f.item.number}
            </strong>{' '}
            <span className="muted">{f.message}</span>
          </li>
        ))}
      </ul>
    </AppDialog>
  );
}