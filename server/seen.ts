import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stateDir } from './app-paths';
import type { PrSummary, SeenState } from '../shared/types';
import type { IssueSummary } from '../shared/issue-types';
import type { IssueSeenMark, SeenMark } from './provider';

/** Issue marks carry a comment count instead of a head sha. */
type SeenMap = Record<string, SeenMark | IssueSeenMark>;

export function defaultSeenPath(): string {
  return join(stateDir(), 'seen.json');
}

/** PR id -> last seen updatedAt and head sha. Persists to disk unless path is null. */
export class SeenStore {
  private map: SeenMap = {};
  private loading: Promise<void> | undefined;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly path: string | null = defaultSeenPath()) {}

  private load(): Promise<void> {
    this.loading ??= this.read();
    return this.loading;
  }

  private async read(): Promise<void> {
    if (!this.path) return;
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      if (parsed && typeof parsed === 'object') this.map = parsed as SeenMap;
    } catch {
      this.map = {};
    }
  }

  async mark(mark: SeenMark | IssueSeenMark): Promise<void> {
    await this.load();
    this.map = { ...this.map, [mark.id]: mark };
    // Writes run one at a time and each saves the latest map, so a slow write cannot overwrite a newer one.
    this.writing = this.writing.catch(() => undefined).then(() => this.persist());
    await this.writing;
  }

  private async persist(): Promise<void> {
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.map), { mode: 0o600 });
    await rename(tmp, this.path);
  }

  /** Fill in seen and updatedNote on summaries. */
  async annotate(prs: PrSummary[]): Promise<PrSummary[]> {
    await this.load();
    return prs.map((pr) => {
      const prev = this.map[pr.id] as SeenMark | undefined;
      let seen: SeenState = 'seen';
      let updatedNote: string | undefined;
      if (!prev) seen = 'new';
      else if (prev.updatedAt !== pr.updatedAt || prev.headSha !== pr.headSha) {
        seen = 'updated';
        const added = pr.commitCount - prev.commitCount;
        updatedNote =
          added > 0
            ? `${added} commit${added === 1 ? '' : 's'} since you looked`
            : 'updated since you looked';
      }
      return { ...pr, seen, updatedNote };
    });
  }

  /** Fill in seen and updatedNote on issues, by updatedAt and comment count. */
  async annotateIssues(issues: IssueSummary[]): Promise<IssueSummary[]> {
    await this.load();
    return issues.map((issue) => {
      const prev = this.map[issue.id] as IssueSeenMark | undefined;
      if (!prev) return { ...issue, seen: 'new', updatedNote: undefined };
      if (prev.updatedAt === issue.updatedAt) return { ...issue, seen: 'seen', updatedNote: undefined };
      const added = issue.commentCount - (prev.commentCount ?? 0);
      const updatedNote =
        added > 0 ? `${added} new comment${added === 1 ? '' : 's'}` : 'updated since you looked';
      return { ...issue, seen: 'updated', updatedNote };
    });
  }

  /** Comment count at the last look, or undefined when never opened. */
  async seenCommentCount(id: string): Promise<number | undefined> {
    await this.load();
    return (this.map[id] as IssueSeenMark | undefined)?.commentCount;
  }
}
