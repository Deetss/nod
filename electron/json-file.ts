import { readFile, rename, writeFile } from 'node:fs/promises';

/** The parsed file, or undefined when it is missing or not valid JSON. */
export async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Writes atomically so a crash never leaves half a file. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value), 'utf8');
  await rename(tmp, path);
}
