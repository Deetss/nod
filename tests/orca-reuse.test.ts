import { describe, expect, it, vi } from 'vitest';
import { dispatchBody } from '../server/orca-dispatch';
import { dispatchWithReuse, planReuse, type ReuseDeps } from '../server/orca-reuse';
import type { SessionSnapshot } from '../server/orca-sessions';
import type { WorktreeCandidate } from '../shared/orca-sessions';

const pr = { repo: 'acme-co/acme-api', number: 305, headRef: 'feature/305' };

const wt = (over: Partial<WorktreeCandidate> = {}): WorktreeCandidate => ({
  host: 'local',
  worktreeId: 'wt1',
  name: 'crew-305',
  repo: 'acme-api',
  branch: '',
  linkedPrs: [{ number: 305 }],
  linkedIssues: [],
  live: false,
  ...over,
});

type Snap = Pick<SessionSnapshot, 'worktrees' | 'hosts'>;

const snap = (worktrees: WorktreeCandidate[], hosts: Snap['hosts'] = [{ name: 'local', online: true }] as Snap['hosts']): Snap => ({
  worktrees,
  hosts,
});

describe('planReuse', () => {
  it('reuses an idle matching worktree', () => {
    const plan = planReuse(pr, snap([wt()]));
    expect(plan.kind).toBe('reuse');
    if (plan.kind === 'reuse') expect(plan.target.worktree.worktreeId).toBe('wt1');
  });

  it('stops on a live match and names the worktree and host', () => {
    const plan = planReuse(pr, snap([wt({ live: true, host: 'laptop' })]));
    expect(plan.kind).toBe('busy');
    if (plan.kind === 'busy') {
      expect(plan.message).toContain('crew-305');
      expect(plan.message).toContain('laptop');
    }
  });

  it('plans a new worktree when nothing matches', () => {
    expect(planReuse(pr, snap([wt({ linkedPrs: [{ number: 9 }] })]))).toEqual({ kind: 'new' });
  });

  it('stops when the chosen worktree is on an offline host', () => {
    const hosts = [
      { name: 'local', online: true },
      { name: 'desktop', online: false },
    ] as Snap['hosts'];
    const plan = planReuse(pr, snap([], hosts), { host: 'desktop', worktreeId: 'gone' });
    expect(plan.kind).toBe('busy');
    if (plan.kind === 'busy') expect(plan.message).toContain('desktop');
  });

  it('prefers the chosen idle worktree over a newer direct link', () => {
    const chosen = wt({ worktreeId: 'wt-chosen', name: 'chosen-305', linkedPrs: [], lastOutputAt: 1 });
    const newer = wt({ worktreeId: 'wt-new', name: 'newer-305', lastOutputAt: 9_000 });
    const plan = planReuse(pr, snap([newer, chosen]), { host: 'local', worktreeId: 'wt-chosen' });
    expect(plan.kind).toBe('reuse');
    if (plan.kind === 'reuse') expect(plan.target.worktree.worktreeId).toBe('wt-chosen');
  });
});

describe('dispatchWithReuse', () => {
  const body = (over: Record<string, unknown> = {}) =>
    dispatchBody.parse({
      repo: 'acme-co/acme-api',
      number: 305,
      agent: 'claude',
      name: 'fix-305',
      baseBranch: 'feature/305',
      prompt: 'Fix it',
      pr: true,
      ...over,
    });

  function deps(worktrees: WorktreeCandidate[], chosen?: { host: string; worktreeId: string }) {
    const orca = {
      dispatch: vi.fn(async () => ({ ok: true as const, worktree: 'fix-305', worktreeId: 'wt-new' })),
      launch: vi.fn(async (_b: unknown, _h: string, id: string, name: string) => ({ ok: true as const, worktree: name, worktreeId: id })),
    };
    const sessions = { fresh: vi.fn(async () => snap(worktrees)) };
    const prefs = {
      get: vi.fn(() => ({ chosen: chosen ? { PR_1: chosen } : {} })),
      choose: vi.fn(),
    };
    const provider = {
      inbox: vi.fn(async () => ({ prs: [{ id: 'PR_1', repo: 'Acme-Co/Acme-API', number: 305, closes: [] }] })),
    };
    return { orca, sessions, prefs, provider, all: { orca, sessions, prefs, provider } as unknown as ReuseDeps };
  }

  it('launches into the chosen worktree after the first agent exited', async () => {
    const d = deps([wt({ host: 'laptop' })], { host: 'laptop', worktreeId: 'wt1' });
    const res = await dispatchWithReuse(d.all, body(), 'local');
    expect(d.orca.launch).toHaveBeenCalledWith(expect.anything(), 'laptop', 'wt1', 'crew-305');
    expect(d.orca.dispatch).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, reused: true, host: 'laptop' });
  });

  it('creates a new worktree when newWorktree is set, even with an idle match', async () => {
    const d = deps([wt()]);
    const res = await dispatchWithReuse(d.all, body({ newWorktree: true }), 'local');
    expect(d.orca.dispatch).toHaveBeenCalled();
    expect(d.orca.launch).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, host: 'local' });
    expect(res).not.toHaveProperty('reused');
  });

  it('records the new worktree as the PR choice', async () => {
    const d = deps([]);
    await dispatchWithReuse(d.all, body(), 'laptop');
    expect(d.prefs.choose).toHaveBeenCalledWith('PR_1', { host: 'laptop', worktreeId: 'wt-new' });
  });

  it('never looks up the PR or sessions for a non-PR dispatch', async () => {
    const d = deps([wt()]);
    await dispatchWithReuse(d.all, body({ pr: undefined, baseBranch: undefined }), 'local');
    expect(d.provider.inbox).not.toHaveBeenCalled();
    expect(d.sessions.fresh).not.toHaveBeenCalled();
    expect(d.orca.dispatch).toHaveBeenCalled();
  });

  it('answers 409 for a live match and launches nothing', async () => {
    const d = deps([wt({ live: true })]);
    const res = await dispatchWithReuse(d.all, body(), 'local');
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(d.orca.launch).not.toHaveBeenCalled();
    expect(d.orca.dispatch).not.toHaveBeenCalled();
  });

  it('matches the repo case-insensitively', async () => {
    const d = deps([wt()]);
    const res = await dispatchWithReuse(d.all, body({ repo: 'ACME-CO/Acme-Api' }), 'local');
    expect(res).toMatchObject({ ok: true, reused: true });
  });
});
