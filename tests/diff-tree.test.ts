import { describe, expect, it } from 'vitest';
import {
  folderCollapsed,
  groupFolders,
  settleOverrides,
  sortByOrder,
  toggleFolder,
  treeOrder,
  type TreeFolder,
} from '../web/tree-state';
import type { FileItem } from '../shared/types';

describe('treeOrder and sortByOrder', () => {
  it('flattens in tree order, folders grouped', () => {
    const files = [f('a/x.ts'), f('README.md'), f('a/y.ts'), f('b/z.ts')];
    expect(treeOrder(files).map((x) => x.path)).toEqual(['README.md', 'a/x.ts', 'a/y.ts', 'b/z.ts']);
  });

  it('sorts diff files by tree order, unknown paths last', () => {
    const order = treeOrder([f('a/x.ts'), f('README.md'), f('a/y.ts')]);
    const diff = [{ path: 'README.md' }, { path: 'other' }, { path: 'a/y.ts' }, { path: 'a/x.ts' }];
    expect(sortByOrder(diff, order).map((x) => x.path)).toEqual(['README.md', 'a/x.ts', 'a/y.ts', 'other']);
  });
});

const f = (path: string, viewed = false): FileItem => ({
  path,
  additions: 1,
  deletions: 0,
  viewed,
  changedSinceReview: false,
});

const folder = (dir: string, viewed: number, total: number): TreeFolder => ({
  dir,
  files: [],
  viewed,
  allViewed: viewed === total,
});

describe('groupFolders', () => {
  it('groups files by directory in first-seen order, root first as an empty dir', () => {
    const groups = groupFolders([f('a/x.ts'), f('README.md'), f('a/y.ts'), f('b/z.ts')]);
    expect(groups.map((g) => g.dir)).toEqual(['', 'a/', 'b/']);
    expect(groups[1]!.files.map((x) => x.path)).toEqual(['a/x.ts', 'a/y.ts']);
  });

  it('counts viewed files and flags a fully viewed folder', () => {
    const a = groupFolders([f('a/x.ts', true), f('a/y.ts', true), f('a/z.ts', true)])[0]!;
    expect(a.viewed).toBe(3);
    expect(a.allViewed).toBe(true);
    const b = groupFolders([f('b/x.ts', true), f('b/y.ts')])[0]!;
    expect(b.allViewed).toBe(false);
  });

  // acme-web PR #1369, in GitHub's path order: root files sort after dotted folders.
  it('puts root files in their own first group, never under a dotted folder', () => {
    const paths = [
      '.azuredevops/pull_request_template.md',
      '.claude/commands/implement-infinite-scroll.md',
      '.github/workflows/pr-evidence.yml',
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      'docs/ARCHITECTURE.md',
      'docs/CODE_QUALITY.md',
      'docs/guides/design-system/INDEX_PAGE_PATTERNS.md',
      'docs/guides/development/HUB_PAGE_TESTING_PATTERNS.md',
      'src/components/reports/README.md',
      'src/stores/README.md',
      'src/utils/README.md',
    ];
    const groups = groupFolders(paths.map((p) => f(p)));
    expect(groups[0]!.dir).toBe('');
    expect(groups[0]!.files.map((x) => x.path)).toEqual(['AGENTS.md', 'CLAUDE.md', 'README.md']);
    expect(groups.find((g) => g.dir === '.github/workflows/')!.files.map((x) => x.path)).toEqual([
      '.github/workflows/pr-evidence.yml',
    ]);
    for (const g of groups) {
      for (const x of g.files) {
        expect(x.path.startsWith(g.dir)).toBe(true);
        expect(x.path.slice(g.dir.length)).not.toContain('/');
      }
    }
    expect(groups.flatMap((g) => g.files)).toHaveLength(paths.length);
  });
});

describe('folderCollapsed', () => {
  it('follows the automatic rule when there is no choice', () => {
    expect(folderCollapsed(folder('a/', 3, 3), {})).toBe(true);
    expect(folderCollapsed(folder('a/', 2, 3), {})).toBe(false);
  });

  it('a manual choice wins over the automatic rule', () => {
    expect(folderCollapsed(folder('a/', 3, 3), { 'a/': 'open' })).toBe(false);
    expect(folderCollapsed(folder('a/', 0, 3), { 'a/': 'closed' })).toBe(true);
  });

  it('never collapses the root folder', () => {
    expect(folderCollapsed(folder('', 2, 2), {})).toBe(false);
  });
});

describe('toggleFolder', () => {
  it('flips the state shown now and stores it', () => {
    const open = folder('a/', 1, 3);
    const closed = toggleFolder(open, {});
    expect(closed['a/']).toBe('closed');
    expect(toggleFolder(open, closed)['a/']).toBe('open');
  });

  it('a manual expand of a fully viewed folder sticks', () => {
    const full = folder('a/', 3, 3);
    const expanded = toggleFolder(full, {});
    expect(folderCollapsed(full, expanded)).toBe(false);
  });
});

describe('settleOverrides', () => {
  it('drops a choice when the folder fully-viewed state flips', () => {
    const before = new Map([['a/', false]]);
    const after = [folder('a/', 3, 3)];
    expect(settleOverrides({ 'a/': 'open' }, before, after)).toEqual({});
  });

  it('keeps a choice when the fully-viewed state did not change', () => {
    const before = new Map([['a/', true]]);
    const after = [folder('a/', 3, 3)];
    expect(settleOverrides({ 'a/': 'open' }, before, after)).toEqual({ 'a/': 'open' });
  });
});
