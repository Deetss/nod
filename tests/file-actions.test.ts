import { describe, expect, it } from 'vitest';
import type { DiffFile } from '../shared/types';
import { fileActions, isBinary, isDeleted, repoUrl, type FileHead } from '../web/file-actions';

const head: FileHead = {
  prUrl: 'https://github.com/acme-co/acme-api/pull/328',
  headRef: 'dev/issue-324-posthog-logs',
  baseRef: 'staging',
  state: 'open',
  fork: false,
};

const file = (over: Partial<DiffFile> = {}): DiffFile => ({
  path: '.azuredevops/pull_request_template.md',
  additions: 1,
  deletions: 1,
  hunks: [{ header: '@@ -7,7 +7,7 @@', lines: [] }],
  ...over,
});

const REPO = 'https://github.com/acme-co/acme-api';

describe('fileActions', () => {
  it('opens view, edit and delete on the head branch, with each path segment encoded', () => {
    const [view, edit, del] = fileActions(head, file({ path: 'docs/a b#c.md' }));
    expect(view?.url).toBe(`${REPO}/blob/dev/issue-324-posthog-logs/docs/a%20b%23c.md`);
    expect(edit?.url).toBe(`${REPO}/edit/dev/issue-324-posthog-logs/docs/a%20b%23c.md`);
    expect(del?.url).toBe(`${REPO}/delete/dev/issue-324-posthog-logs/docs/a%20b%23c.md`);
    expect(del?.danger).toBe(true);
  });

  it('views a deleted file on the base branch and turns edit and delete off', () => {
    const gone = file({ additions: 0, deletions: 24, hunks: [{ header: '@@ -1,24 +0,0 @@', lines: [] }] });
    expect(isDeleted(gone)).toBe(true);
    const [view, edit, del] = fileActions(head, gone);
    expect(view).toMatchObject({ sub: 'Before this PR, on staging', url: `${REPO}/blob/staging/.azuredevops/pull_request_template.md` });
    expect(edit).toEqual({ kind: 'edit', title: 'Edit file', sub: 'Deleted in this PR' });
    expect(del?.url).toBeUndefined();
  });

  it('turns only edit off for a binary file', () => {
    const bin = file({ path: 'public/logo.png', additions: 0, deletions: 0, noPatch: true, hunks: [] });
    expect(isBinary(bin)).toBe(true);
    const [, edit, del] = fileActions(head, bin);
    expect(edit).toMatchObject({ sub: 'GitHub cannot edit a binary file' });
    expect(edit?.url).toBeUndefined();
    expect(del?.url).toBeDefined();
  });

  it('keeps a large text file editable', () => {
    expect(isBinary(file({ noPatch: true, additions: 4000, deletions: 10 }))).toBe(false);
  });

  it('turns edit and delete off for a merged, closed or fork PR, and keeps view', () => {
    for (const [over, why] of [
      [{ state: 'merged' as const }, 'PR merged: its branch may be gone'],
      [{ state: 'closed' as const }, 'PR closed: its branch may be gone'],
      [{ fork: true }, 'The branch is on a fork'],
    ] as const) {
      const [view, edit, del] = fileActions({ ...head, ...over }, file());
      expect(view?.url).toBeDefined();
      expect([edit?.sub, del?.sub]).toEqual([why, why]);
      expect([edit?.url, del?.url]).toEqual([undefined, undefined]);
    }
  });

  it('offers nothing to open when the PR URL is not a GitHub PR', () => {
    expect(repoUrl('https://example.com/x')).toBeUndefined();
    expect(fileActions({ ...head, prUrl: '' }, file()).every((a) => a.url === undefined)).toBe(true);
  });
});
