import { describe, expect, it } from 'vitest';
import type { GithubClient } from '../server/github-client';
import { IssueCache } from '../server/issue-cache';
import { IssueService } from '../server/issue-service';
import { applyIssuesFull } from '../server/issue-state';
import { ProjectConfig } from '../server/project-config';
import { SeenStore } from '../server/seen';

const done = { hasNextPage: false, endCursor: null };

function service(graphql: (query: string, vars: Record<string, unknown>) => unknown) {
  const client = { graphqlRate: undefined, lastRate: undefined, graphql: async (q: string, v: Record<string, unknown>) => graphql(q, v) } as unknown as GithubClient;
  return new IssueService(client, new SeenStore(null), new IssueCache(), () => 1000, new ProjectConfig());
}

describe('repo metadata paging', () => {
  it('finds a label that sits past the first page', async () => {
    const writes: Record<string, unknown>[] = [];
    const svc = service((query, vars) => {
      if (/query\s+RepoMeta/.test(query)) {
        const second = vars.labelsAfter === 'c1';
        return {
          repository: {
            labels: second
              ? { pageInfo: done, nodes: [{ id: 'L_101', name: 'label-101', color: 'aaaaaa' }] }
              : { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [{ id: 'L_1', name: 'bug', color: 'ff0000' }] },
            milestones: { pageInfo: done, nodes: [] },
            assignableUsers: { pageInfo: done, nodes: [{ id: 'U_me', login: 'me' }] },
            issueTemplates: [],
          },
        };
      }
      writes.push(vars);
      return {};
    });
    await svc.load();
    svc.state = applyIssuesFull(
      svc.state,
      'me',
      [
        {
          id: 'I_1', repo: 'acme-api', number: 7, title: 't', author: 'me', createdAt: 'x', updatedAt: 'x', url: 'u',
          state: 'open', labels: [], assignees: [], commentCount: 0, seen: 'seen',
        },
      ],
      [],
      1000,
    );
    const res = await svc.act({ type: 'labels', repo: 'acme-api', number: 7, add: ['label-101'], remove: [] });
    expect(res.ok).toBe(true);
    expect(writes[0]?.labels).toEqual(['L_101']);
  });
});

describe('issue comment paging', () => {
  it('keeps comments past the first 100', async () => {
    const comment = (id: string) => ({ id, bodyHTML: '<p>x</p>', createdAt: '2026-11-06T10:00:00Z', author: { login: 'me' } });
    const svc = service((query, vars) => {
      if (/query\s+IssueComments/.test(query)) {
        expect(vars.after).toBe('c1');
        return { repository: { issue: { comments: { pageInfo: done, nodes: [comment('c-101')] } } } };
      }
      return {
        viewer: { login: 'me' },
        repository: {
          issue: {
            id: 'I_1', number: 7, title: 't', url: 'u', state: 'OPEN', createdAt: 'x', updatedAt: 'x',
            repository: { name: 'acme-api' }, author: { login: 'me' }, labels: { nodes: [] },
            assignees: { nodes: [] }, commentCount: { totalCount: 101 }, comments: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [comment('c-1')] },
            projectItems: { nodes: [] }, bodyHTML: '', milestone: null, timelineItems: { nodes: [] },
            closedByPullRequestsReferences: { nodes: [] }, participants: { nodes: [] },
          },
        },
      };
    });
    await svc.load();
    const detail = await svc.detail({ repo: 'acme-api', number: 7 }, () => undefined);
    expect(detail.comments.map((c) => c.id)).toEqual(['c-1', 'c-101']);
  });
});

describe('repo metadata duplicates', () => {
  const user = (n: number) => ({ id: `U_${n}`, login: `user-${n}` });
  const ms = (n: number) => ({ id: `M_${n}`, title: `m${n}` });
  const label = (n: number) => ({ id: `L_${n}`, name: `label-${n}`, color: 'aaaaaa' });

  it('does not repeat finished connections while labels page', async () => {
    const calls: Record<string, unknown>[] = [];
    const svc = service((_q, vars) => {
      calls.push(vars);
      const second = vars.labelsAfter === 'c1';
      return {
        repository: {
          labels: vars.wantLabels
            ? second
              ? { pageInfo: done, nodes: [label(2)] }
              : { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [label(1)] }
            : undefined,
          milestones: vars.wantMilestones ? { pageInfo: done, nodes: [ms(1), ms(2)] } : undefined,
          assignableUsers: vars.wantUsers ? { pageInfo: done, nodes: [user(1), user(2), user(3)] } : undefined,
          issueTemplates: [],
        },
      };
    });
    const meta = await svc.repoMeta('acme-api');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ wantLabels: true, wantMilestones: false, wantUsers: false });
    expect(meta.users.map((u) => u.id)).toEqual(['U_1', 'U_2', 'U_3']);
    expect(meta.milestones.map((m) => m.id)).toEqual(['M_1', 'M_2']);
    expect(meta.labels.map((l) => l.id)).toEqual(['L_1', 'L_2']);
  });

  it('ignores nodes of a finished connection even if returned again', async () => {
    const svc = service((_q, vars) => ({
      repository: {
        labels: vars.labelsAfter === 'c1' ? { pageInfo: done, nodes: [label(2)] } : { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [label(1)] },
        milestones: { pageInfo: done, nodes: [ms(1)] },
        assignableUsers: { pageInfo: done, nodes: [user(1)] },
        issueTemplates: [],
      },
    }));
    const meta = await svc.repoMeta('acme-api');
    expect(meta.users).toHaveLength(1);
    expect(meta.milestones).toHaveLength(1);
    expect(meta.labels).toHaveLength(2);
  });

  it('dedupes cached meta', async () => {
    const cache = new IssueCache();
    await cache.putMeta({
      repo: 'acme-api',
      labels: [label(1), label(1), label(2)],
      milestones: [ms(1), ms(1)],
      users: [user(1), user(2), user(1), user(2)],
      fetchedAt: 1000,
    });
    const client = { graphql: async () => { throw new Error('no fetch expected'); } } as unknown as GithubClient;
    const svc = new IssueService(client, new SeenStore(null), cache, () => 1000, new ProjectConfig());
    const meta = await svc.repoMeta('acme-api');
    expect(meta.users.map((u) => u.id)).toEqual(['U_1', 'U_2']);
    expect(meta.milestones).toHaveLength(1);
    expect(meta.labels).toHaveLength(2);
  });
});
