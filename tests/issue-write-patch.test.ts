import { describe, expect, it } from 'vitest';
import type { IssueSummary } from '../shared/issue-types';
import type { GithubClient } from '../server/github-client';
import { IssueCache } from '../server/issue-cache';
import { IssueService } from '../server/issue-service';
import { applyIssuesFull } from '../server/issue-state';
import { ProjectConfig } from '../server/project-config';
import type { SeenStore } from '../server/seen';

async function setup(issue: Partial<IssueSummary> = {}) {
  const client = {
    graphqlRate: undefined,
    lastRate: undefined,
    graphql: async (query: string) => {
      if (/query\s+RepoMeta/.test(query)) {
        return {
          repository: {
            labels: { nodes: [{ id: 'L_bug', name: 'bug', color: 'ff0000' }, { id: 'L_ui', name: 'ui', color: '00ff00' }] },
            milestones: { nodes: [] },
            assignableUsers: { nodes: [{ id: 'U_me', login: 'me' }, { id: 'U_ann', login: 'ann' }] },
            issueTemplates: [],
          },
        };
      }
      return {};
    },
  } as unknown as GithubClient;
  const svc = new IssueService(client, {} as SeenStore, new IssueCache(), () => 1000, new ProjectConfig());
  await svc.load();
  const base: IssueSummary = {
    id: 'I_1',
    repo: 'acme-api',
    number: 7,
    title: 'old title',
    author: 'me',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    url: 'u',
    state: 'open',
    labels: [{ name: 'bug', color: 'ff0000' }],
    assignees: ['ann'],
    commentCount: 0,
    seen: 'seen',
    ...issue,
  };
  svc.state = applyIssuesFull(svc.state, 'me', [base], ['I_1'], 1000);
  return svc;
}

const at = { repo: 'acme-api', number: 7 };

describe('listed copy after an issue write', () => {
  it('drops a closed issue from the open list and its mentions', async () => {
    const svc = await setup();
    await svc.act({ type: 'close', ...at, reason: 'COMPLETED' });
    expect(svc.state.issues.I_1).toBeUndefined();
    expect(svc.state.mentioned).toEqual([]);
    expect(svc.state.closed['acme-api#7']).toBe(1000);
  });

  it('shows a new title in the list', async () => {
    const svc = await setup();
    await svc.act({ type: 'title', ...at, title: 'new title' });
    expect(svc.state.issues.I_1?.title).toBe('new title');
  });

  it('updates label chips, matching names ignoring case', async () => {
    const svc = await setup();
    await svc.act({ type: 'labels', ...at, add: ['UI'], remove: ['bug'] });
    expect(svc.state.issues.I_1?.labels).toEqual([{ name: 'ui', color: '00ff00' }]);
  });

  it('updates assignees', async () => {
    const svc = await setup();
    await svc.act({ type: 'assignees', ...at, add: ['me'], remove: ['ann'] });
    expect(svc.state.issues.I_1?.assignees).toEqual(['me']);
  });
});
