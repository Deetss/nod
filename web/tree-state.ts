import type { FileItem } from '../shared/types';

export interface TreeFolder {
  /** Directory with a trailing slash, or '' for files at the repo root. */
  dir: string;
  files: FileItem[];
  viewed: number;
  allViewed: boolean;
}

/** A user's explicit choice for one folder. Absent means the automatic rule applies. */
export type FolderOverride = 'open' | 'closed';
export type FolderOverrides = Readonly<Record<string, FolderOverride>>;

/**
 * Group files by directory, in the order each directory first appears.
 * Root files come first: their group has no header, so placed after a folder
 * they would read as that folder's files.
 */
export function groupFolders(files: readonly FileItem[]): TreeFolder[] {
  const byDir = new Map<string, FileItem[]>();
  if (files.some((f) => !f.path.includes('/'))) byDir.set('', []);
  for (const f of files) {
    const i = f.path.lastIndexOf('/');
    const dir = i < 0 ? '' : f.path.slice(0, i + 1);
    const list = byDir.get(dir);
    if (list) list.push(f);
    else byDir.set(dir, [f]);
  }
  return [...byDir].map(([dir, list]) => {
    const viewed = list.filter((f) => f.viewed).length;
    return { dir, files: list, viewed, allViewed: viewed === list.length };
  });
}

/** Files in the order the Files tree shows them: root files first, then folders grouped. */
export function treeOrder<T extends FileItem>(files: readonly T[]): T[] {
  return groupFolders(files).flatMap((g) => g.files as T[]);
}

/** Sort `items` by their path's position in `order`. Paths missing from `order` go last, stably. */
export function sortByOrder<T extends { path: string }>(
  items: readonly T[],
  order: readonly { path: string }[],
): T[] {
  const rank = new Map(order.map((f, i) => [f.path, i]));
  const at = (x: T) => rank.get(x.path) ?? Number.MAX_SAFE_INTEGER;
  return [...items].sort((a, b) => at(a) - at(b));
}

/**
 * Collapsed state. An explicit choice wins. Otherwise a folder is collapsed
 * exactly when every file in it is viewed. The root folder never collapses.
 */
export function folderCollapsed(folder: TreeFolder, overrides: FolderOverrides): boolean {
  if (folder.dir === '') return false;
  const o = overrides[folder.dir];
  if (o) return o === 'closed';
  return folder.allViewed;
}

/** Click on a folder header: flip whatever is shown now and remember it. */
export function toggleFolder(folder: TreeFolder, overrides: FolderOverrides): FolderOverrides {
  const next: FolderOverride = folderCollapsed(folder, overrides) ? 'open' : 'closed';
  return { ...overrides, [folder.dir]: next };
}

/**
 * When a folder's fully-viewed state flips (its last file was viewed, or one was
 * unchecked), drop the explicit choice so the automatic rule takes over again.
 * `before` maps dir to its previous allViewed value. A manual expand of a fully
 * viewed folder is kept, because its allViewed value did not change.
 */
export function settleOverrides(
  overrides: FolderOverrides,
  before: ReadonlyMap<string, boolean>,
  folders: readonly TreeFolder[],
): FolderOverrides {
  let next: Record<string, FolderOverride> | undefined;
  for (const f of folders) {
    const prev = before.get(f.dir);
    if (prev === undefined || prev === f.allViewed || !(f.dir in overrides)) continue;
    next ??= { ...overrides };
    delete next[f.dir];
  }
  return next ?? overrides;
}

/** Overrides that open the folder holding `path` when it is collapsed. Unchanged otherwise. */
export function revealFile(files: FileItem[], path: string, overrides: FolderOverrides): FolderOverrides {
  const folder = groupFolders(files).find((f) => f.files.some((x) => x.path === path));
  if (!folder || !folderCollapsed(folder, overrides)) return overrides;
  return { ...overrides, [folder.dir]: 'open' };
}

const HIDE_KEY ='nod-hide-viewed';

/** Remembered "Hide viewed" toggle. Storage can be blocked, so failures mean shown. */
export function loadHideViewed(): boolean {
  try {
    return window.localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveHideViewed(on: boolean): void {
  try {
    window.localStorage.setItem(HIDE_KEY, on ? '1' : '0');
  } catch {
    // Not persisted; the toggle still works for this session.
  }
}
