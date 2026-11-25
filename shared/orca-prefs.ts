import { z } from 'zod';
import { effortLevel, modelId, type Effort } from './agent-models';
import { hostName, LOCAL_HOST } from './orca-hosts';

const MAX_CHOSEN = 500;
const MAX_REPOS = 200;
const MAX_AGENTS = 50;

const agentId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/);

/** Lower-case `owner/name`. A bare name saved before owners existed still loads and matches nothing. */
export const prefRepo = z.string().regex(/^(?:(?!\.{1,2}\/)[a-z0-9._-]{1,100}\/)?(?!\.{1,2}$)[a-z0-9._-]{1,100}$/);

/**
 * The session or worktree chosen for a PR, by the user or by a dispatch. Without a session id any
 * live agent in the worktree serves.
 */
export interface ChosenSession {
  host: string;
  worktreeId: string;
  sessionId?: string;
}

const worktreeIdPref = z.string().min(1).max(500);

/** A saved choice. Entries from before hosts existed (no host, or a bare worktree id) read as `local`. */
const chosenPref = z.union([
  z.object({ host: hostName.default(LOCAL_HOST), worktreeId: worktreeIdPref, sessionId: z.string().min(1).max(600).optional() }),
  worktreeIdPref.transform((worktreeId): ChosenSession => ({ host: LOCAL_HOST, worktreeId })),
]);

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
  chosen: z.record(z.string().min(1).max(200), chosenPref).default({}),
  /** The Orca host a new worktree goes to when a repo names none. Absent means `local`. */
  defaultHost: hostName.optional(),
  /** Per-repo Orca host for new worktrees. */
  hosts: z.record(prefRepo, hostName).default({}),
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
    Object.keys(parsed.data.hosts).length > MAX_REPOS ||
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

/** The host for a new worktree in a repo: its own host, else the default host, else `local`. */
export function hostFor(prefs: Pick<OrcaPrefs, 'defaultHost' | 'hosts'>, repo?: string): string {
  return (repo ? prefs.hosts[repo.toLowerCase()] : undefined) ?? prefs.defaultHost ?? LOCAL_HOST;
}

/** `null` clears a host choice. */
export const prefsPatchBody = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ repo: prefRepo, mode: z.enum(['default', 'on', 'off']) }),
  z.object({ defaultHost: hostName.nullable() }),
  z.object({ repo: prefRepo, host: hostName.nullable() }),
]);
export type PrefsPatch = z.infer<typeof prefsPatchBody>;

/** The host a patch names, so the route can check it is a live host. */
export const patchHost = (patch: PrefsPatch): string | null | undefined =>
  'defaultHost' in patch ? patch.defaultHost : 'host' in patch ? patch.host : undefined;

/** Applies one change and returns the new value. The input is never mutated. */
export function applyPrefsPatch(prefs: OrcaPrefs, patch: PrefsPatch): OrcaPrefs {
  if ('enabled' in patch) return { ...prefs, enabled: patch.enabled };
  if ('defaultHost' in patch) {
    const { defaultHost: _drop, ...rest } = prefs;
    return patch.defaultHost === null ? rest : { ...rest, defaultHost: patch.defaultHost };
  }
  if ('host' in patch) {
    const hosts = { ...prefs.hosts };
    if (patch.host === null) delete hosts[patch.repo];
    else hosts[patch.repo] = patch.host;
    return { ...prefs, hosts };
  }
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

export function withChosen(prefs: OrcaPrefs, prId: string, choice: ChosenSession | null): OrcaPrefs {
  const chosen = { ...prefs.chosen };
  if (choice) chosen[prId] = choice;
  else delete chosen[prId];
  return { ...prefs, chosen };
}
