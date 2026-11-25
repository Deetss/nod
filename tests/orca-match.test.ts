import { describe, expect, it } from 'vitest';
import { matchSessions, matchWorktrees, relatedToIssue } from '../shared/orca-match';
import { mapSessionState, type SessionCandidate, type WorktreeCandidate } from '../shared/orca-sessions';

function session(over: Partial<SessionCandidate> = {}): SessionCandidate {
  return {
    id: 'wt1|pane1',
    host: 'local',
    worktreeId: 'wt1',
    name: 'crew-1355',
    state: 'working',
    repo: 'acme-web',
    branch: '',
    linkedPrs: [],
    linkedIssues: [],
    live: true,
    ...over,
  };
}

const pr = { repo: 'acme-co/acme-web', number: 1355, headRef: 'build-bot/posthog-opt-in' };

describe('matchSessions', () => {
  it('relates a session by linked PR in the same repo', () => {
    const m = matchSessions(pr, [session({ linkedPrs: [{ number: 1355 }] })]);
    expect(m.related).toHaveLength(1);
    expect(m.related[0]).toMatchObject({ via: 'pr', reason: 'linked PR #1355' });
  });

  it('uses the repo on a linked item when it names one', () => {
    const other = session({ linkedPrs: [{ number: 1355, repo: 'acme-api' }] });
    expect(matchSessions(pr, [other]).related).toHaveLength(0);
  });

  it('relates a session by branch plus repo', () => {
    const m = matchSessions(pr, [session({ branch: 'build-bot/posthog-opt-in' })]);
    expect(m.related[0]).toMatchObject({ via: 'branch', reason: 'branch build-bot/posthog-opt-in' });
  });

  it('does not relate the same branch in another repo', () => {
    expect(matchSessions(pr, [session({ repo: 'acme-api', branch: 'build-bot/posthog-opt-in' })]).related).toHaveLength(0);
  });

  it('never matches a detached worktree on branch', () => {
    const m = matchSessions({ ...pr, headRef: '' }, [session({ branch: '' })]);
    expect(m.related).toHaveLength(0);
    expect(m.possible).toHaveLength(0);
  });

  it('needs a head ref to match a branch', () => {
    const m = matchSessions({ repo: 'acme-co/acme-web', number: 9 }, [session({ branch: 'anything' })]);
    expect(m.related).toHaveLength(0);
  });

  it('lists a linked issue the PR closes as possible', () => {
    const s = session({ linkedIssues: [{ number: 412 }] });
    const m = matchSessions({ ...pr, closes: [412] }, [s]);
    expect(m.related).toHaveLength(0);
    expect(m.possible[0]).toMatchObject({ via: 'issue', reason: 'linked issue #412' });
  });

  it('lists a PR number inside the branch name as possible, whole numbers only', () => {
    const hit = session({ id: 'a|1', branch: 'issue-1355-fix' });
    const miss = session({ id: 'b|1', branch: 'issue-13555-fix' });
    const m = matchSessions(pr, [hit, miss]);
    expect(m.possible.map((p) => p.session.id)).toEqual(['a|1']);
  });

  it('drops sessions without a live agent row', () => {
    const m = matchSessions(pr, [session({ live: false, linkedPrs: [{ number: 1355 }] })]);
    expect(m.related).toHaveLength(0);
  });

  it('returns two related sessions and leaves the choice to the caller', () => {
    const a = session({ id: 'a|1', worktreeId: 'a', linkedPrs: [{ number: 1355 }], lastOutputAt: 1 });
    const b = session({ id: 'b|1', worktreeId: 'b', branch: 'build-bot/posthog-opt-in', lastOutputAt: 2 });
    const m = matchSessions(pr, [a, b]);
    expect(m.related.map((r) => r.session.id)).toEqual(['b|1', 'a|1']);
  });

  it('a remembered choice replaces the list', () => {
    const a = session({ id: 'a|1', worktreeId: 'a', linkedPrs: [{ number: 1355 }] });
    const b = session({ id: 'b|1', worktreeId: 'b', branch: 'build-bot/posthog-opt-in' });
    const m = matchSessions(pr, [a, b], { sessionId: 'b|1', worktreeId: 'b' });
    expect(m.related).toHaveLength(1);
    expect(m.related[0]).toMatchObject({ via: 'chosen' });
    expect(m.related[0]?.session.id).toBe('b|1');
    expect(m.possible).toHaveLength(0);
  });

  it('a choice falls back to another live agent in the same worktree', () => {
    const next = session({ id: 'b|2', worktreeId: 'b' });
    const m = matchSessions(pr, [next], { sessionId: 'b|1', worktreeId: 'b' });
    expect(m.related[0]?.session.id).toBe('b|2');
  });

  it('ignores a choice whose session is gone', () => {
    const a = session({ id: 'a|1', worktreeId: 'a', linkedPrs: [{ number: 1355 }] });
    const m = matchSessions(pr, [a], { sessionId: 'z|1', worktreeId: 'z' });
    expect(m.related[0]).toMatchObject({ via: 'pr' });
  });
});

