import { describe, expect, it } from 'vitest';
import type { IssueSummary } from '../shared/issue-types';
import { PROJECT_STATUSES } from '../shared/project-status';
import type { GithubClient } from '../server/github-client';
import { IssueCache } from '../server/issue-cache';
import { projectFields, toIssueSummary, type RawIssue } from '../server/issue-map';
import { ISSUE_INBOX_QUERY } from '../server/issue-queries';
import { IssueService } from '../server/issue-service';
import { applyIssuesFull } from '../server/issue-state';
import {
  ProjectConfig,
  resolveProject,
  type ProjectMetaResponse,
  type ResolvedProject,
} from '../server/project-config';
import type { SeenStore } from '../server/seen';
import { loadSettings } from '../server/settings';
import { DEFAULT_SETTINGS } from '../shared/settings';

const OPTIONS: { id: string; name: string }[] = PROJECT_STATUSES.map((name, i) => ({ id: `opt${i}`, name }));

const meta = (options = OPTIONS): ProjectMetaResponse => ({
  organization: { projectV2: { id: 'PVT_1', field: { id: 'FLD_1', options } } },
});

describe('project option resolution by name', () => {
  it('maps every status name to its option id, whatever the order', () => {
    const logs: string[] = [];
    const reversed = [...OPTIONS].reverse();
    const r = resolveProject(meta(reversed), DEFAULT_SETTINGS, (l) => logs.push(l));
    expect(r?.projectId).toBe('PVT_1');
    expect(r?.fieldId).toBe('FLD_1');
    expect(r?.options['In progress']).toBe('opt2');
    expect(r?.options.Done).toBe('opt4');
    expect(logs).toEqual([]);
  });

  it('hides the feature with one log line when an option is renamed', () => {
    const logs: string[] = [];
    const renamed = OPTIONS.map((o) => (o.name === 'In progress' ? { ...o, name: 'Doing' } : o));
    expect(resolveProject(meta(renamed), DEFAULT_SETTINGS, (l) => logs.push(l))).toBeUndefined();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('In progress');
  });

  it('hides the feature when the Status field or the project is missing', () => {
    const logs: string[] = [];
    const noField: ProjectMetaResponse = { organization: { projectV2: { id: 'P', field: null } } };
    const noProject: ProjectMetaResponse = { organization: { projectV2: null } };
    expect(resolveProject(noField, DEFAULT_SETTINGS, (l) => logs.push(l))).toBeUndefined();
    expect(resolveProject(noProject, DEFAULT_SETTINGS, (l) => logs.push(l))).toBeUndefined();
    expect(logs).toHaveLength(2);
  });

  it('reads projectNumber from the settings file, defaulting to 1', async () => {
    expect((await loadSettings('/nonexistent/app-settings.json')).project.number).toBe(1);
  });
});

describe('ProjectConfig refresh', () => {
  const client = (answer: () => unknown) =>
    ({ graphql: async () => answer() }) as unknown as GithubClient;

  it('resolves, then hides after a rename on the next refresh', async () => {
    const logs: string[] = [];
    const cfg = new ProjectConfig({ ...DEFAULT_SETTINGS, orgs: ['acme-co'] }, undefined, (l) => logs.push(l));
await cfg.refresh(client(() => meta()));
    expect(cfg.enabled).toBe(true);
    const renamed = OPTIONS.map((o) => (o.name === 'Ready' ? { ...o, name: 'To do' } : o));
    await cfg.refresh(client(() => meta(renamed)));
    expect(cfg.enabled).toBe(false);
    expect(logs).toHaveLength(1);
  });

  it('keeps the last good ids when the lookup request fails', async () => {
    const logs: string[] = [];
    const cfg = new ProjectConfig({ ...DEFAULT_SETTINGS, orgs: ['acme-co'] }, undefined, (l) => logs.push(l));
await cfg.refresh(client(() => meta()));
    await cfg.refresh(
      client(() => {
        throw new Error('boom');
      }),
    );
    expect(cfg.enabled).toBe(true);
    expect(logs[0]).toContain('boom');
  });
});

function raw(over: Partial<RawIssue> = {}): RawIssue {
  return {
    id: 'I_1',
    number: 7,
    title: 't',
    url: 'u',
    state: 'OPEN',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    repository: { name: 'acme-api' },
    author: { login: 'me' },
    labels: { nodes: [] },
    assignees: { nodes: [] },
    commentCount: { totalCount: 0 },
    ...over,
  };
}

describe('project fields on an issue', () => {
  it('reads the status of the configured project only', () => {
    const r = raw({
      projectItems: {
        nodes: [
          { id: 'ITEM_9', project: { number: 9 }, fieldValueByName: { name: 'Done', optionId: 'x' } },
          { id: 'ITEM_1', project: { number: 1 }, fieldValueByName: { name: 'In progress', optionId: 'y' } },
        ],
      },
    });
    expect(projectFields(r, DEFAULT_SETTINGS)).toEqual({ projectItemId: 'ITEM_1', status: 'In progress' });
    expect(toIssueSummary(r, { ...DEFAULT_SETTINGS, project: { ...DEFAULT_SETTINGS.project, number: 9 } }).status).toBe(
      'Done',
    );
  });

  it('leaves status unset when not on the project or the value is unknown', () => {
    expect(projectFields(raw(), DEFAULT_SETTINGS)).toEqual({});
    const odd = raw({
      projectItems: { nodes: [{ id: 'I', project: { number: 1 }, fieldValueByName: { name: 'Blocked' } }] },
    });
    expect(projectFields(odd, DEFAULT_SETTINGS)).toEqual({ projectItemId: 'I' });
  });

  it('asks for the status in the sync query', () => {
    expect(ISSUE_INBOX_QUERY).toContain('projectItems(first: 5)');
    expect(ISSUE_INBOX_QUERY).toContain('fieldValueByName(name: $statusField)');
  });
});

