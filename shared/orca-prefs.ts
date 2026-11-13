import { z } from 'zod';
import { effortLevel, modelId, type Effort } from './agent-models';

const MAX_CHOSEN = 500;
const MAX_REPOS = 200;
const MAX_AGENTS = 50;

const agentId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/);

/** Lower-case `owner/name`. A bare name saved before owners existed still loads and matches nothing. */
export const prefRepo = z.string().regex(/^(?:(?!\.{1,2}\/)[a-z0-9._-]{1,100}\/)?(?!\.{1,2}$)[a-z0-9._-]{1,100}$/);

export const OrcaPrefsSchema = z.object({
  /** Global switch for the automatic event messages. */
  enabled: z.boolean().default(true),
  /** Per-repo override. A repo that is absent follows `enabled`. */
  repos: z.record(prefRepo, z.enum(['on', 'off'])).default({}),
  /** The model and effort last dispatched with, per agent. An absent model is the harness default. */
  dispatch: z
    .record(agentId, z.object({ model: modelId.optional(), effort: effortLevel.optional() }))
    .default({}),
  /** The agent last dispatched with. */
  lastAgent: agentId.optional(),
  /** The session the user chose for a PR, by PR id. */
  chosen: z
    .record(
      z.string().min(1).max(200),
      z.object({ worktreeId: z.string().min(1).max(500), sessionId: z.string().min(1).max(600) }),
    )
    .default({}),
});

export type OrcaPrefs = z.infer<typeof OrcaPrefsSchema>;

export const DEFAULT_ORCA_PREFS: OrcaPrefs = OrcaPrefsSchema.parse({});

/** Reads a saved file. A missing, damaged or oversized value gives the defaults. */
export function parseOrcaPrefs(raw: unknown): OrcaPrefs {
  const parsed = OrcaPrefsSchema.safeParse(raw ?? {});
  if (!parsed.success) return DEFAULT_ORCA_PREFS;
  if (
    Object.keys(parsed.data.chosen).length > MAX_CHOSEN ||
    Object.keys(parsed.data.repos).length > MAX_REPOS ||
    Object.keys(parsed.data.dispatch).length > MAX_AGENTS
  ) {
    return DEFAULT_ORCA_PREFS;
  }
  return parsed.data;
}

export type RepoMode = 'default' | 'on' | 'off';

/** Whether automatic messages go out for a repo: its override when set, else the global switch. */
export function orcaEnabledFor(prefs: Pick<OrcaPrefs, 'enabled' | 'repos'>, repo: string): boolean {
  const o = prefs.repos[repo.toLowerCase()];
  return o === 'on' ? true : o === 'off' ? false : prefs.enabled;
}

export const prefsPatchBody = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ repo: prefRepo, mode: z.enum(['default', 'on', 'off']) }),
]);
export type PrefsPatch = z.infer<typeof prefsPatchBody>;

/** Applies one change and returns the new value. The input is never mutated. */
export function applyPrefsPatch(prefs: OrcaPrefs, patch: PrefsPatch): OrcaPrefs {
  if ('enabled' in patch) return { ...prefs, enabled: patch.enabled };
  const repos = { ...prefs.repos };
  if (patch.mode === 'default') delete repos[patch.repo];
  else repos[patch.repo] = patch.mode;
  return { ...prefs, repos };
}

export interface DispatchChoice {
  model?: string;
  effort?: Effort;
}

/** Remembers the agent and its model and effort. No model means the harness default. */
export function withDispatchChoice(prefs: OrcaPrefs, agent: string, choice: DispatchChoice): OrcaPrefs {
  const entry: DispatchChoice = {
    ...(choice.model ? { model: choice.model } : {}),
    ...(choice.model && choice.effort ? { effort: choice.effort } : {}),
  };
  return { ...prefs, lastAgent: agent, dispatch: { ...prefs.dispatch, [agent]: entry } };
}

export function withChosen(
  prefs: OrcaPrefs,
  prId: string,
  choice: { worktreeId: string; sessionId: string } | null,
): OrcaPrefs {
  const chosen = { ...prefs.chosen };
  if (choice) chosen[prId] = choice;
  else delete chosen[prId];
  return { ...prefs, chosen };
}
