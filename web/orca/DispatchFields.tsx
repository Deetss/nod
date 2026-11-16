import { useEffect, useRef, useState } from 'react';
import { DEFAULT_AGENT, type OrcaDispatchRequest } from '../../shared/orca';
import { ModelFields, refreshOrcaModels, useModelChoice, useOrcaModels } from './ModelFields';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,60}$/;

/** Agent, model and worktree name for an Orca dispatch, starting on the agent last dispatched with. */
export function useDispatchFields(agents: readonly string[], initialName: string) {
  const [agent, setAgentRaw] = useState(agents.includes(DEFAULT_AGENT) ? DEFAULT_AGENT : (agents[0] ?? DEFAULT_AGENT));
  const models = useOrcaModels();
  const agentTouched = useRef(false);
  useEffect(() => {
    const last = models?.lastAgent;
    if (last && !agentTouched.current && agents.includes(last)) setAgentRaw(last);
  }, [models?.lastAgent, agents]);
  const m = useModelChoice(agent, models);
  const [name, setName] = useState(initialName);
  const nameOk = NAME_RE.test(name);
  const setAgent = (a: string): void => {
    agentTouched.current = true;
    setAgentRaw(a);
  };
  /** The request fields beside the branch and prompt. Forgets the cached catalog so the next dialog reads this choice. */
  const request = (): Pick<OrcaDispatchRequest, 'agent' | 'name' | 'model' | 'effort'> => {
    refreshOrcaModels();
    return { agent, name, model: m.choice.model, ...(m.choice.effort ? { effort: m.choice.effort } : {}) };
  };
  return { agent, setAgent, m, name, setName, nameOk, valid: nameOk && m.choice.valid, request };
}

export type DispatchFieldsState = ReturnType<typeof useDispatchFields>;

interface Props {
  f: DispatchFieldsState;
  agents: readonly string[];
  /** Agent and Worktree name side by side above Model, as in Dispatch all. */
  paired?: boolean;
  disabled?: boolean;
}

/** The Agent select, Model and Effort, and the Worktree name input of the dispatch dialogs. */
export function DispatchFields({ f, agents, paired, disabled }: Props) {
  const agent = (
    <>
      <label className="field-label" htmlFor="dp-agent">
        Agent
      </label>
      <select id="dp-agent" value={f.agent} disabled={disabled} onChange={(e) => f.setAgent(e.target.value)}>
        {agents.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </>
  );
  const name = (
    <>
      <label className="field-label" htmlFor="dp-name">
        Worktree name
      </label>
      <input id="dp-name" className={paired ? 'mono' : undefined} value={f.name} readOnly={disabled} aria-invalid={!f.nameOk} onChange={(e) => f.setName(e.target.value)} />
    </>
  );
  const nameNote = f.nameOk ? null : <span className="muted small">Lower-case letters, digits and dashes, up to 61 characters.</span>;
  if (!paired) {
    return (
      <>
        {agent}
        <ModelFields agent={f.agent} m={f.m} />
        {name}
        {nameNote}
      </>
    );
  }
  return (
    <>
      <div className="dp-model-row">
        <div>{agent}</div>
        <div>{name}</div>
      </div>
      {nameNote}
      <ModelFields agent={f.agent} m={f.m} />
    </>
  );
}
