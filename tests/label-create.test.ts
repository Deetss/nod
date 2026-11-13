import { describe, expect, it } from 'vitest';
import type { GithubClient } from '../server/github-client';
import { IssueCache } from '../server/issue-cache';
import { IssueService } from '../server/issue-service';
import { ProjectConfig } from '../server/project-config';
import type { SeenStore } from '../server/seen';

function setup(labels: { id: string; name: string; color: string }[]) {
  const calls: { query: string; vars: Record<string, unknown> }[] = [];
  let metaFetches = 0;
  const client = {
    graphqlRate: undefined,
    lastRate: undefined,
    graphql: async (query: string, vars: Record<string, unknown> = {}) => {
      calls.push({ query, vars });
      if (/query\s+RepoMeta/.test(query)) {
        metaFetches++;
        return {
          repository: {
            labels: { nodes: labels },
            milestones: { nodes: [] },
            assignableUsers: { nodes: [] },
            issueTemplates: [],
          },
        };
      }
      if (/query\s+RepoId/.test(query)) return { repository: { id: 'R_1' } };
      if (/mutation\s+CreateLabel/.test(query)) {
        return { createLabel: { label: { id: 'L_new', name: vars.name, color: vars.color } } };
      }
      return {};
    },
  } as unknown as GithubClient;
  const svc = new IssueService(client, {} as SeenStore, new IssueCache(), () => 1000, new ProjectConfig());
  return { svc, calls, metaFetches: () => metaFetches };
}

const created = (calls: { query: string; vars: Record<string, unknown> }[]) => calls.filter((c) => /mutation\s+CreateLabel/.test(c.query));

describe('createLabel', () => {
  it('creates a trimmed name with the default grey', async () => {
    const { svc, calls } = setup([{ id: 'L_1', name: 'flaky-ci', color: 'ff0000' }]);
    const res = await svc.act({ type: 'create-label', repo: 'acme-web', name: '  flaky  ' });
    expect(res.ok).toBe(true);
    expect(res.label).toEqual({ name: 'flaky', color: 'ededed' });
    expect(created(calls)[0]?.vars).toMatchObject({ repo: 'R_1', name: 'flaky', color: 'ededed' });
  });

  it('refuses an existing name compared case-blind', async () => {
    const { svc, calls } = setup([{ id: 'L_1', name: 'Flaky-CI', color: 'ff0000' }]);
    await expect(svc.act({ type: 'create-label', repo: 'acme-web', name: 'flaky-ci' })).rejects.toThrow(/already exists/);
    expect(created(calls)).toHaveLength(0);
  });

  it('rejects an empty or too long name', async () => {
    const { svc, calls } = setup([]);
    await expect(svc.createLabel('acme-web', '   ')).rejects.toThrow(/1 to 50/);
    await expect(svc.createLabel('acme-web', 'x'.repeat(51))).rejects.toThrow(/1 to 50/);
    expect(created(calls)).toHaveLength(0);
  });

  it('invalidates the repo meta so the next read refetches', async () => {
    const { svc, metaFetches } = setup([]);
    await svc.repoMeta('acme-web');
    await svc.repoMeta('acme-web');
    expect(metaFetches()).toBe(1);
    await svc.createLabel('acme-web', 'flaky');
    await svc.repoMeta('acme-web');
    expect(metaFetches()).toBe(2);
  });
});
