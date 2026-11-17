import { describe, expect, it } from 'vitest';
import {
  adminMergeArgs,
  adminMergeState,
  bypassDoneMessage,
  bypassMergeArgs,
  bypassMergeFlags,
  bypassStrip,
  bypassTooltip,
  githubErrorText,
  isOwnPr,
  mergeFlags,
  OWN_APPROVAL_422,
  reviewAccess,
} from '../shared/pr-actions';

describe('own PR check', () => {
  it('matches the viewer ignoring case', () => {
    expect(isOwnPr('acme-dev', 'acme-dev')).toBe(true);
    expect(isOwnPr('someone', 'acme-dev')).toBe(false);
  });

  it('never matches before the viewer is known', () => {
    expect(isOwnPr('', '')).toBe(false);
    expect(isOwnPr('acme-dev', '')).toBe(false);
  });

  it('flags own PRs in the review access', () => {
    const a = reviewAccess({ author: 'acme-dev', viewer: 'acme-dev', ci: 'none' });
    expect(a.ownPr).toBe(true);
    expect(reviewAccess({ author: 'x', viewer: 'acme-dev', ci: 'none' }).ownPr).toBe(false);
  });
});

describe('admin merge enable rules', () => {
  const own = { author: 'acme-dev', viewer: 'acme-dev', viewerCanMergeAsAdmin: true };

  it('is ready for the author with permission and a passing rollup', () => {
    expect(adminMergeState({ ...own, ci: 'pass' })).toBe('ready');
  });

  it('waits while the rollup is failing, running or absent', () => {
    expect(adminMergeState({ ...own, ci: 'fail' })).toBe('waiting');
    expect(adminMergeState({ ...own, ci: 'running' })).toBe('waiting');
    expect(adminMergeState({ ...own, ci: 'none' })).toBe('waiting');
  });

  it('reports draft for a draft, even with every check passing', () => {
    expect(adminMergeState({ ...own, ci: 'pass', isDraft: true })).toBe('draft');
    expect(reviewAccess({ author: 'acme-dev', viewer: 'acme-dev', viewerCanMergeAsAdmin: true, ci: 'pass', isDraft: true }).draft).toBe(true);
  });

  it('stays hidden for a draft the viewer cannot admin merge', () => {
    expect(adminMergeState({ ...own, viewerCanMergeAsAdmin: false, ci: 'pass', isDraft: true })).toBe('hidden');
  });

  it('is hidden for someone else PR', () => {
    expect(adminMergeState({ ...own, author: 'other', ci: 'pass' })).toBe('hidden');
  });

  it('is hidden without the permission, or when GitHub did not say', () => {
    expect(adminMergeState({ ...own, viewerCanMergeAsAdmin: false, ci: 'pass' })).toBe('hidden');
    expect(adminMergeState({ ...own, viewerCanMergeAsAdmin: undefined, ci: 'pass' })).toBe('hidden');
  });

  it('is ready for the viewer who pushed the head commit, even when someone else opened it', () => {
    const pushed = { author: 'build-bot', viewer: 'acme-dev', viewerCanMergeAsAdmin: true, headCommitLogins: ['acme-dev'] };
    expect(adminMergeState({ ...pushed, ci: 'pass' })).toBe('ready');
    expect(adminMergeState({ ...pushed, ci: 'running' })).toBe('waiting');
    expect(adminMergeState({ ...pushed, ci: 'pass', isDraft: true })).toBe('draft');
  });

  it('counts the head commit committer as a pusher', () => {
    const d = { author: 'acme-bot', viewer: 'acme-dev', viewerCanMergeAsAdmin: true, ci: 'pass' as const };
    expect(adminMergeState({ ...d, headCommitLogins: ['someone', 'acme-dev'] })).toBe('ready');
  });

  it('is hidden for a viewer who neither opened the PR nor pushed its head commit', () => {
    const d = {
      author: 'acme-bot',
      viewer: 'acme-dev',
      viewerCanMergeAsAdmin: true,
      ci: 'pass' as const,
      headCommitLogins: ['someone-else'],
    };
    expect(adminMergeState(d)).toBe('hidden');
    expect(adminMergeState({ ...d, headCommitLogins: [] })).toBe('hidden');
    expect(adminMergeState({ ...d, headCommitLogins: undefined })).toBe('hidden');
  });

  it('hides the pusher without admin permission', () => {
    const d = { author: 'build-bot', viewer: 'acme-dev', viewerCanMergeAsAdmin: false, ci: 'pass' as const };
    expect(adminMergeState({ ...d, headCommitLogins: ['acme-dev'] })).toBe('hidden');
  });

  it('matches the pusher login ignoring case', () => {
    const d = { author: 'build-bot', viewer: 'acme-dev', viewerCanMergeAsAdmin: true, ci: 'pass' as const };
    expect(adminMergeState({ ...d, headCommitLogins: ['ACME-DEV'] })).toBe('ready');
  });

  it('never matches an empty pusher login to an empty viewer', () => {
    const d = { author: 'build-bot', viewer: '', viewerCanMergeAsAdmin: true, ci: 'pass' as const };
    expect(adminMergeState({ ...d, headCommitLogins: [''] })).toBe('hidden');
  });
});

