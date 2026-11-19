import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FetchedImage } from '../shared/image-url';

const MAX_MEMORY_BYTES = 32 * 1024 * 1024;

/** Files untouched this long are removed the first time the store writes. */
const PRUNE_AFTER_MS = 30 * 24 * 60 * 60_000;

interface Entry {
  img: FetchedImage;
  /** When the bytes were fetched, in ms. */
  at: number;
}

interface Meta {
  contentType: string;
  at: number;
}

let counter = 0;

/**
 * Image bytes by key, in memory and on disk, so a restart or self-update does not fetch them
 * again. An entry older than the caller's max age is refetched. When that refetch fails the
 * old bytes are served, since an old image beats a broken one.
 */
export class ImageStore {
  private readonly memory = new Map<string, Entry>();
  private memoryBytes = 0;
  private pruned = false;

  constructor(
    /** With null, nothing touches disk. */
    private readonly dir: string | null = null,
    private readonly now: () => number = Date.now,
  ) {}

  async get(key: string, maxAgeMs: number, fetch: () => Promise<FetchedImage>): Promise<FetchedImage> {
    const held = this.memory.get(key) ?? (await this.readDisk(key));
    if (held && this.now() - held.at < maxAgeMs) {
      this.remember(key, held);
      return held.img;
    }
    let img: FetchedImage;
    try {
      img = await fetch();
    } catch (e) {
      if (held) return held.img;
      throw e;
    }
    const entry = { img, at: this.now() };
    this.remember(key, entry);
    await this.writeDisk(key, entry);
    return img;
  }

  private remember(key: string, entry: Entry): void {
    const old = this.memory.get(key);
    if (old) {
      this.memory.delete(key);
      this.memoryBytes -= old.img.bytes.byteLength;
    }
    this.memory.set(key, entry);
    this.memoryBytes += entry.img.bytes.byteLength;
    for (const [k, e] of this.memory) {
      if (this.memoryBytes <= MAX_MEMORY_BYTES) break;
      this.memory.delete(k);
      this.memoryBytes -= e.img.bytes.byteLength;
    }
  }

  private path(key: string): string | undefined {
    if (!this.dir) return undefined;
    return join(this.dir, createHash('sha256').update(key).digest('hex'));
  }

  private async readDisk(key: string): Promise<Entry | undefined> {
    const base = this.path(key);
    if (!base) return undefined;
    try {
      const meta = JSON.parse(await readFile(`${base}.json`, 'utf8')) as Meta;
      const bytes = new Uint8Array(await readFile(`${base}.bin`));
      return { img: { bytes, contentType: meta.contentType }, at: meta.at };
    } catch {
      return undefined;
    }
  }

  private async writeDisk(key: string, entry: Entry): Promise<void> {
    const base = this.path(key);
    if (!base || !this.dir) return;
    await this.prune(this.dir);
    const tmp = `.${process.pid}.${counter++}.tmp`;
    try {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      await writeFile(`${base}.bin${tmp}`, entry.img.bytes, { mode: 0o600 });
      await rename(`${base}.bin${tmp}`, `${base}.bin`);
      const meta: Meta = { contentType: entry.img.contentType, at: entry.at };
      await writeFile(`${base}.json${tmp}`, JSON.stringify(meta), { mode: 0o600 });
      await rename(`${base}.json${tmp}`, `${base}.json`);
    } catch {
      await rm(`${base}.bin${tmp}`, { force: true }).catch(() => undefined);
      await rm(`${base}.json${tmp}`, { force: true }).catch(() => undefined);
    }
  }

  /** Once per process, removes files untouched for 30 days, so the folder cannot grow forever. */
  private async prune(dir: string): Promise<void> {
    if (this.pruned) return;
    this.pruned = true;
    const names = await readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      names.map(async (n) => {
        const p = join(dir, n);
        const s = await stat(p).catch(() => undefined);
        if (s && this.now() - s.mtimeMs > PRUNE_AFTER_MS) await rm(p, { force: true }).catch(() => undefined);
      }),
    );
  }
}