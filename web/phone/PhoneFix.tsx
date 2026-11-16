import { useEffect, useRef, useState } from 'react';
import { COMMENT_MAX, checksNoun, commentProblem } from '../../shared/fix-checks';
import { DEFAULT_AGENT, type OrcaDispatchRequest } from '../../shared/orca';
import { bot } from '../org-settings';
import { useFocusTrap } from '../useFocusTrap';
import { PhoneFitSheet, PhoneSheetBar, PhoneSheetError } from './PhoneFitSheet';

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
  /** Longest prompt the sheet accepts. */
  max?: number;
  busy: boolean;
  error: string | undefined;
  onDispatch: (v: Omit<OrcaDispatchRequest, 'repo' | 'number'>) => void;
  onCancel: () => void;
}

/** Agent and worktree name for a phone dispatch. The model is the one remembered for the agent. */
export function usePhoneDispatchFields(agents: readonly string[], initialName: string) {
  const [agent, setAgent] = useState(agents.includes(DEFAULT_AGENT) ? DEFAULT_AGENT : (agents[0] ?? DEFAULT_AGENT));
  const [name, setName] = useState(initialName);
  return { agent, setAgent, name, setName, nameOk: NAME_RE.test(name) };
}

/** Agent, Worktree name, and the locked Head branch with its note. */
export function PhoneDispatchFields({ d, agents, headRef, busy }: { d: ReturnType<typeof usePhoneDispatchFields>; agents: readonly string[]; headRef: string; busy: boolean }) {
  return (
    <>
      <label className="ph-fix-label" htmlFor="ph-fix-agent">
        Agent
      </label>
      <select id="ph-fix-agent" className="ph-fix-field ph-fit-select" value={d.agent} disabled={busy} onChange={(e) => d.setAgent(e.target.value)}>
        {agents.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <label className="ph-fix-label" htmlFor="ph-fix-name">
        Worktree name
      </label>
      <input
        id="ph-fix-name"
        className="ph-fix-field ph-fit-input ph-mono"
        value={d.name}
        readOnly={busy}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={!d.nameOk}
        onChange={(e) => d.setName(e.target.value)}
      />
      <label className="ph-fix-label" htmlFor="ph-fix-head">
        Head branch
      </label>
      <input id="ph-fix-head" className="ph-fix-field ph-fit-input ph-fix-locked ph-mono" value={headRef} readOnly />
      <p className="ph-fit-note ph-fit-note-up">Locked. The agent works on the PR head and pushes its fix there.</p>
    </>
  );
}

/** The Orca dispatch bottom sheet in PR mode: the head branch is locked. Fields lock while dispatching. */
export function PhoneFixDispatch(p: DispatchProps) {
  const max = p.max ?? COMMENT_MAX;
  const d = usePhoneDispatchFields(p.agents, p.name);
  const [prompt, setPrompt] = useState(p.prompt);

  const promptOk = prompt.trim() !== '' && prompt.length <= max;
  const failed = p.error !== undefined && !p.busy;

  return (
    <PhoneFitSheet
      title="Dispatch with Orca"
      sub={p.subject}
      busy={p.busy}
      onClose={p.onCancel}
      bar={
        <PhoneSheetBar
          busy={p.busy}
          primary={failed ? 'Retry' : 'Dispatch'}
          busyLabel="Dispatching..."
          disabled={!d.nameOk || !promptOk}
          onCancel={p.onCancel}
          onPrimary={() => p.onDispatch({ agent: d.agent, name: d.name, baseBranch: p.headRef, prompt, pr: true })}
        />
      }
    >
      <div className={`ph-fit-form is-tall${p.busy ? ' is-locked' : ''}`}>
        <PhoneDispatchFields d={d} agents={p.agents} headRef={p.headRef} busy={p.busy} />
        <label className="ph-fix-label" htmlFor="ph-fix-prompt">
          Prompt
        </label>
        <textarea
          id="ph-fix-prompt"
          className="ph-fix-field ph-mono ph-fit-area"
          value={prompt}
          readOnly={p.busy}
          aria-invalid={!promptOk}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="ph-fit-counter">
          <span>{p.busy ? 'Fields are locked while dispatching.' : 'Edit before dispatching.'}</span>
          <span className={prompt.length > max ? 'is-over' : undefined}>
            {prompt.length} / {max}
            {prompt.length > max ? ' too long' : ''}
          </span>
        </div>
        {failed ? <PhoneSheetError>{p.error}</PhoneSheetError> : null}
      </div>
    </PhoneFitSheet>
  );
}
