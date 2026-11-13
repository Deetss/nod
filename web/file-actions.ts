import type { DiffFile } from '../shared/types';

/** What the file menu needs to know about the PR (docs/design/file-actions-spec.md). */
export interface FileHead {
  prUrl: string;
  headRef: string;
  baseRef: string;
  state: 'open' | 'merged' | 'closed';
  fork: boolean;
}

export type FileActionKind = 'view' | 'edit' | 'delete';

export interface FileAction {
  kind: FileActionKind;
  title: string;
  sub: string;
  /** Absent when the action is off; `sub` then says why. */
  url?: string;
  danger?: boolean;
}

/** Deleted in this PR: no additions, and the first hunk leaves no lines on the new side. */
export function isDeleted(f: DiffFile): boolean {
  return f.additions === 0 && /\+0,0 @@/.test(f.hunks[0]?.header ?? '');
}

/** No patch and no line counts: GitHub treats it as binary. A large text file keeps its counts. */
export function isBinary(f: DiffFile): boolean {
  return f.noPatch === true && f.additions === 0 && f.deletions === 0;
}

const segments = (s: string): string => s.split('/').map(encodeURIComponent).join('/');

/** `https://github.com/<owner>/<repo>` from a PR URL, or undefined when it is not one. */
export function repoUrl(prUrl: string): string | undefined {
  const m = /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/pull\/\d+/.exec(prUrl);
  return m?.[1];
}

/** Why the branch cannot take an edit or a delete, or undefined when it can. */
function branchOff(h: FileHead): string | undefined {
  if (h.state === 'merged') return 'PR merged: its branch may be gone';
  if (h.state === 'closed') return 'PR closed: its branch may be gone';
  if (h.fork) return 'The branch is on a fork';
  return undefined;
}

/** The three menu rows for one file, in order. */
export function fileActions(h: FileHead, f: DiffFile): FileAction[] {
  const repo = repoUrl(h.prUrl);
  const deleted = isDeleted(f);
  const at = (verb: string, ref: string) => (repo ? `${repo}/${verb}/${segments(ref)}/${segments(f.path)}` : undefined);

  const view: FileAction = deleted
    ? { kind: 'view', title: 'View file', sub: `Before this PR, on ${h.baseRef}`, ...withUrl(at('blob', h.baseRef)) }
    : { kind: 'view', title: 'View file', sub: `On ${h.headRef}`, ...withUrl(at('blob', h.headRef)) };

  const blocked = branchOff(h) ?? (deleted ? 'Deleted in this PR' : undefined);
  const editOff = blocked ?? (isBinary(f) ? 'GitHub cannot edit a binary file' : undefined);
  const edit: FileAction = editOff
    ? { kind: 'edit', title: 'Edit file', sub: editOff }
    : { kind: 'edit', title: 'Edit file', sub: "GitHub's editor, commits to the branch", ...withUrl(at('edit', h.headRef)) };
  const del: FileAction = blocked
    ? { kind: 'delete', title: 'Delete file', sub: blocked, danger: true }
    : { kind: 'delete', title: 'Delete file', sub: 'GitHub asks you to commit it', danger: true, ...withUrl(at('delete', h.headRef)) };
  return [view, edit, del];
}

function withUrl(url: string | undefined): { url?: string } {
  return url ? { url } : {};
}
