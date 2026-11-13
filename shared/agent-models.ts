import { z } from 'zod';

/** Every effort level any harness accepts. A model lists the ones it supports. */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;
export type Effort = (typeof EFFORTS)[number];

/** A provider model id or alias, e.g. `sonnet`, `gpt-6-astra`, `openai/gpt-5.5`. */
export const modelId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/);
export const effortLevel = z.enum(EFFORTS);

export interface ModelOption {
  id: string;
  label: string;
  /** The levels `--effort` accepts with this model. Empty: no effort choice. */
  efforts: Effort[];
}

/** The models the dialog offers for each agent. An agent with none gets Harness default and a typed id. */
export type AgentModels = Record<string, ModelOption[]>;

/** `GET /api/orca/models`: the choices, and what was last dispatched with per agent. */
export interface OrcaModelsResponse {
  models: AgentModels;
  remembered: Record<string, { model?: string; effort?: Effort }>;
  lastAgent?: string;
}

/** What a dispatch launches, e.g. `claude · sonnet · default effort`. Labels come from the catalog. */
export function launchLine(agent: string, r: OrcaModelsResponse | undefined): string {
  const chosen = r?.remembered[agent];
  const model = chosen?.model
    ? (r?.models[agent]?.find((m) => m.id === chosen.model)?.label ?? chosen.model)
    : 'harness default';
  return `${agent} · ${model} · ${chosen?.effort ? `${chosen.effort} effort` : 'default effort'}`;
}

/** The agent a dialog-less dispatch uses: the one last dispatched with, when still offered. */
export function phoneAgent(agents: readonly string[], r: OrcaModelsResponse | undefined, fallback: string): string {
  const last = r?.lastAgent;
  if (last && agents.includes(last)) return last;
  return agents.includes(fallback) ? fallback : (agents[0] ?? fallback);
}

/** `claude --help` documents the aliases and `--effort` levels; it has no command that lists models. */
const CLAUDE_EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
export const CLAUDE_MODELS: ModelOption[] = [
  { id: 'fable', label: 'fable', efforts: CLAUDE_EFFORTS },
  { id: 'opus', label: 'opus', efforts: CLAUDE_EFFORTS },
  { id: 'sonnet', label: 'sonnet', efforts: CLAUDE_EFFORTS },
  { id: 'haiku', label: 'haiku', efforts: CLAUDE_EFFORTS },
];

/** `opencode models` prints one `provider/model` id per line. It reports no effort levels. */
export function parseOpencodeModels(raw: string): ModelOption[] {
  const ids = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('/') && modelId.safeParse(l).success);
  return [...new Set(ids)].slice(0, 500).map((id) => ({ id, label: id, efforts: [] }));
}

const isEffort =(v: unknown): v is Effort => typeof v === 'string' && (EFFORTS as readonly string[]).includes(v);

/** The listed models of `codex debug models`. Hidden models and unknown effort levels are dropped. */
export function parseCodexCatalog(raw: string): ModelOption[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const models = (data as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  const out: ModelOption[] = [];
  for (const m of models as Record<string, unknown>[]) {
    const id = m.slug;
    if (m.visibility !== 'list' || typeof id !== 'string' || !modelId.safeParse(id).success) continue;
    const levels = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels : [];
    const efforts = levels.map((l) => (l as { effort?: unknown }).effort).filter(isEffort);
    const label = typeof m.display_name === 'string' && m.display_name.length <= 60 ? m.display_name : id;
    out.push({ id, label, efforts });
  }
  return out;
}
