import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cacheDir as defaultCacheDir } from './app-paths';

export { cacheDir as defaultCacheDir } from './app-paths';

/** File-name safe form of a cache key. */
export const fileKey = (key: string): string => encodeURIComponent(key);

let counter = 0;

/**
 * JSON files under one directory, written atomically (temp file then rename).
 * With a null dir every call is a no-op, so tests and fixtures touch no disk.
 * It holds PR metadata and patches only, never the token.
 */
export class DiskCache {
  constructor(readonly dir: string | null = defaultCacheDir()) {}

  async read<T>(rel: string): Promise<T | undefined> {
    if (!this.dir) return undefined;
    try {
      return JSON.parse(await readFile(join(this.dir, rel), 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  async write(rel: string, value: unknown): Promise<void> {
    if (!this.dir) return;
    const path = join(this.dir, rel);
    const tmp = `${path}.${process.pid}.${counter++}.tmp`;
    try {
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
      await rename(tmp, path);
    } catch {
      await rm(tmp, { force: true }).catch(() => undefined);
    }
  }

  async remove(rel: string): Promise<void> {
    if (!this.dir) return;
    await rm(join(this.dir, rel), { force: true }).catch(() => undefined);
  }

  /** Remove every file in `sub` whose name starts with `prefix`. */
  async removePrefix(sub: string, prefix: string): Promise<void> {
    if (!this.dir) return;
    const names = await readdir(join(this.dir, sub)).catch(() => [] as string[]);
    await Promise.all(
      names.filter((n) => n.startsWith(prefix)).map((n) => this.remove(join(sub, n))),
    );
  }
}
