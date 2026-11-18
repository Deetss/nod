import { randomBytes } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MESSAGE_TAG } from '../shared/orca-message';
import { SEND_MAX } from '../shared/orca-sessions';
import { stateDir } from './app-paths';

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Where long dispatch prompts are written for the agent to read. */
export const dispatchDir = (): string => join(stateDir(), 'dispatch');

/** The line typed into the session: the prompt's first line, cut to fit `SEND_MAX`, then where the rest is. */
export function briefLine(text: string, file: string): string {
  const first = (text.split('\n')[0] ?? '').trim();
  const tagged = first.startsWith(MESSAGE_TAG) ? first : `${MESSAGE_TAG} ${first}`;
  const tail = ` Read the full list in ${file}`;
  const room = SEND_MAX - tail.length;
  const head = tagged.length > room ? `${tagged.slice(0, Math.max(0, room - 3)).trimEnd()}...` : tagged;
  return `${head}${tail}`;
}

/** Writes the whole prompt to a new file (mode 600) after removing week-old ones, and returns the line to send. */
export async function writeBrief(text: string, dir: string = dispatchDir(), now: number = Date.now()): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await prune(dir, now);
  const file = join(dir, `${new Date(now).toISOString().slice(0, 10)}-${randomBytes(4).toString('hex')}.md`);
  await writeFile(file, text.endsWith('\n') ? text : `${text}\n`, { mode: 0o600 });
  return briefLine(text, file);
}

async function prune(dir: string, now: number): Promise<void> {
  for (const name of await readdir(dir)) {
    const path = join(dir, name);
    const info = await stat(path).catch(() => undefined);
    if (info && now - info.mtimeMs > KEEP_MS) await rm(path, { force: true });
  }
}
