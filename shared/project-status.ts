import { DEFAULT_SETTINGS, statusNames } from './settings';

/** A Status option name from the settings, so any string the project defines. */
export type ProjectStatus = string;

/** The default option names, in board order. Server code uses `statusNames(settings)`. */
export const PROJECT_STATUSES: readonly ProjectStatus[] = statusNames(DEFAULT_SETTINGS);

/** CSS class suffix, e.g. "In progress" becomes "in-progress". */
export const statusSlug = (s: ProjectStatus): string => s.toLowerCase().replace(/ /g, '-');

export const isProjectStatus = (v: unknown, names: readonly string[] = PROJECT_STATUSES): v is ProjectStatus =>
  typeof v === 'string' && names.includes(v);