describe('relatedToIssue', () => {
  it('matches a linked issue in the same repo only', () => {
    const a = session({ linkedIssues: [{ number: 412 }] });
    const b = session({ id: 'b|1', linkedIssues: [{ number: 412, repo: 'acme-api' }] });
    expect(relatedToIssue('acme-co/acme-web', 412, [a, b]).map((m) => m.session.id)).toEqual(['wt1|pane1']);
  });
});

describe('matchWorktrees', () => {
  const wt = (over: Partial<WorktreeCandidate> = {}): WorktreeCandidate => ({
    host: 'local',
    worktreeId: 'wt1',
    name: 'crew-1355',
    repo: 'acme-web',
    branch: '',
    linkedPrs: [],
    linkedIssues: [],
    live: false,
    ...over,
  });

  it('matches an idle worktree linked to the PR', () => {
    const m = matchWorktrees(pr, [wt({ linkedPrs: [{ number: 1355 }] })]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ via: 'pr', reason: 'linked PR #1355' });
    expect(m[0]?.worktree.live).toBe(false);
  });

  it('matches a worktree on the PR head branch in the same repo', () => {
    const m = matchWorktrees(pr, [wt({ branch: 'build-bot/posthog-opt-in' })]);
    expect(m[0]).toMatchObject({ via: 'branch' });
  });

  it('puts the chosen worktree first even when another link is newer', () => {
    const newer = wt({ worktreeId: 'wt2', linkedPrs: [{ number: 1355 }], lastOutputAt: 9_000 });
    const older = wt({ worktreeId: 'wt1', linkedPrs: [{ number: 1355 }], lastOutputAt: 1_000 });
    const m = matchWorktrees(pr, [newer, older], { host: 'local', worktreeId: 'wt1' });
    expect(m.map((x) => [x.worktree.worktreeId, x.via])).toEqual([
      ['wt1', 'chosen'],
      ['wt2', 'pr'],
    ]);
  });

  it('does not match a chosen worktree id on another host', () => {
    const m = matchWorktrees(pr, [wt({ host: 'laptop' })], { host: 'local', worktreeId: 'wt1' });
    expect(m).toEqual([]);
  });

  it('matches a worktree on host laptop', () => {
    const m = matchWorktrees(pr, [wt({ host: 'laptop', linkedPrs: [{ number: 1355 }] })]);
    expect(m).toHaveLength(1);
    expect(m[0]?.worktree.host).toBe('laptop');
  });

  it('does not match the same PR number in another repo', () => {
    const m = matchWorktrees(pr, [wt({ repo: 'acme-api', linkedPrs: [{ number: 1355 }] })]);
    expect(m).toEqual([]);
  });
});

describe('mapSessionState', () => {
  it.each([
    ['working', 'working'],
    ['done', 'done'],
    ['waiting', 'waiting'],
    ['blocked', 'unknown'],
    [undefined, 'unknown'],
    [3, 'unknown'],
  ])('maps %s to %s', (raw, state) => {
    expect(mapSessionState(raw)).toBe(state);
  });
});
