import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { generateVAPIDKeys } from 'web-push';
import { stateDir } from './app-paths';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export function defaultVapidPath(): string {
  return join(stateDir(), 'vapid.json');
}

function parse(raw: unknown): VapidKeys | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { publicKey, privateKey } = raw as Record<string, unknown>;
  if (typeof publicKey !== 'string' || typeof privateKey !== 'string' || !publicKey || !privateKey) return undefined;
  return { publicKey, privateKey };
}

/** Reads the key pair at `path`, or generates one and writes it with mode 600. The file is never logged. */
export async function loadOrCreateVapid(path: string = defaultVapidPath()): Promise<VapidKeys> {
  try {
    const keys = parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
    if (keys) {
      await chmod(path, 0o600);
      return keys;
    }
  } catch {
    // missing or unreadable file: generate a new pair
  }
  const keys = generateVAPIDKeys();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(keys), { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, path);
  return keys;
}
