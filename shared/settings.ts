import { z } from 'zod';

/** A GitHub owner login: a user or an org. */
const ownerLogin = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, 'Invalid GitHub login');

const statusName = z.string().trim().min(1).max(60);

export const SettingsSchema = z.object({
  orgs: z.array(ownerLogin).default([]),
  releaseMerge: z
    .object({
      base: z.string().min(1).default('main'),
      head: z.string().min(1).default('staging'),
      titleContains: z.string().min(1).default('release staging to main'),
    })
    .default({ base: 'main', head: 'staging', titleContains: 'release staging to main' }),
  project: z
    .object({
      number: z.number().int().positive().default(1),
      statusField: z.string().min(1).default('Status'),
      options: z
        .object({
          backlog: statusName.default('Backlog'),
          ready: statusName.default('Ready'),
          inProgress: statusName.default('In progress'),
          inReview: statusName.default('In review'),
          done: statusName.default('Done'),
        })
        .refine((o) => new Set(Object.values(o)).size === Object.values(o).length, 'Status option names must differ')
        .default({ backlog: 'Backlog', ready: 'Ready', inProgress: 'In progress', inReview: 'In review', done: 'Done' }),
    })
    .default({
      number: 1,
      statusField: 'Status',
      options: { backlog: 'Backlog', ready: 'Ready', inProgress: 'In progress', inReview: 'In review', done: 'Done' },
    }),
  orcaAgents: z
    .array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/))
    .min(1)
    .refine((v) => new Set(v).size === v.length, 'Duplicate agent id')
    .default(['claude', 'codex', 'gemini', 'opencode']),
  /**
   * A comment-driven bot (a GitHub Action or app) that fixes checks and review comments when a PR
   * comment starts with `command`, and picks up issues that carry `label`. Off until configured.
   */
  bot: z
    .object({
      enabled: z.boolean().default(false),
      name: z.string().trim().min(1).max(30).default('Bot'),
      command: z
        .string()
        .regex(/^\/[a-z0-9][a-z0-9-]{0,30}$/, 'Command must be a slash and a lowercase word, like /fixbot')
        .default('/bot'),
      label: z.string().trim().min(1).max(50).default('bot'),
      labelColor: z
        .string()
        .regex(/^[0-9a-f]{6}$/i, 'Label colour must be 6 hex digits')
        .default('1f6feb'),
      /** The bot's GitHub login as GraphQL names it, without `[bot]`. Empty: no one is the bot, so its retry and split stay hidden. */
      login: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9-]{0,39}$/, 'Login must be a GitHub login')
        .default(''),
      /** The word in the bot's `<!-- {marker}:retry -->` and `<!-- {marker}:split ... -->` comments. */
      marker: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{0,30}$/, 'Marker must be lowercase letters, digits or dashes')
        .default('bot'),
    })
    .default({ enabled: false, name: 'Bot', command: '/bot', label: 'bot', labelColor: '1f6feb', login: '', marker: 'bot' }),
  /** Web Push contact (VAPID subject): a mailto: or https: URL push services can reach. */
  push: z
    .object({
      contact: z
        .string()
        .regex(/^(mailto:\S+@\S+|https:\/\/\S+)$/, 'Push contact must be a mailto: or https: URL')
        .default('mailto:admin@example.com'),
    })
    .default({ contact: 'mailto:admin@example.com' }),
  /** The Android app's package ID: the APK's applicationId and the asset-links target. */
  android: z
    .object({
      packageId: z
        .string()
        .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'Package ID must look like org.example.reviewinbox')
        .default('io.github.reviewinbox'),
    })
    .default({ packageId: 'io.github.reviewinbox' }),
});

export type BotSettings = Settings['bot'];

export type Settings = z.infer<typeof SettingsSchema>;
export type StatusOptionKey = keyof Settings['project']['options'];

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

/** Ordered status keys, matching the board's column order. */
export const STATUS_KEYS: readonly StatusOptionKey[] = ['backlog', 'ready', 'inProgress', 'inReview', 'done'];

/**
 * Parses a raw settings object. Returns the parsed settings, or undefined with the
 * first problem as a message when the file is not valid.
 */
export function parseSettings(raw: unknown): { ok: true; settings: Settings } | { ok: false; message: string } {
  const result = SettingsSchema.safeParse(migrateOrg(raw ?? {}));
  if (result.success) return { ok: true, settings: result.data };
  const issue = result.error.issues[0];
  const where = issue?.path.join('.') || 'settings';
  return { ok: false, message: `${where}: ${issue?.message ?? 'invalid'}` };
}

/** A legacy `org: "x"` loads as `orgs: ["x"]`, unless `orgs` is already set. */
function migrateOrg(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || !('org' in raw)) return raw;
  const { org, ...rest } = raw as Record<string, unknown>;
  if (rest.orgs !== undefined || org === undefined || org === '') return rest;
  return { ...rest, orgs: [org] };
}

/** Status names in board order, for the option list and for matching GitHub option names. */
export function statusNames(s: Settings): string[] {
  return STATUS_KEYS.map((k) => s.project.options[k]);
}

/** True when the release rule applies: right base and head, and the title contains the marker. */
export function isReleaseTitle(s: Settings, title: string, base: string, head: string): boolean {
  return (
    base === s.releaseMerge.base &&
    head === s.releaseMerge.head &&
    title.toLowerCase().includes(s.releaseMerge.titleContains.toLowerCase())
  );
}