describe('merge method', () => {
  const release = { title: 'feat: Release Staging to Main (2026-11-06)', base: 'main', head: 'staging' };
  const plain = { title: 'fix: unit sale', base: 'staging', head: 'feature/1' };

  it('uses a merge commit for release staging to main', () => {
    expect(mergeFlags(release)).toEqual(['--merge']);
  });

  it('squashes and deletes the branch for everything else', () => {
    expect(mergeFlags(plain)).toEqual(['--squash', '--delete-branch']);
  });

  it('squashes a PR that only borrows the release title', () => {
    expect(mergeFlags({ ...release, head: 'feature/x' })).toEqual(['--squash', '--delete-branch']);
    expect(mergeFlags({ ...release, base: 'staging' })).toEqual(['--squash', '--delete-branch']);
  });

  it('builds the admin merge argv without a shell string', () => {
    expect(adminMergeArgs('acme-co/acme-api', 307, plain)).toEqual([
      'pr', 'merge', '--admin', '--repo', 'acme-co/acme-api', '307', '--squash', '--delete-branch',
    ]);
    expect(adminMergeArgs('acme-co/acme-api', 307, release)).toContain('--merge');
  });
});

describe('Merge (bypass) method choice', () => {
  const feature = { title: 'feat: add refund endpoint', base: 'main', head: 'feat/refunds' };
  const release = { title: 'feat: release staging to main (2026-11-06)', base: 'main', head: 'staging' };
  const allow = (squash: boolean, merge: boolean, rebase: boolean) => ({ squash, merge, rebase });

  it.each<[string, ReturnType<typeof allow>, string[] | undefined]>([
    ['all three', allow(true, true, true), ['--squash', '--delete-branch']],
    ['squash and merge', allow(true, true, false), ['--squash', '--delete-branch']],
    ['squash and rebase', allow(true, false, true), ['--squash', '--delete-branch']],
    ['squash only', allow(true, false, false), ['--squash', '--delete-branch']],
    ['merge and rebase', allow(false, true, true), ['--merge']],
    ['merge only', allow(false, true, false), ['--merge']],
    ['rebase only', allow(false, false, true), ['--rebase', '--delete-branch']],
    ['none', allow(false, false, false), undefined],
  ])('prefers squash on a feature PR: %s', (_name, allowed, flags) => {
    expect(bypassMergeFlags(feature, allowed)).toEqual(flags);
  });

  it('prefers a merge commit on a release PR, then squash, then rebase', () => {
    expect(bypassMergeFlags(release, allow(true, true, true))).toEqual(['--merge']);
    expect(bypassMergeFlags(release, allow(true, false, true))).toEqual(['--squash', '--delete-branch']);
    expect(bypassMergeFlags(release, allow(false, false, true))).toEqual(['--rebase', '--delete-branch']);
    expect(bypassMergeFlags(release, allow(false, false, false))).toBeUndefined();
  });

  it('allows every method when the repository settings are unknown', () => {
    expect(bypassMergeFlags(feature, undefined)).toEqual(['--squash', '--delete-branch']);
  });

  it('runs gh pr merge --admin with the chosen flags', () => {
    expect(bypassMergeArgs('acme-co/orders-api', 372, ['--squash', '--delete-branch'])).toEqual([
      'pr',
      'merge',
      '--admin',
      '--repo',
      'acme-co/orders-api',
      '372',
      '--squash',
      '--delete-branch',
    ]);
  });

  it('names the method in the tooltip and the branch in the toast', () => {
    expect(bypassTooltip('squash')).toBe('Skips the required review. Squash and merge.');
    expect(bypassTooltip('rebase')).toBe('Skips the required review. Rebase and merge.');
    expect(bypassDoneMessage(372, true)).toBe('Merged #372 without review. Branch deleted.');
    expect(bypassDoneMessage(372, false)).toBe('Merged #372 without review.');
  });
});

