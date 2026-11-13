import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../shared/settings';
import { configDir } from './app-paths';
import { appEnv } from './env';
import type { LogSink } from './request-log';

/** Settings file for browser and headless mode; the same file Electron uses on Linux. */
export function defaultSettingsPath(): string {
  return join(appEnv('SETTINGS_DIR') ?? configDir(), 'app-settings.json');
}

/** A legacy top-level `projectNumber` applies when `project.number` is not set. */
function withLegacyProjectNumber(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const obj = raw as { projectNumber?: unknown; project?: unknown };
  if (typeof obj.projectNumber !== 'number') return raw;
  const project = typeof obj.project === 'object' && obj.project !== null ? obj.project : {};
  if ('number' in project) return raw;
  return { ...obj, project: { ...project, number: obj.projectNumber } };
}

/**
 * Loads and validates the settings file. A missing file gives the defaults. An unreadable
 * or invalid file logs one line and also gives the defaults.
 */
export async function loadSettings(
  path: string = defaultSettingsPath(),
  log: LogSink = () => undefined,
): Promise<Settings> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      log(`[settings] cannot read ${path}; using defaults`);
    }
    return DEFAULT_SETTINGS;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    log(`[settings] ${path} is not valid JSON; using defaults`);
    return DEFAULT_SETTINGS;
  }
  const parsed = parseSettings(withLegacyProjectNumber(raw));
  if (!parsed.ok) {
    log(`[settings] ${path} invalid (${parsed.message}); using defaults`);
    return DEFAULT_SETTINGS;
  }
  return parsed.settings;
}
