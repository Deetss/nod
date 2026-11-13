import { useEffect, useMemo, useState } from 'react';
import { modelId, type Effort, type ModelOption, type OrcaModelsResponse } from '../../shared/agent-models';
import { api } from '../api';

/** The Model select's value for a typed id. */
const OTHER = '__other__';
const TYPED_EFFORTS: Effort[] = ['low', 'medium', 'high'];

let catalog: Promise<OrcaModelsResponse> | undefined;

/** The catalog and remembered choices, read once per page; a failed read is retried next time. */
export function useOrcaModels(): OrcaModelsResponse | undefined {
  const [data, setData] = useState<OrcaModelsResponse>();
  useEffect(() => {
    let live = true;
    catalog ??= api.orcaModels().catch((e: unknown) => {
      catalog = undefined;
      throw e;
    });
    catalog.then((d) => live && setData(d)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return data;
}

/** Forgets the cached catalog, so the next dialog reads the choice just saved. */
export function refreshOrcaModels(): void {
  catalog = undefined;
}

export interface ModelChoice {
  /** `''` is the harness default. */
  model: string;
  effort?: Effort;
  /** False while a typed id is not a valid model id. */
  valid: boolean;
}

interface Selection {
  sel: string;
  custom: string;
  effort: Effort | '';
}

function selectionFor(list: readonly ModelOption[], remembered: { model?: string; effort?: Effort } | undefined): Selection {
  const model = remembered?.model ?? '';
  const effort = remembered?.effort ?? '';
  if (model === '') return { sel: '', custom: '', effort: '' };
  return list.some((m) => m.id === model) ? { sel: model, custom: '', effort } : { sel: OTHER, custom: model, effort };
}

/** Model and Effort for one agent, starting from its remembered choice (docs/design/dispatch-model-spec.md). */
export function useModelChoice(agent: string, data: OrcaModelsResponse | undefined) {
  const list = useMemo(() => data?.models[agent] ?? [], [data, agent]);
  const [s, setS] = useState<Selection>({ sel: '', custom: '', effort: '' });

  // A new agent, or the catalog arriving, loads that agent's remembered choice.
  useEffect(() => setS(selectionFor(list, data?.remembered[agent])), [list, data, agent]);

  const typed = s.sel === OTHER;
  const model = typed ? s.custom.trim() : s.sel;
  const efforts = typed ? (model ? TYPED_EFFORTS : []) : (list.find((m) => m.id === s.sel)?.efforts ?? []);
  const effort = s.effort && efforts.includes(s.effort) ? s.effort : undefined;
  const choice: ModelChoice = {
    model,
    ...(model && effort ? { effort } : {}),
    valid: !typed || modelId.safeParse(model).success,
  };
  return { list, s, setS, typed, efforts, choice };
}

const groupOf = (id: string): string => (id.includes('/') ? id.slice(0, id.indexOf('/')) : '');

function Options({ list }: { list: readonly ModelOption[] }) {
  const groups = new Map<string, ModelOption[]>();
  for (const m of list) groups.set(groupOf(m.id), [...(groups.get(groupOf(m.id)) ?? []), m]);
  // Provider-prefixed ids (opencode) group by provider; plain ids stay a flat list.
  if (groups.size <= 1 || groups.has('')) {
    return (
      <>
        {list.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      {[...groups].map(([g, ms]) => (
        <optgroup key={g} label={g}>
          {ms.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id.slice(g.length + 1)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function noteFor(agent: string, list: readonly ModelOption[], typed: boolean, model: string): string {
  if (typed) return 'Typed ids pass to --model as written.';
  if (model === '') {
    return list.length === 0
      ? `${agent} lists no models here. Type an id with Other model id.`
      : `No flags: the harness picks. Remembered for ${agent}.`;
  }
  if (agent === 'codex') return 'From codex debug models. Remembered for codex.';
  if (agent === 'opencode') return 'From opencode models. Remembered for opencode.';
  return `Remembered for ${agent}, here and on the phone.`;
}

/** The Model and Effort row, the typed-id input, and the note. */
export function ModelFields({ agent, m }: { agent: string; m: ReturnType<typeof useModelChoice> }) {
  const { list, s, setS, typed, efforts, choice } = m;
  const effortOff = efforts.length === 0;
  return (
    <>
      <div className="dp-model-row">
        <div>
          <label className="field-label" htmlFor="dp-model">
            Model
          </label>
          <select
            id="dp-model"
            value={s.sel}
            onChange={(e) => setS((v) => ({ ...v, sel: e.target.value }))}
          >
            <option value="">Harness default</option>
            <Options list={list} />
            <option value={OTHER}>Other model id...</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="dp-effort">
            Effort
          </label>
          <select
            id="dp-effort"
            className={effortOff ? 'dp-effort-off' : undefined}
            value={effortOff ? '' : (choice.effort ?? '')}
            disabled={effortOff}
            onChange={(e) => setS((v) => ({ ...v, effort: e.target.value as Effort | '' }))}
          >
            <option value="">{effortOff ? (choice.model ? 'Default' : 'Pick a model') : 'Default'}</option>
            {efforts.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      {typed ? (
        <input
          className="mono dp-model-id"
          aria-label="Model id"
          value={s.custom}
          aria-invalid={!choice.valid}
          autoFocus
          placeholder="claude-sonnet-5-5"
          onChange={(e) => setS((v) => ({ ...v, custom: e.target.value }))}
        />
      ) : null}
      <span className="muted small">{noteFor(agent, list, typed, choice.model)}</span>
    </>
  );
}
