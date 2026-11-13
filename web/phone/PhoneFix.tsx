import { useEffect, useRef, useState } from 'react';
import { COMMENT_MAX, checksNoun, commentProblem } from '../../shared/fix-checks';
import { DEFAULT_AGENT, type OrcaDispatchRequest } from '../../shared/orca';
import { bot } from '../org-settings';
import { useFocusTrap } from '../useFocusTrap';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;

interface BotProps {
  /** `acme-web #42`. */
  subject: string;
  count: number;
  initial: string;
  busy: boolean;
  onPost: (comment: string) => void;
  onCancel: () => void;
}

/** Confirm sheet with the editable bot command comment. */
export function PhoneFixBot(p: BotProps) {
  const b = bot();
  const [comment, setComment] = useState(p.initial);
  const area = useRef<HTMLTextAreaElement>(null);
  const trap = useFocusTrap(() => {
    if (!p.busy) p.onCancel();
  });
  useEffect(() => area.current?.focus(), []);

  const title = `Ask ${b.name} to fix ${checksNoun(p.count)}?`;
  const problem = commentProblem(comment, b);

  return (
    <div className="ph-scrim is-center" style={{ zIndex: 70 }} onClick={() => !p.busy && p.onCancel()}>
      <div ref={trap} className="ph-confirm" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="ph-muted ph-clip">{p.subject}</p>
        <label className="ph-fix-label" htmlFor="ph-fix-comment">
          Comment to post
        </label>
        <textarea
          id="ph-fix-comment"
          ref={area}
          className="ph-fix-field ph-mono"
          rows={5}
          value={comment}
          readOnly={p.busy}
          aria-invalid={problem !== undefined}
          onChange={(e) => setComment(e.target.value)}
        />
        <p className="ph-muted">
          {problem ?? `Posts as you on ${p.subject}. ${b.name} starts on its own.`} {comment.length} / {COMMENT_MAX}
        </p>
        <button
          type="button"
          className="ph-btn is-primary"
          disabled={problem !== undefined}
          aria-disabled={p.busy || undefined}
          aria-busy={p.busy || undefined}
          onClick={() => {
            if (!p.busy) p.onPost(comment);
          }}
        >
          {p.busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Posting comment...
            </>
          ) : (
            'Post comment'
          )}
        </button>
        <button type="button" className="ph-btn" disabled={p.busy} onClick={p.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}


interface DispatchProps {
  subject: string;
  agents: string[];
  headRef: string;
  name: string;
  prompt: string;
  busy: boolean;
  error: string | undefined;
  onDispatch: (v: Omit<OrcaDispatchRequest, 'repo' | 'number'>) => void;
  onCancel: () => void;
}

/** The Orca dispatch sheet in PR mode: the head branch is locked. */
export function PhoneFixDispatch(p: DispatchProps) {
  const [agent, setAgent] = useState(p.agents.includes(DEFAULT_AGENT) ? DEFAULT_AGENT : (p.agents[0] ?? DEFAULT_AGENT));
  const [name, setName] = useState(p.name);
  const [prompt, setPrompt] = useState(p.prompt);
  const trap = useFocusTrap(() => {
    if (!p.busy) p.onCancel();
  });

  const nameOk = NAME_RE.test(name);
  const promptOk = prompt.trim() !== '' && prompt.length <= COMMENT_MAX;
  const ready = nameOk && promptOk && !p.busy;

  return (
    <div className="ph-scrim is-center" style={{ zIndex: 70 }} onClick={() => !p.busy && p.onCancel()}>
      <div ref={trap} className="ph-confirm" role="dialog" aria-modal="true" aria-label="Dispatch with Orca" onClick={(e) => e.stopPropagation()}>
        <h2>Dispatch with Orca</h2>
        <p className="ph-muted ph-clip">{p.subject}</p>
        <label className="ph-fix-label" htmlFor="ph-fix-agent">
          Agent
        </label>
        <select id="ph-fix-agent" className="ph-fix-field" value={agent} onChange={(e) => setAgent(e.target.value)}>
          {p.agents.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label className="ph-fix-label" htmlFor="ph-fix-name">
          Worktree name
        </label>
        <input id="ph-fix-name" className="ph-fix-field" value={name} aria-invalid={!nameOk} onChange={(e) => setName(e.target.value)} />
        <label className="ph-fix-label" htmlFor="ph-fix-head">
          Head branch
        </label>
        <input id="ph-fix-head" className="ph-fix-field ph-fix-locked ph-mono" value={p.headRef} readOnly />
        <p className="ph-muted">Locked. The agent works on the PR head and pushes its fix there.</p>
        <label className="ph-fix-label" htmlFor="ph-fix-prompt">
          Prompt
        </label>
        <textarea id="ph-fix-prompt" className="ph-fix-field ph-mono" rows={7} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <p className="ph-muted">
          {prompt.length} / {COMMENT_MAX}
        </p>
        {p.error ? <p role="alert">{p.error}</p> : null}
        <button
          type="button"
          className="ph-btn is-primary"
          disabled={!ready}
          aria-busy={p.busy || undefined}
          onClick={() => p.onDispatch({ agent, name, baseBranch: p.headRef, prompt, pr: true })}
        >
          {p.busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> Dispatching...
            </>
          ) : (
            'Dispatch'
          )}
        </button>
        <button type="button" className="ph-btn" disabled={p.busy} onClick={p.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
