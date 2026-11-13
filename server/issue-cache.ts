import type { IssueDetail, RepoMeta } from '../shared/issue-types';
import { DiskCache, fileKey } from './disk-cache';
import { EMPTY_ISSUE_STATE, type IssueState } from './issue-state';

export interface IssueDetailEntry {
  /** Schema version the detail was saved under; older entries are refetched. */
  v?: number;
  id: string;
  /** The issue's updatedAt when this detail was fetched. */
  updatedAt: string;
  detail: IssueDetail;
}

/** Repo labels, milestones and users stay fresh this long. */
export const META_TTL_MS = 60 * 60_000;

const STATE_FILE = 'issues.json';

/**
 * Issue list, detail keyed by issue id plus updatedAt, and repo metadata with a TTL.
 * Memory first, disk behind it. With a null-dir disk nothing touches the filesystem.
 */
export class IssueCache {
  private readonly details = new Map<string, IssueDetailEntry>();
  private readonly metas = new Map<string, RepoMeta>();

  constructor(private readonly disk: DiskCache = new DiskCache(null)) {}

  async loadState(): Promise<IssueState> {
    const raw = await this.disk.read<IssueState>(STATE_FILE);
    if (!raw || typeof raw.issues !== 'object') return { ...EMPTY_ISSUE_STATE };
    return { ...EMPTY_ISSUE_STATE, ...raw };
  }

  saveState(state: IssueState): Promise<void> {
    return this.disk.write(STATE_FILE, state);
  }

  private detailFile(key: string): string {
    return `issue-detail/${fileKey(key)}.json`;
  }

  async getDetail(key: string): Promise<IssueDetailEntry | undefined> {
    const hit = this.details.get(key);
    if (hit) return hit;
    const entry = await this.disk.read<IssueDetailEntry>(this.detailFile(key));
    if (entry) this.details.set(key, entry);
    return entry;
  }

  async putDetail(key: string, entry: IssueDetailEntry): Promise<void> {
    this.details.set(key, entry);
    await this.disk.write(this.detailFile(key), entry);
  }

  async invalidate(key: string): Promise<void> {
    this.details.delete(key);
    await this.disk.remove(this.detailFile(key));
  }

  async getMeta(repo: string, now: number): Promise<RepoMeta | undefined> {
    const mem = this.metas.get(repo);
    const meta = mem ?? (await this.disk.read<RepoMeta>(`repo-meta/${fileKey(repo)}.json`));
    if (!meta || now - meta.fetchedAt > META_TTL_MS) return undefined;
    this.metas.set(repo, meta);
    return meta;
  }

  async putMeta(meta: RepoMeta): Promise<void> {
    this.metas.set(meta.repo, meta);
    await this.disk.write(`repo-meta/${fileKey(meta.repo)}.json`, meta);
  }

  async invalidateMeta(repo: string): Promise<void> {
    this.metas.delete(repo);
    await this.disk.remove(`repo-meta/${fileKey(repo)}.json`);
  }

  /** Drop details of issues closed longer than the TTL. */
  async prune(keys: string[]): Promise<void> {
    for (const key of keys) await this.invalidate(key);
  }
}
