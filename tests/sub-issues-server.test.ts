import { describe, expect, it } from 'vitest';
import type { IssueSummary } from '../shared/issue-types';
import { applyMove, moveArgs, progressOf, targetIndex } from '../shared/sub-issues';
import type { GithubClient } from '../server/github-client';
import { IssueCache } from '../server/issue-cache';
import { toIssueSummary, type RawIssue } from '../server/issue-map';
import {
  ADD_SUB_ISSUE,
  CLOSE_ISSUE,
  CREATE_ISSUE,
  ISSUE_DETAIL_QUERY,
  ISSUE_FIELDS,
  ISSUE_INBOX_QUERY,
  REMOVE_SUB_ISSUE,
  REPRIORITIZE_SUB_ISSUE,
  pollQuery,
} from '../server/issue-queries';
import { IssueService } from '../server/issue-service';
import { applyIssuesFull } from '../server/issue-state';
import { ProjectConfig } from '../server/project-config';
import { PR_FIELDS } from '../server/queries';
import type { SeenStore } from '../server/seen';
import { SubTree } from '../server/sub-issue-fixtures';

interface Call {
  query: string;
  vars: Record<string, unknown>;
}

const child = (n: number, state = 'OPEN', stateReason: string | null = null, repo = 'acme-dev/notes') => ({
  id: `I_${n}`,
  number: n,
  title: `Child ${n}`,
  state,
  stateReason,
  url: `https://github.com/${repo}/issues/${n}`,
  repository: { name: repo.split('/')[1] },
  assignees: { nodes: n === 14 ? [{ login: 'build-bot' }] : [] },
});

const RAW_DETAIL = {
  id: 'I_12',
  number: 12,
  title: 'Rebuild the banner export pipeline',
  url: 'https://github.com/acme-dev/notes/issues/12',
  state: 'OPEN',
  createdAt: '2026-11-05T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
  repository: { name: 'notes' },
  author: { login: 'acme-dev' },
  labels: { nodes: [] },
  assignees: { nodes: [] },
  commentCount: { totalCount: 0 },
  subIssuesSummary: { total: 3, completed: 2 },
  parent: {
    id: 'I_1',
    number: 1,
    title: 'Epic',
    state: 'OPEN',
    stateReason: null,
    url: 'https://github.com/acme-dev/notes/issues/1',
    repository: { name: 'notes' },
    subIssuesSummary: { total: 4, completed: 1 },
  },
  subIssues: { nodes: [child(14, 'CLOSED', 'COMPLETED'), child(421, 'OPEN', null, 'acme-co/acme-api'), child(10, 'CLOSED', 'NOT_PLANNED')] },
  bodyHTML: '',
  milestone: null,
  comments: { nodes: [] },
  timelineItems: { nodes: [] },
  closedByPullRequestsReferences: { nodes: [] },
  participants: { nodes: [] },
};

async function setup() {
  const calls: Call[] = [];
  const client = {
    graphqlRate: undefined,
    lastRate: undefined,
    graphql: async (query: string, vars: Record<string, unknown> = {}) => {
      calls.push({ query, vars });
      if (/query\s+IssueDetail/.test(query)) return { viewer: { login: 'acme-dev' }, repository: { issue: RAW_DETAIL } };
      if (/query\s+RepoId/.test(query)) return { repository: { id: `R_${String(vars.name)}` } };
      if (/query\s+IssueId/.test(query)) return { repository: { issue: { id: `I_${String(vars.number)}` } } };
      if (/mutation\s+CreateIssue/.test(query)) return { createIssue: { issue: { number: 30 } } };
      return {};
    },
  } as unknown as GithubClient;
  const seen = { annotateIssues: async (x: IssueSummary[]) => x, seenCommentCount: async () => undefined } as unknown as SeenStore;
  const svc = new IssueService(client, seen, new IssueCache(), () => 1000, new ProjectConfig());
  await svc.load();
  const listed = (id: string, number: number, extra: Partial<IssueSummary> = {}): IssueSummary => ({
    id,
    repo: 'acme-dev/notes',
    number,
    title: `Issue ${number}`,
    author: 'acme-dev',
    createdAt: '2026-11-05T00:00:00Z',
    updatedAt: '2026-11-06T00:00:00Z',
    url: 'u',
    state: 'open',
    labels: [],
    assignees: [],
    commentCount: 0,
    seen: 'seen',
    ...extra,
  });
  svc.state = applyIssuesFull(
    svc.state,
    'acme-dev',
    [listed('I_12', 12), listed('I_421', 421, { repo: 'acme-co/acme-api', parent: { repo: 'acme-dev/notes', number: 12 } }), listed('I_19', 19)],
    [],
    1000,
  );
  return { svc, calls };
}