describe('Merge (bypass) confirm strip', () => {
  const detail = (extra: Record<string, unknown> = {}) =>
    ({
      summary: { number: 372 },
      headRef: 'feat/refunds',
      mergeMethod: 'squash',
      mergeAllowed: { squash: true, merge: true, rebase: false },
      deleteBranchOnMerge: false,
      approvals: 0,
      requiredApprovals: 1,
      reviewThreadTotal: 3,
      unresolvedThreads: 0,
      checks: Array.from({ length: 6 }, (_, i) => ({ name: `c${i}`, status: 'pass', duration: '' })),
      ...extra,
    }) as unknown as Parameters<typeof bypassStrip>[0];

  it('names what is skipped, the method and what was met', () => {
    expect(bypassStrip(detail())).toEqual({
      title: 'Merge #372 without review?',
      lines: [
        'Skips the required review (0 of 1 approvals).',
        'Squash and merge, then delete feat/refunds.',
        '6 of 6 checks passed · 3 of 3 threads resolved',
      ],
    });
  });

  it('says a merge commit keeps the branch unless the repository deletes it', () => {
    const merge = { mergeMethod: 'merge', mergeAllowed: { squash: false, merge: true, rebase: false } };
    expect(bypassStrip(detail(merge)).lines[1]).toBe('Merge commit, keeps feat/refunds.');
    expect(bypassStrip(detail({ ...merge, deleteBranchOnMerge: true })).lines[1]).toBe(
      'Merge commit, then delete feat/refunds.',
    );
  });

  it('uses the highest required approval count', () => {
    expect(bypassStrip(detail({ approvals: 1, requiredApprovals: 2 })).lines[0]).toBe(
      'Skips the required review (1 of 2 approvals).',
    );
  });
});

describe('GitHub error text', () => {
  it('prefers the errors entries from a 422 body', () => {
    expect(githubErrorText(422, OWN_APPROVAL_422)).toBe('422: Can not approve your own pull request');
  });

  it('accepts plain string errors', () => {
    expect(githubErrorText(422, JSON.stringify({ message: 'Validation Failed', errors: ['bad head'] }))).toBe(
      '422: bad head',
    );
  });

  it('falls back to message, then to the status', () => {
    expect(githubErrorText(403, JSON.stringify({ message: 'Resource not accessible' }))).toBe(
      '403: Resource not accessible',
    );
    expect(githubErrorText(502, '<html>bad gateway</html>')).toBe('GitHub API error 502');
    expect(githubErrorText(500, '')).toBe('GitHub API error 500');
  });

  it('trims to 200 characters', () => {
    const text = githubErrorText(422, JSON.stringify({ message: 'x'.repeat(500) }));
    expect(text).toHaveLength(200);
    expect(text.endsWith('...')).toBe(true);
  });
});
