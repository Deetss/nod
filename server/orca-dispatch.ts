import { z } from 'zod';
import { effortLevel, modelId } from '../shared/agent-models';
import { hostName } from '../shared/orca-hosts';
import { DEFAULT_SETTINGS } from '../shared/settings';
import { REPO_RE } from './provider';

/** The dispatch request schema; `agents` is the allowed agent ids. Orca rejects ids it does not know. */
export const dispatchBodyFor = (agents: readonly string[]) => z.object({
  repo: z.string().regex(REPO_RE),
  number: z.number().int().positive(),
  agent: z.string().refine((a) => agents.includes(a), 'Unknown agent'),
  name: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),
  baseBranch: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/)
    .refine((v) => !v.includes('..') && !v.endsWith('/'), 'Invalid branch name')
    .optional(),
  // A leading dash could be read as a CLI flag.
  prompt: z.string().min(1).max(12000).refine((v) => !v.trimStart().startsWith('-'), 'Prompt must not start with a dash'),
  /** PR mode: `number` is a PR and `baseBranch` is its head ref. */
  pr: z.boolean().optional(),
  /** The Orca host to create the worktree on. Absent: the repo's host, the default host, then `local`. */
  host: hostName.optional(),
  /** `''` is the harness default. Absent (a phone dispatch) means the model last chosen for the agent. */
  model: z.union([z.literal(''), modelId]).optional(),
  effort: effortLevel.optional(),
})
  .refine((b) => !b.pr || b.baseBranch !== undefined, { message: 'PR mode needs the head branch', path: ['baseBranch'] })
  .refine((b) => !b.effort || !!b.model, { message: 'Effort needs a model', path: ['effort'] });

/** The schema with the default agent list. */
export const dispatchBody = dispatchBodyFor(DEFAULT_SETTINGS.orcaAgents);
export type DispatchBody = z.infer<typeof dispatchBody>;

export type DispatchResult = { ok: true; worktree: string; path?: string } | { ok: false; message: string };

const WRAP_UP_MARK = '## When you finish (Nod)';

/**
 * Closes every dispatched prompt, so a finished session files itself instead of lingering in
 * Orca's sidebar. Only a session with a real question stays unread.
 */
export const WRAP_UP = [
  WRAP_UP_MARK,
  'Leave this workspace tidy so it does not wait on the user for nothing.',
  '- If nothing needs the user: save a session log and compact if your harness can (Claude Code: /compress), then run',
  '  `orca-ide worktree set --worktree current --workspace-status <status> --read --comment "<one-line outcome>"`',
  '  with status `in-review` when a PR now waits for review, otherwise `completed`. Then stop.',
  '- If something needs the user: run `orca-ide worktree set --worktree current --unread --comment "<the decision or blocker>"`,',
  '  end your reply with that one question, and wait.',
  '- Never remove the worktree or close terminals. The user does that.',
].join('\n');

/** The prompt with the wrap-up appended once. A prompt that already carries it, as on a retry, is left alone. */
export const withWrapUp = (prompt: string): string =>
  prompt.includes(WRAP_UP_MARK) ? prompt : `${prompt.trimEnd()}\n\n${WRAP_UP}`;

/** `--model` and `--effort`, or nothing for the harness default. Orca rejects `--effort` without `--model`. */
function modelArgs(b: DispatchBody): string[] {
  if (!b.model) return [];
  return ['--model', b.model, ...(b.effort ? ['--effort', b.effort] : [])];
}

/** `orca-ide worktree create` arguments. Every value is its own array entry. The prompt gets the wrap-up. */
export function dispatchArgs(repoId: string, b: DispatchBody): string[] {
  // PR mode starts on the PR head; `--issue` is never passed with `--pr`. The
  // head ref usually exists only on the remote, and git cannot base a worktree
  // on a bare remote-only name, so the base is `origin/<headRef>`.
  if (b.pr) {
    return [
      'worktree',
      'create',
      '--repo',
      `id:${repoId}`,
      '--name',
      b.name,
      '--pr',
      String(b.number),
      '--base-branch',
      `origin/${b.baseBranch ?? ''}`,
      '--agent',
      b.agent,
      '--prompt',
      withWrapUp(b.prompt),
      ...modelArgs(b),
      '--no-parent',
      '--json',
    ];
  }
  const args = [
    'worktree',
    'create',
    '--repo',
    `id:${repoId}`,
    '--name',
    b.name,
    '--issue',
    String(b.number),
    '--agent',
    b.agent,
    '--prompt',
    withWrapUp(b.prompt),
    ...modelArgs(b),
  ];
  if (b.baseBranch) args.push('--base-branch', b.baseBranch);
  args.push('--no-parent', '--json');
  return args;
}

/** Pulls the worktree name and path out of the CLI's JSON; falls back to the requested name. */
export function parseCreated(stdout: string, fallback: string): { worktree: string; path?: string } {
  try {
    const parsed = JSON.parse(stdout) as { result?: unknown };
    const result = (parsed.result ?? parsed) as Record<string, unknown>;
    const wt = (typeof result.worktree === 'object' && result.worktree !== null ? result.worktree : result) as Record<
      string,
      unknown
    >;
    const worktree = [wt.displayName, wt.name, wt.branch].find((v): v is string => typeof v === 'string' && v !== '');
    const path = typeof wt.path === 'string' ? wt.path : undefined;
    return { worktree: worktree ?? fallback, ...(path ? { path } : {}) };
  } catch {
    return { worktree: fallback };
  }
}
