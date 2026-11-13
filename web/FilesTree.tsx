import { useEffect, useRef, useState } from 'react';
import type { FileItem } from '../shared/types';
import { Chevron } from './ui';
import type { FileTarget } from './goto-file';
import {
  folderCollapsed,
  groupFolders,
  revealFile,
  settleOverrides,
  toggleFolder,
  type FolderOverrides,
} from './tree-state';

interface FilesTreeProps {
  files: FileItem[];
  currentPath: string | undefined;
  hideViewed: boolean;
  /** Changes when the viewer opens another PR; folder choices reset then. */
  resetKey: string | undefined;
  /** The latest file navigation request; its folder is expanded. */
  reveal: FileTarget | undefined;
  onToggleViewed: (path: string, viewed: boolean) => void;
  onOpenFile: (path: string) => void;
}

export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf('/');
  return i < 0 ? { dir: '', name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) };
}

export function FilesTree({
  files,
  currentPath,
  hideViewed,
  resetKey,
  reveal,
  onToggleViewed,
  onOpenFile,
}: FilesTreeProps) {
  // Explicit folder choices, kept for this PR only. A PR change resets them.
  const [overrides, setOverrides] = useState<FolderOverrides>({});
  const folders = groupFolders(files);
  const lastFolders = useRef<Map<string, boolean>>(new Map());

  // The row that last took focus is the tab stop; with none, the current file, then the first row.
  const [focusPath, setFocusPath] = useState<string>();
  const tree = useRef<HTMLDivElement>(null);
  const shown = folders.flatMap((folder) =>
    (hideViewed && folder.allViewed) || folderCollapsed(folder, overrides)
      ? []
      : (hideViewed ? folder.files.filter((f) => !f.viewed) : folder.files),
  );
  const tabPath = [focusPath, currentPath].find((p) => shown.some((f) => f.path === p)) ?? shown[0]?.path;

  const onRowKey = (e: React.KeyboardEvent<HTMLDivElement>, f: FileItem) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') onOpenFile(f.path);
    else if (e.key === ' ') onToggleViewed(f.path, !f.viewed);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const rows = [...(tree.current?.querySelectorAll<HTMLElement>('.tree-file') ?? [])];
      const at = rows.indexOf(e.currentTarget);
      rows[at + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
    } else return;
    // Keep the window hotkeys (Enter opens the PR) out of it.
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => setOverrides({}), [resetKey]);

  // A navigation request (click, [ or ]) opens the folder holding its file.
  useEffect(() => {
    if (reveal) setOverrides((o) => revealFile(files, reveal.path, o));
  }, [reveal]);

  // A folder whose fully-viewed state flips drops its explicit choice, so the auto rule applies.
  useEffect(() => {
    setOverrides((o) => settleOverrides(o, lastFolders.current, folders));
    lastFolders.current = new Map(folders.map((f) => [f.dir, f.allViewed]));
  }, [files]);
  return (
    <div className="tree" role="tree" ref={tree}>
      {folders.map((folder) => {
        const collapsed = folderCollapsed(folder, overrides);
        const visible = hideViewed ? folder.files.filter((f) => !f.viewed) : folder.files;
        if (hideViewed && folder.allViewed) return null;
        return (
          <div key={folder.dir || '/'}>
            {folder.dir !== '' ? (
              <button
                type="button"
                className="tree-dir mono"
                aria-expanded={!collapsed}
                onClick={() => setOverrides((o) => toggleFolder(folder, o))}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' && !collapsed) setOverrides((o) => toggleFolder(folder, o));
                  if (e.key === 'ArrowRight' && collapsed) setOverrides((o) => toggleFolder(folder, o));
                }}
              >
                <Chevron open={!collapsed} size={14} />
                <span className="ellipsis">{folder.dir}</span>
                <span className="tree-dir-count">
                  {folder.viewed}/{folder.files.length}
                </span>
              </button>
            ) : null}
            {collapsed ? null : visible.map((f) => {
              const { name } = splitPath(f.path);
              return (
                <div
                  key={f.path}
                  role="treeitem"
                  tabIndex={f.path === tabPath ? 0 : -1}
                  aria-selected={f.path === currentPath}
                  onFocus={(e) => e.target === e.currentTarget && setFocusPath(f.path)}
                  onKeyDown={(e) => onRowKey(e, f)}
                  className={`tree-file${f.viewed ? '' : ' is-unviewed'}${f.path === currentPath ? ' is-current' : ''}`}
                  onClick={() => onOpenFile(f.path)}
                >
                  <input
                    type="checkbox"
                    checked={f.viewed}
                    aria-label={`Viewed ${f.path}`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onToggleViewed(f.path, e.target.checked)}
                  />
                  <span className="tree-name ellipsis" title={f.path}>
                    {name}
                  </span>
                  <span className="tree-delta" title="Changed since your last review">
                    {f.changedSinceReview ? 'Δ' : ''}
                  </span>
                  <span className="tree-stats">
                    <span className="add">+{f.additions}</span> <span className="del">-{f.deletions}</span>
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
