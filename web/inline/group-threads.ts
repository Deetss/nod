import type { DiffSide, PrThreadItem } from '../../shared/types';

export type ThreadItem = Extract<PrThreadItem, { kind: 'thread' }>;

/** A thread with the flags the diff and the review bar read. */
export interface GroupedThread {
  thread: ThreadItem;
  /** The viewer's draft, not yet submitted. */
  draft: boolean;
  resolved: boolean;
  outdated: boolean;
}

/** The threads at one line of one side. */
export interface LineThreads {
  line: number;
  side: DiffSide;
  /** Oldest first. */
  threads: GroupedThread[];
}

/** The threads of one file. `fileLevel` holds the threads that sit on the file, not on a line. */
export interface FileThreads {
  path: string;
  fileLevel: GroupedThread[];
  /** Ordered by line, then LEFT before RIGHT. */
  lines: LineThreads[];
}

const byTime = (a: GroupedThread, b: GroupedThread) => a.thread.at.localeCompare(b.thread.at);

function toGrouped(thread: ThreadItem): GroupedThread {
  return {
    thread,
    draft: thread.pending === true,
    resolved: thread.resolved,
    outdated: thread.isOutdated === true,
  };
}

/**
 * Groups the detail payload's threads by file path, then by line and side. A thread with no line
 * is file-level. Older cached threads without a side are read as RIGHT. Files are ordered by path.
 */
export function groupThreads(items: readonly PrThreadItem[] | undefined): FileThreads[] {
  const files = new Map<string, { fileLevel: GroupedThread[]; lines: Map<string, LineThreads> }>();
  for (const item of items ?? []) {
    if (item.kind !== 'thread') continue;
    let file = files.get(item.path);
    if (!file) {
      file = { fileLevel: [], lines: new Map() };
      files.set(item.path, file);
    }
    const grouped = toGrouped(item);
    if (item.line === undefined) {
      file.fileLevel.push(grouped);
      continue;
    }
    const side: DiffSide = item.side ?? 'RIGHT';
    const key = `${item.line}|${side}`;
    let at = file.lines.get(key);
    if (!at) {
      at = { line: item.line, side, threads: [] };
      file.lines.set(key, at);
    }
    at.threads.push(grouped);
  }
  return [...files.keys()].sort().map((path) => {
    const file = files.get(path)!;
    const lines = [...file.lines.values()]
      .map((l) => ({ ...l, threads: [...l.threads].sort(byTime) }))
      .sort((a, b) => a.line - b.line || (a.side === b.side ? 0 : a.side === 'LEFT' ? -1 : 1));
    return { path, fileLevel: [...file.fileLevel].sort(byTime), lines };
  });
}

/** The line numbers (either side) that carry a thread in `path`. Empty when the file has none. */
export function threadLines(files: readonly FileThreads[], path: string): Set<number> {
  const file = files.find((f) => f.path === path);
  return new Set(file?.lines.map((l) => l.line) ?? []);
}
