import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PrDetail } from '../shared/types';
import { DiskCache } from '../server/disk-cache';
import { DETAIL_VERSION, PrCache, type DetailEntry } from '../server/pr-cache';

const ENTRY: DetailEntry = {
  prKey: 'acme-web#7',
  head: 'abc123',
  updatedAt: '2026-01-01T00:00:00Z',
  detail: { summary: { id: 'p1' }, files: [], thread: [] } as unknown as PrDetail,
  base: { head: 'abc123', gone: false },
};

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function tmpDisk(): Promise<DiskCache> {
  dir = await mkdtemp(join(tmpdir(), 'pr-cache-'));
  return new DiskCache(dir);
}

describe('PrCache detail schema version', () => {
  it('returns a detail saved under the current version', async () => {
    const disk = await tmpDisk();
    await new PrCache(disk).putDetail(ENTRY);
    const hit = await new PrCache(disk).getDetail(ENTRY.prKey, ENTRY.head);
    expect(hit?.v).toBe(DETAIL_VERSION);
  });

  it('treats an unversioned detail on disk as a miss', async () => {
    const disk = await tmpDisk();
    const writer = new PrCache(disk);
    await writer.putDetail(ENTRY);
    const file = `detail/${encodeURIComponent(ENTRY.prKey)}__${encodeURIComponent(ENTRY.head)}.json`;
    await disk.write(file, ENTRY);
    expect(await new PrCache(disk).getDetail(ENTRY.prKey, ENTRY.head)).toBeUndefined();
  });

  it('treats an older version on disk as a miss', async () => {
    const disk = await tmpDisk();
    const file = `detail/${encodeURIComponent(ENTRY.prKey)}__${encodeURIComponent(ENTRY.head)}.json`;
    await disk.write(file, { ...ENTRY, v: DETAIL_VERSION - 1 });
    expect(await new PrCache(disk).getDetail(ENTRY.prKey, ENTRY.head)).toBeUndefined();
  });
});
