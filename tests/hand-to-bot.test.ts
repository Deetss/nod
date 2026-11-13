import { describe, expect, it } from 'vitest';
import type { IssueSummary } from '../shared/issue-types';
import type { GithubClient } from '../server/github-client';
import { IssueCache } from '../server/issue-cache';
import { IssueService } from '../server/issue-service';
import { applyIssuesFull } from '../server/issue-state';
import { ProjectConfig } from '../server/project-config';
import type { SeenStore } from '../server/seen';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { TEST_SETTINGS } from './bot-settings';

type Vars = Record<string, unknown>;

async function setup(
  labels: { id: string; name: string; color: string }[],
  failOn?: RegExp,
  settings: Settings = TEST_SETTINGS,
) {
  const calls: { query: string; vars: Vars }[] = [];
  const client = {
    graphqlRate: undefined,
    lastRate: undefined,
    graphql: async (query: string, vars: Vars = {}) => {
      calls.push({ query, vars });
      if (failOn?.test(query)) throw new Error('forbidden');
      if (/query\s+RepoMeta/.test(query)) {
        return {
          repository: { labels: { nodes: labels }, milestones: { nodes: [] }, assignableUsers: { nodes: [] }, issueTemplates: [] },
        };
      }
      if (/query\s+RepoId/.test(query)) return { repository: { id: 'R_1' } };
      if (/mutation\s+CreateLabel/.test(query)) {
        return { createLabel: { label: { id: 'L_bot', name: vars.name, color: vars.color } } };
      }
      return {};
    },
  } as unknown as GithubClient;
  const svc = new IssueService(client, {} as SeenStore, new IssueCache(), () => 1000, new ProjectConfig(settings));
  await svc.load();
  const issue: IssueSummary = {
    id: 'I_42',
    repo: 'acme-web',
    number: 42,
    title: 'Checkout page flickers on resize',
    author: 'me',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    url: 'u',
    state: 'open',
    labels: [],
    assignees: [],
    commentCount: 0,
    seen: 'seen',
  };
  svc.state = applyIssuesFull(svc.state, 'me', [issue], ['I_42'], 1000);
  return { svc, calls };
}

const at = { repo: 'acme-web', number: 42 };
const of = (calls: { query: string; vars: Vars }[], re: RegExp) => calls.filter((c) => re.test(c.query));

describe('hand to Bot', () => {
  it('creates the bot label when the repo lacks it, then adds it', async () => {
    const { svc, calls } = await setup([{ id: 'L_bug', name: 'bug', color: 'ff0000' }]);
    const res = await svc.act({ type: 'bot', ...at });
    expect(res).toMatchObject({ ok: true, message: 'Bot picked up acme-web #42' });
    const made = of(calls, /mutation\s+CreateLabel/);
    expect(made).toHaveLength(1);
    expect(made[0]?.vars).toMatchObject({ name: 'bot', color: '1f6feb', description: 'Hand this issue to Bot' });
    const added = of(calls, /mutation\s+AddLabels/);
    expect(added[0]?.vars).toEqual({ id: 'I_42', labels: ['L_bot'] });
    expect(svc.state.issues.I_42?.labels.map((l) => l.name)).toEqual(['bot']);
  });

  it('skips creating the label when it exists, compared case-blind', async () => {
    const { svc, calls } = await setup([{ id: 'L_old', name: 'Bot', color: '0000ff' }]);
    await svc.act({ type: 'bot', ...at });
    expect(of(calls, /mutation\s+CreateLabel/)).toHaveLength(0);
    expect(of(calls, /mutation\s+AddLabels/)[0]?.vars).toEqual({ id: 'I_42', labels: ['L_old'] });
  });

  it('reports a clear error when creating the label fails', async () => {
    const { svc, calls } = await setup([], /mutation\s+CreateLabel/);
    await expect(svc.act({ type: 'bot', ...at })).rejects.toThrow(/could not create the bot label \(forbidden\)/);
    expect(of(calls, /mutation\s+AddLabels/)).toHaveLength(0);
  });

  it('reports a clear error when adding the label fails', async () => {
    const { svc } = await setup([{ id: 'L_old', name: 'bot', color: '0000ff' }], /mutation\s+AddLabels/);
    await expect(svc.act({ type: 'bot', ...at })).rejects.toThrow(/could not add the bot label \(forbidden\)/);
  });

  it('uses the configured name, label and colour', async () => {
    const fixer = { enabled: true, name: 'Fixer', command: '/fixer', label: 'fixer', labelColor: 'aa00ff', login: '', marker: 'bot' };
    const { svc, calls } = await setup([], undefined, { ...DEFAULT_SETTINGS, bot: fixer });
    const res = await svc.act({ type: 'bot', ...at });
    expect(res.message).toBe('Fixer picked up acme-web #42');
    expect(of(calls, /mutation\s+CreateLabel/)[0]?.vars).toMatchObject({
      name: 'fixer',
      color: 'aa00ff',
      description: 'Hand this issue to Fixer',
    });
  });

  it('refuses when no bot is configured', async () => {
    const { svc, calls } = await setup([], undefined, DEFAULT_SETTINGS);
    await expect(svc.act({ type: 'bot', ...at })).rejects.toThrow(/no bot is configured/);
    expect(of(calls, /mutation/)).toHaveLength(0);
  });
});
