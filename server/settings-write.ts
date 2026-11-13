import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseSettings, type Settings } from '../shared/settings';

export type SaveOutcome = { ok: true; settings: Settings } | { ok: false; status: 400 | 500; error: string };

/** True when the settings file exists. */
export async function settingsFileExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** The file's top-level object, or an empty one when it is missing, unreadable or not an object. */
async function readExisting(path: string): Promise<Record<string, unknown>> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Validates `body` against the settings schema and writes it to `path`: a temp file in the same
 * folder (mode 0600), then a rename, so a crash never leaves half a file. Keys the schema does
 * not know, such as the desktop app's `phoneAccess`, stay as they were. A legacy `org` is dropped,
 * since `orgs` replaces it.
 */
export async function saveSettings(path: string, body: unknown): Promise<SaveOutcome> {
  const parsed = parseSettings(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.message };
  const { org: _legacyOrg, ...kept } = await readExisting(path);
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(tmp, `${JSON.stringify({ ...kept, ...parsed.settings }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await rename(tmp, path);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => undefined);
    return { ok: false, status: 500, error: `Could not write the settings file (${(e as NodeJS.ErrnoException).code ?? 'error'})` };
  }
  return { ok: true, settings: parsed.settings };
}
