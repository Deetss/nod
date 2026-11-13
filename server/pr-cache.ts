import type { PrDetail } from '../shared/types';
import { DiskCache, fileKey } from './disk-cache';
import { EMPTY_STATE, type InboxState } from './inbox-state';
import type { Stored } from './github-client';

/** How the viewer's last review relates to the head, kept next to the detail. */
export interface ReviewBase {
  sha?: string;
  head: string;
  gone: boolean;
}

/** Bump when PrDetail gains a field, so older cached details are refetched. */
export const DETAIL_VERSION = 5;

export interface DetailEntry {
  /** Schema version the detail was saved under; absent on entries older than versioning. */
  v?: number;
  prKey: string;
  head: string;
  /** The PR's updatedAt when this detail was fetched. */
  updatedAt: string;
  detail: PrDetail;
  base: ReviewBase;
}

/** Cache key for a PR at one head commit: `owner/repo#n@headRefOid`. */
export const detailKey = (prKey: string, head: string): string => `${prKey}@${head}`;

const STATE_FILE = 'inbox.json';
const prefixOf = (prKey: string) => `${fileKey(prKey)}__`;

/**
 * PR detail keyed by head SHA, and diff or compare patches keyed by commit SHAs.
 * Patches are immutable, so a hit never refetches. Memory first, disk behind it.
 */
export class PrCache {
  private readonly details = new Map<string, DetailEntry>();
  private readonly patches = new Map<string, Stored<unknown>>();

  constructor(
    private readonly disk: DiskCache = new DiskCache(null),
  ) {}

  async loadState(): Promise<InboxState> {
    const raw = await this.disk.read<InboxState>(STATE_FILE);
    if (!raw || typeof raw.prs !== 'object') return { ...EMPTY_STATE };
    return { ...EMPTY_STATE, ...raw };
  }

  saveState(state: InboxState): Promise<void> {
    return this.disk.write(STATE_FILE, state);
  }

  private detailFile(prKey: string, head: string): string {
    return `detail/${prefixOf(prKey)}${fileKey(head)}.json`;
  }

  private patchFile(prKey: string, key: string): string {
    return `patch/${prefixOf(prKey)}${fileKey(key)}.json`;
  }

  async getDetail(prKey: string, head: string): Promise<DetailEntry | undefined> {
    const key = detailKey(prKey, head);
    const hit = this.details.get(key);
    if (hit) return hit;
    const entry = await this.disk.read<DetailEntry>(this.detailFile(prKey, head));
    if (!entry || entry.v !== DETAIL_VERSION) return undefined;
    this.details.set(key, entry);
    return entry;
  }

  async putDetail(input: DetailEntry): Promise<void> {
    const entry = { ...input, v: DETAIL_VERSION };
    this.details.set(detailKey(entry.prKey, entry.head), entry);
    await this.disk.write(this.detailFile(entry.prKey, entry.head), entry);
  }

  /** Writes a viewed flip into every cached detail of the PR. */
  async setViewed(prId: string, path: string, viewed: boolean): Promise<void> {
    for (const entry of this.details.values()) {
      if (entry.detail.summary.id !== prId) continue;
      const files = entry.detail.files.map((f) => (f.path === path ? { ...f, viewed } : f));
      await this.putDetail({ ...entry, detail: { ...entry.detail, files } });
    }
  }

  /** Forget a PR's details, for after an action that changes review state. */
  async invalidate(prKey: string): Promise<void> {
    const prefix = `${prKey}@`;
    for (const key of [...this.details.keys()]) if (key.startsWith(prefix)) this.details.delete(key);
    await this.disk.removePrefix('detail', prefixOf(prKey));
  }

  async getPatch<T>(prKey: string, key: string): Promise<Stored<T> | undefined> {
    const mem = this.patches.get(`${prKey}|${key}`);
    if (mem) return mem as Stored<T>;
    const hit = await this.disk.read<Stored<T>>(this.patchFile(prKey, key));
    if (hit) this.patches.set(`${prKey}|${key}`, hit);
    return hit;
  }

  async putPatch<T>(prKey: string, key: string, value: Stored<T>): Promise<void> {
    this.patches.set(`${prKey}|${key}`, value);
    await this.disk.write(this.patchFile(prKey, key), value);
  }

  /** Drop everything cached for PRs closed longer than the TTL. */
  async prune(prKeys: string[]): Promise<void> {
    for (const prKey of prKeys) {
      await this.invalidate(prKey);
      for (const key of [...this.patches.keys()]) {
        if (key.startsWith(`${prKey}|`)) this.patches.delete(key);
      }
      await this.disk.removePrefix('patch', prefixOf(prKey));
    }
  }
}
