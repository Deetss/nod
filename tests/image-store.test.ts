import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { ImageStore } from '../server/image-store';

describe('ImageStore', () => {
  test('serves a fresh entry without fetching again', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-images-'));
    try {
      const now = () => 1_000_000;
      const PNG = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
      const fetch = vi.fn().mockResolvedValue(PNG);
      const store = new ImageStore(dir, now);

      const result1 = await store.get('k', 1000, fetch);
      const result2 = await store.get('k', 1000, fetch);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(PNG);
      expect(result2).toEqual(PNG);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('survives a restart through disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-images-'));
    try {
      const now = () => 1_000_000;
      const PNG = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
      const fetch = vi.fn().mockResolvedValue(PNG);
      const storeA = new ImageStore(dir, now);

      await storeA.get('k', 1000, fetch);

      const storeB = new ImageStore(dir, now);
      const fetch2 = vi.fn().mockResolvedValue(PNG);
      const result = await storeB.get('k', 1000, fetch2);

      expect(fetch2).not.toHaveBeenCalled();
      expect(result).toEqual(PNG);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('refetches after max age', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-images-'));
    try {
      let t = 1_000_000;
      const now = () => t;
      const PNG = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
      const fetch = vi.fn().mockResolvedValue(PNG);
      const store = new ImageStore(dir, now);

      await store.get('k', 1000, fetch);

      t += 2000;
      const PNG2 = { bytes: new Uint8Array([9]), contentType: 'image/png' };
      fetch.mockResolvedValue(PNG2);
      const result = await store.get('k', 1000, fetch);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(PNG2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('serves stale bytes when the refetch fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-images-'));
    try {
      let t = 1_000_000;
      const now = () => t;
      const PNG = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
      const fetch = vi.fn().mockResolvedValue(PNG);
      const store = new ImageStore(dir, now);

      await store.get('k', 1000, fetch);

      t += 2000;
      fetch.mockRejectedValue(new Error('down'));
      const result = await store.get('k', 1000, fetch);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(PNG);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('throws when nothing is held and the fetch fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-images-'));
    try {
      const now = () => 1_000_000;
      const store = new ImageStore(dir, now);
      const fetch = vi.fn().mockRejectedValue(new Error('down'));

      await expect(store.get('k', 1000, fetch)).rejects.toThrow('down');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('null dir touches no disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nod-images-'));
    try {
      const now = () => 1_000_000;
      const PNG = { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' };
      const fetch = vi.fn().mockResolvedValue(PNG);
      const store = new ImageStore(null, now);

      const result = await store.get('k', 1000, fetch);
      expect(result).toEqual(PNG);
      expect(fetch).toHaveBeenCalledTimes(1);

      const result2 = await store.get('k', 1000, fetch);
      expect(result2).toEqual(PNG);
      expect(fetch).toHaveBeenCalledTimes(1);

      expect(await readdir(dir)).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});