const parent = { repo: 'acme-dev/notes', number: 12 };
const sent = (calls: Call[], doc: string) => calls.filter((c) => c.query === doc);

describe('sub-issue reads', () => {
  it('list rows ask only for the summary and the parent ref, never the children', () => {
    for (const doc of [ISSUE_INBOX_QUERY, pollQuery(PR_FIELDS)]) {
      expect(doc).toContain('subIssuesSummary { total completed }');
      expect(doc).toContain('parent { number url repository { name } }');
      expect(doc).not.toMatch(/subIssues\(/);
    }
    expect(ISSUE_FIELDS).not.toMatch(/subIssues\(/);
  });

  it('the detail query fetches the children with stateReason and the parent', () => {
    expect(ISSUE_DETAIL_QUERY).toMatch(/subIssues\(first: 100\)[^}]*stateReason/);
    expect(ISSUE_DETAIL_QUERY).toMatch(/parent \{ id title state stateReason subIssuesSummary/);
  });

  it('maps a list row summary only when the issue has children', () => {
    const raw = { ...RAW_DETAIL, parent: { number: 1, url: 'https://github.com/acme-co/acme-api/issues/1', repository: { name: 'acme-api' } } } as unknown as RawIssue;
    expect(toIssueSummary(raw)).toMatchObject({ subIssues: { total: 3, completed: 2 }, parent: { repo: 'acme-co/acme-api', number: 1 } });
    const leaf = { ...RAW_DETAIL, subIssuesSummary: { total: 0, completed: 0 }, parent: null } as unknown as RawIssue;
    const s = toIssueSummary(leaf);
    expect(s.subIssues).toBeUndefined();
    expect(s.parent).toBeUndefined();
  });

  it('detail maps children in rank order with completed and not-planned states', async () => {
    const { svc } = await setup();
    const d = await svc.detail(parent, () => undefined);
    expect(d.subIssues.map((c) => [c.number, c.repo, c.state, c.assignee])).toEqual([
      [14, 'acme-dev/notes', 'completed', 'build-bot'],
      [421, 'acme-co/acme-api', 'open', undefined],
      [10, 'acme-dev/notes', 'not-planned', undefined],
    ]);
    expect(d.parent).toEqual({ id: 'I_1', repo: 'acme-dev/notes', number: 1, title: 'Epic', state: 'open', progress: { total: 4, completed: 1 } });
  });

  it('refetches a cached detail that predates sub-issues', async () => {
    const { svc, calls } = await setup();
    const old = await svc.detail(parent, () => undefined);
    const { subIssues: _gone, ...stale } = old;
    await (svc as unknown as { cache: IssueCache }).cache.putDetail('acme-dev/notes#12', { id: 'I_12', updatedAt: '2026-11-07T00:00:00Z', detail: stale as typeof old });
    calls.length = 0;
    await svc.detail(parent, () => undefined);
    expect(calls.some((c) => /query\s+IssueDetail/.test(c.query))).toBe(true);
  });
});

describe('sub-issue writes', () => {
  it('create sends one createIssue with the parent id in the chosen repo', async () => {
    const { svc, calls } = await setup();
    const res = await svc.act({ type: 'sub-create', ...parent, childRepo: 'acme-co/acme-api', title: 'New child', body: '' });
    expect(res).toMatchObject({ ok: true, number: 30 });
    expect(sent(calls, CREATE_ISSUE)).toHaveLength(1);
    expect(sent(calls, CREATE_ISSUE)[0]?.vars).toMatchObject({ repo: 'R_acme-api', title: 'New child', parent: 'I_12' });
  });

  it('add looks up an unlisted child and passes replaceParent through', async () => {
    const { svc, calls } = await setup();
    await svc.act({ type: 'sub-add', ...parent, childRepo: 'acme-co/acme-api', childNumber: 433, replaceParent: true });
    expect(sent(calls, ADD_SUB_ISSUE)[0]?.vars).toEqual({ id: 'I_12', sub: 'I_433', replace: true });
  });

  it('add marks a listed child with its new parent', async () => {
    const { svc } = await setup();
    await svc.act({ type: 'sub-add', ...parent, childRepo: 'acme-dev/notes', childNumber: 19, replaceParent: false });
    expect(svc.state.issues.I_19?.parent).toEqual(parent);
  });

  it('move sends exactly the anchor it was given', async () => {
    const { svc, calls } = await setup();
    await svc.act({ type: 'sub-move', ...parent, childId: 'I_10', beforeId: 'I_14' });
    await svc.act({ type: 'sub-move', ...parent, childId: 'I_14', afterId: 'I_10' });
    expect(sent(calls, REPRIORITIZE_SUB_ISSUE).map((c) => c.vars)).toEqual([
      { id: 'I_12', sub: 'I_10', after: null, before: 'I_14' },
      { id: 'I_12', sub: 'I_14', after: 'I_10', before: null },
    ]);
  });

  it('remove unlinks only and never closes the child', async () => {
    const { svc, calls } = await setup();
    const res = await svc.act({ type: 'sub-remove', ...parent, childId: 'I_421' });
    expect(res.ok).toBe(true);
    expect(sent(calls, REMOVE_SUB_ISSUE).map((c) => c.vars)).toEqual([{ id: 'I_12', sub: 'I_421' }]);
    expect(sent(calls, CLOSE_ISSUE)).toHaveLength(0);
    expect(calls.every((c) => !/closeIssue|updateIssue/.test(c.query))).toBe(true);
    expect(svc.state.issues.I_421?.state).toBe('open');
    expect(svc.state.issues.I_421?.parent).toBeUndefined();
  });

  it('a write drops the parent detail so the next read has the new order', async () => {
    const { svc, calls } = await setup();
    await svc.detail(parent, () => undefined);
    await svc.act({ type: 'sub-move', ...parent, childId: 'I_10', beforeId: 'I_14' });
    calls.length = 0;
    await svc.detail(parent, () => undefined);
    expect(calls.some((c) => /query\s+IssueDetail/.test(c.query))).toBe(true);
  });
});

describe('reorder anchors', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves up, down, to the top and to the bottom with one anchor each', () => {
    expect(moveArgs(ids, 'c', targetIndex(ids, 'c', 'up'))).toEqual({ afterId: 'a' });
    expect(moveArgs(ids, 'b', targetIndex(ids, 'b', 'up'))).toEqual({ beforeId: 'a' });
    expect(moveArgs(ids, 'b', targetIndex(ids, 'b', 'down'))).toEqual({ afterId: 'c' });
    expect(moveArgs(ids, 'c', targetIndex(ids, 'c', 'top'))).toEqual({ beforeId: 'a' });
    expect(moveArgs(ids, 'b', targetIndex(ids, 'b', 'bottom'))).toEqual({ afterId: 'd' });
  });

  it('sends nothing when the row would not move', () => {
    expect(moveArgs(ids, 'a', targetIndex(ids, 'a', 'up'))).toBeUndefined();
    expect(moveArgs(ids, 'd', targetIndex(ids, 'd', 'down'))).toBeUndefined();
    expect(moveArgs(['a'], 'a', 0)).toBeUndefined();
  });

  it('applyMove gives the order GitHub will have after each anchor', () => {
    const items = ids.map((id) => ({ id }));
    for (const [id, to] of [['c', 0], ['a', 3], ['b', 2], ['d', 1]] as const) {
      const args = moveArgs(ids, id, to);
      if (!args) throw new Error('expected a move');
      const next = applyMove(items, id, args).map((i) => i.id);
      expect(next.indexOf(id)).toBe(to);
      expect([...next].sort()).toEqual(ids);
    }
  });

  it('counts every closed child as done', () => {
    expect(progressOf([{ state: 'completed' }, { state: 'not-planned' }, { state: 'open' }])).toEqual({ total: 3, completed: 2 });
  });
});

describe('fixture sub-issue tree', () => {
  it('starts with the mockup order and refuses a second parent unless replaced', () => {
    const t = new SubTree();
    expect(t.children('I_acme-dev/notes_12')).toEqual([
      'I_acme-dev/notes_14',
      'I_acme-dev/notes_17',
      'I_acme-dev/notes_15',
      'I_acme-co/acme-api_421',
      'I_acme-dev/notes_10',
    ]);
    expect(() => t.add('I_acme-dev/notes_12', 'I_acme-co/acme-web_288', false)).toThrow(/already has a parent/);
    t.add('I_acme-dev/notes_12', 'I_acme-co/acme-web_288', true);
    expect(t.parentOf('I_acme-co/acme-web_288')).toBe('I_acme-dev/notes_12');
    expect(t.children('I_acme-co/acme-web_250')).not.toContain('I_acme-co/acme-web_288');
  });
});
