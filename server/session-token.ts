import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stateDir } from './devices';
import { newSessionToken } from './security';

const TOKEN_RE = /^[0-9a-f]{64}$/;

export function defaultSessionTokenPath(): string {
  return join(stateDir(), 'session-token');
}

/**
 * Reads the mutation token at `path`, or creates it when the file is missing
 * or malformed. A stable token keeps open pages working across restarts.
 */
export async function loadOrCreateSessionToken(path: string = defaultSessionTokenPath()): Promise<string> {
  try {
    const stored = (await readFile(path, 'utf8')).trim();
    if (TOKEN_RE.test(stored)) return stored;
  } catch {
    // missing or unreadable file: create a new token
  }
  const token = newSessionToken();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, token, { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, path);
  return token;
}
