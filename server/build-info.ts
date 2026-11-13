import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILD_FILE, DEV_BUILD } from '../shared/build-update';

/** The build id of the front end in `distDir`, or the dev id when vite did not build it. */
export async function readBuildId(distDir: string): Promise<string> {
  try {
    const { build } = JSON.parse(await readFile(join(distDir, BUILD_FILE), 'utf8')) as { build?: unknown };
    return typeof build === 'string' && build ? build : DEV_BUILD;
  } catch {
    return DEV_BUILD;
  }
}
