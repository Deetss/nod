import { useEffect, useRef, useState } from 'react';
import type { CloseReason, IssueLabel, RepoMeta } from '../../shared/issue-types';
import type { BulkFailure } from '../../shared/bulk';
import { DEFAULT_AGENT, dispatchPrompt, worktreeName, type OrcaDispatchRequest } from '../../shared/orca';
import { ModelFields, refreshOrcaModels, useModelChoice, useOrcaModels } from '../orca/ModelFields';
import { bot } from '../org-settings';
import { Btn, KeyCap } from '../ui';
import { useFocusTrap } from '../useFocusTrap';
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
  const trap = useFocusTrap();
  const one = p.targets.length === 1 ? p.targets[0] : undefined;

  return (
    <div className="scrim" onMouseDown={p.onCancel}>
      <div
        ref={trap}
        className="dialog close-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Close issue"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') p.onCancel();
          if (e.key === '1') setReason('COMPLETED');
          if (e.key === '2') setReason('NOT_PLANNED');
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !p.busy) {
            e.preventDefault();
            p.onConfirm(reason, comment);
          }
        }}
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
        <h2>
          {one ? `Close ${repoLabel(one.repo)} #${one.number}?` : `Close ${p.targets.length} issues?`}
        </h2>
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
        <div className="dialog-actions">
          <Btn onClick={p.onCancel}>
            Cancel <KeyCap>Esc</KeyCap>
          </Btn>
          <button
            ref={confirm}
            type="button"
            className="btn btn-done"
            disabled={p.busy}
            onClick={() => p.onConfirm(reason, comment)}
          >
            {p.busy ? 'Closing...' : 'Close issue'}
            <KeyCap>Enter</KeyCap>
          </button>
        </div>
      </div>
    </div>
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
  const trap = useFocusTrap();

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

  return (
    <div className="scrim" onMouseDown={p.onCancel}>
      <div
        ref={trap}
        className="dialog new-issue"
        role="dialog"
        aria-modal="true"
        aria-label="New issue"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') p.onCancel();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) create();
        }}
      >
        <div className="dialog-head">
          <h2>New issue</h2>
          <span className="muted small">Esc cancels</span>
        </div>
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
        <div className="dialog-actions">
          <Btn primary keyHint="Ctrl+Enter" disabled={!ready} onClick={create}>
            {p.busy ? 'Creating...' : 'Create issue'}
          </Btn>
          <Btn keyHint="Esc" onClick={p.onCancel}>
            Cancel
          </Btn>
        </div>
      </div>
    </div>
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
  const trap = useFocusTrap();

  return (
    <div className="scrim" onMouseDown={() => !p.busy && p.onCancel()}>
      <div
        ref={trap}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Hand #${number} to ${b.name}`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !p.busy) p.onCancel();
          if (e.key !== 'Enter' || e.nativeEvent.isComposing || p.busy) return;
          // Buttons handle Enter themselves, so Cancel cancels and Confirm does not fire twice.
          if (!(e.target instanceof HTMLButtonElement)) {
            e.preventDefault();
            p.onConfirm();
          }
        }}
      >
        <h2>
          Hand #{number} to {b.name}?
        </h2>
        <p className="muted ellipsis">{title}</p>
        <p>
          Adds the {b.label} label to {repoLabel(repo)} #{number}, creating the label in the repo first if it is missing.{' '}
          {b.name} starts on its own.
        </p>
        <div className="dialog-actions">
          <Btn onClick={p.onCancel} disabled={p.busy}>
            Cancel
          </Btn>
          <button
            ref={confirm}
            type="button"
            className={`btn btn-primary${p.busy ? ' is-busy' : ''}`}
            aria-disabled={p.busy || undefined}
            aria-busy={p.busy || undefined}
            onClick={() => !p.busy && p.onConfirm()}
          >
            {p.busy ? <span className="spinner" aria-hidden="true" /> : null}
            {p.busy ? `Handing to ${b.name}...` : `Hand to ${b.name}`}
          </button>
        </div>
        <span className="sr-only" role="status">
          {p.busy ? `Handing ${repoLabel(repo)} #${number} to ${b.name}` : ''}
        </span>
      </div>
    </div>
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
  const [agent, setAgent] = useState(p.agents.includes(DEFAULT_AGENT) ? DEFAULT_AGENT : (p.agents[0] ?? DEFAULT_AGENT));
  const models = useOrcaModels();
  const agentTouched = useRef(false);
  // Start on the agent last dispatched with, unless the user already picked one.
  useEffect(() => {
    const last = models?.lastAgent;
    if (last && !agentTouched.current && p.agents.includes(last)) setAgent(last);
  }, [models?.lastAgent, p.agents]);
  const m = useModelChoice(agent, models);
  const [name, setName] = useState(() => p.pr?.name ?? worktreeName(number, title));
  const [baseBranch, setBaseBranch] = useState('');
  const [prompt, setPrompt] = useState(() => p.pr?.prompt ?? dispatchPrompt(repo, number, title, url));
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => confirm.current?.focus(), []);
  const trap = useFocusTrap();

  const base = baseBranch.trim();
  const nameOk = /^[a-z0-9][a-z0-9-]{0,60}$/.test(name);
  const baseOk = base === '' || /^[A-Za-z0-9._/-]{1,100}$/.test(base);
  const promptOk = prompt.trim() !== '' && prompt.length <= 4000;
  const ready = nameOk && baseOk && promptOk && m.choice.valid && !p.busy;
  const go = () => {
    if (!ready) return;
    const model = { model: m.choice.model, ...(m.choice.effort ? { effort: m.choice.effort } : {}) };
    refreshOrcaModels();
    if (p.pr) p.onConfirm({ agent, name, baseBranch: p.pr.headRef, prompt, pr: true, ...model });
    else p.onConfirm({ agent, name, ...(base ? { baseBranch: base } : {}), prompt, ...model });
  };

  return (
    <div className="scrim" onMouseDown={p.onCancel}>
      <div
        ref={trap}
        className="dialog dispatch-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Dispatch with Orca"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') p.onCancel();
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
            e.preventDefault();
            go();
          }
        }}
      >
        <div className="dialog-head">
          <h2>Dispatch with Orca</h2>
          <span className="muted small">
            {repoLabel(repo)} #{number}
          </span>
        </div>
        <label className="field-label" htmlFor="dp-agent">
          Agent
        </label>
        <select
          id="dp-agent"
          value={agent}
          onChange={(e) => {
            agentTouched.current = true;
            setAgent(e.target.value);
          }}
        >
          {p.agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <ModelFields agent={agent} m={m} />
        <label className="field-label" htmlFor="dp-name">
          Worktree name
        </label>
        <input id="dp-name" value={name} aria-invalid={!nameOk} onChange={(e) => setName(e.target.value)} />
        {nameOk ? null : <span className="muted small">Lower-case letters, digits and dashes, up to 61 characters.</span>}
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
        <div className="dialog-actions">
          <Btn onClick={p.onCancel}>
            Cancel <KeyCap>Esc</KeyCap>
          </Btn>
          <button ref={confirm} type="button" className="btn btn-primary" disabled={!ready} onClick={go}>
            {p.busy ? <span className="spinner" aria-hidden="true" /> : null}
            {p.busy ? 'Dispatching...' : 'Dispatch'}
            <KeyCap>Enter</KeyCap>
          </button>
        </div>
      </div>
    </div>
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
  const trap = useFocusTrap<HTMLDivElement>(p.onDismiss);
  useEffect(() => trap.current?.focus(), [trap]);
  return (
    <div className="scrim" onMouseDown={p.onDismiss}>
      <div
        ref={trap}
        tabIndex={-1}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={p.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>{p.title}</h2>
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
        <div className="dialog-actions">
          <Btn onClick={p.onDismiss}>
            Dismiss <KeyCap>Esc</KeyCap>
          </Btn>
          <Btn primary onClick={p.onRetry}>
            Retry failed
          </Btn>
        </div>
      </div>
    </div>
  );
}