describe('Start work order', () => {
  const resolved: ResolvedProject = {
    number: 1,
    projectId: 'PVT_1',
    fieldId: 'FLD_1',
    options: Object.fromEntries(OPTIONS.map((o) => [o.name, o.id])) as ResolvedProject['options'],
  };

  async function setup(issue: Partial<IssueSummary>) {
    const ops: { op: string; vars: Record<string, unknown> }[] = [];
    const client = {
      graphqlRate: undefined,
      lastRate: undefined,
      graphql: async (query: string, vars: Record<string, unknown>) => {
        const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? '?';
        ops.push({ op, vars });
        if (op === 'RepoMeta') {
          return {
            repository: {
              labels: { nodes: [] },
              milestones: { nodes: [] },
              assignableUsers: { nodes: [{ id: 'U_me', login: 'me' }] },
              issueTemplates: [],
            },
          };
        }
        if (op === 'AddProjectItem') return { addProjectV2ItemById: { item: { id: 'ITEM_new' } } };
        return {};
      },
    } as unknown as GithubClient;
    const project = new ProjectConfig();
    project.resolved = resolved;
    const svc = new IssueService(client, {} as SeenStore, new IssueCache(), () => 1000, project);
    await svc.load();
    const base: IssueSummary = {
      id: 'I_1',
      repo: 'acme-co/acme-api',
      number: 7,
      title: 't',
      author: 'me',
      createdAt: '2026-11-06T10:00:00Z',
      updatedAt: '2026-11-06T10:00:00Z',
      url: 'u',
      state: 'open',
      labels: [],
      assignees: [],
      commentCount: 0,
      seen: 'seen',
      ...issue,
    };
    svc.state = applyIssuesFull(svc.state, 'me', [base], [], 1000);
    return { svc, ops };
  }

  const writes = (ops: { op: string }[]) =>
    ops.map((o) => o.op).filter((o) => o !== 'RepoMeta');

  it('assigns, then adds the item, then sets the field', async () => {
    const { svc, ops } = await setup({});
    const res = await svc.act({ type: 'start', repo: 'acme-co/acme-api', number: 7 });
    expect(res.ok).toBe(true);
    expect(writes(ops)).toEqual(['AddAssignees', 'AddProjectItem', 'SetProjectStatus']);
    const set = ops.find((o) => o.op === 'SetProjectStatus')?.vars;
    expect(set).toEqual({ project: 'PVT_1', item: 'ITEM_new', field: 'FLD_1', option: 'opt2' });
    const listed = svc.state.issues.I_1;
    expect(listed?.status).toBe('In progress');
    expect(listed?.assignees).toEqual(['me']);
    expect(listed?.projectItemId).toBe('ITEM_new');
  });

  it('skips the assignment and the add when both are already done', async () => {
    const { svc, ops } = await setup({ assignees: ['me'], projectItemId: 'ITEM_1', status: 'Ready' });
    await svc.act({ type: 'start', repo: 'acme-co/acme-api', number: 7 });
    expect(writes(ops)).toEqual(['SetProjectStatus']);
    expect(ops.find((o) => o.op === 'SetProjectStatus')?.vars.item).toBe('ITEM_1');
  });

  it('only adds the item when assigned and not on the project', async () => {
    const { svc, ops } = await setup({ assignees: ['me'] });
    await svc.act({ type: 'start', repo: 'acme-co/acme-api', number: 7 });
    expect(writes(ops)).toEqual(['AddProjectItem', 'SetProjectStatus']);
  });

  it('sends nothing when already In progress and assigned', async () => {
    const { svc, ops } = await setup({ assignees: ['me'], projectItemId: 'ITEM_1', status: 'In progress' });
    await svc.act({ type: 'start', repo: 'acme-co/acme-api', number: 7 });
    expect(writes(ops)).toEqual([]);
  });

  it('stop sets Ready and keeps the assignee', async () => {
    const { svc, ops } = await setup({ assignees: ['me'], projectItemId: 'ITEM_1', status: 'In progress' });
    await svc.act({ type: 'stop', repo: 'acme-co/acme-api', number: 7 });
    expect(writes(ops)).toEqual(['SetProjectStatus']);
    expect(ops[0]?.vars.option).toBe('opt1');
    expect(svc.state.issues.I_1?.assignees).toEqual(['me']);
    expect(svc.state.issues.I_1?.status).toBe('Ready');
  });

  it('refuses to write when the project did not resolve', async () => {
    const { svc } = await setup({});
    svc.project.resolved = undefined;
    await expect(svc.act({ type: 'start', repo: 'acme-co/acme-api', number: 7 })).rejects.toThrow(/not available/);
  });
});
