import { DEFAULT_SETTINGS, statusNames, type BotSettings, type Settings } from '../shared/settings';

let current: Settings = DEFAULT_SETTINGS;

/** Called once before the first render, with what the server loaded from the settings file. */
export function setOrgSettings(s: Settings): void {
  current = s;
}

/** The settings the server loaded, for the settings dialog to start from. */
export const loadedSettings = (): Settings => current;

let firstRun = false;

/** True until `app-settings.json` exists. Called once before the first render. */
export function setFirstRun(value: boolean): void {
  firstRun = value;
}

export const isFirstRun = (): boolean => firstRun;

/** The configured GitHub orgs as one label, or "your repos" when none are set. */
export const orgLogin = (): string => (current.orgs.length ? current.orgs.join(', ') : 'your repos');

/** The first configured org's GitHub page, or github.com when none is set. */
export const orgUrl = (): string => `https://github.com/${current.orgs[0] ?? ''}`;

/** Status option names in board order. */
export const projectStatuses = (): string[] => statusNames(current);

/** The comment-driven bot. Its actions hide while `enabled` is false. */
export const bot = (): BotSettings => current.bot;

/** The configured name for one Status option. */
export const statusOption = (key: keyof Settings['project']['options']): string => current.project.options[key];
