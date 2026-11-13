import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminMergeArgs, mergeFlags } from '../shared/pr-actions';
import { DEFAULT_SETTINGS, statusNames } from '../shared/settings';
import { mergeMethodFor } from '../shared/types';
import { FixtureProvider } from '../server/fixture-provider';
import { dispatchBodyFor } from '../server/orca';
import { resolveProject, type ProjectMetaResponse } from '../server/project-config';
import { fullSearch } from '../server/queries';
import { loadSettings } from '../server/settings';

const CUSTOM = {
  orgs: ['Acme-Builders'],
  releaseMerge: { base: 'trunk', head: 'release', titleContains: 'ship it' },
  project: {
    number: 7,
    statusField: 'Stage',
    options: { backlog: 'Icebox', ready: 'Next', inProgress: 'Doing', inReview: 'Checking', done: 'Shipped' },
  },
  orcaAgents: ['claude', 'aider'],
  bot: { enabled: true, name: 'Fixer', command: '/fixer', label: 'fixer', labelColor: 'aa00ff', login: 'fixer-app', marker: 'fixer' },
  push: { contact: 'mailto:ops@acme.example' },
  android: { packageId: 'example.acme.inbox' },
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nod-settings-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(text: string): Promise<string> {
  const path = join(dir, 'app-settings.json');
  await writeFile(path, text);
  return path;
}

describe('non-default settings file', () => {
  it('loads every key', async () => {
    const s = await loadSettings(await write(JSON.stringify(CUSTOM)));
    expect(s).toEqual(CUSTOM);
  });

  it('builds the search query for the configured org', async () => {
    const s = await loadSettings(await write(JSON.stringify(CUSTOM)));
    expect(fullSearch(s.orgs)).toBe('is:open is:pr org:Acme-Builders');
  });

  it('chooses the merge method from the configured release rule', async () => {
    const s = await loadSettings(await write(JSON.stringify(CUSTOM)));
    expect(mergeMethodFor('Ship it: v2', 'trunk', 'release', s)).toBe('merge');
    expect(mergeMethodFor('release staging to main', 'main', 'staging', s)).toBe('squash');
    expect(mergeFlags({ title: 'Ship it', base: 'trunk', head: 'release' }, s)).toEqual(['--merge']);
    expect(mergeFlags({ title: 'Ship it', base: 'trunk', head: 'feature' }, s)).toEqual([
      '--squash',
      '--delete-branch',
    ]);
    const args = adminMergeArgs('Acme-Builders/api', 5, { title: 'Ship it', base: 'trunk', head: 'release' }, s);
    expect(args).toContain('Acme-Builders/api');
    expect(args).toContain('--merge');
  });

  it('resolves status options by the configured names', async () => {
    const s = await loadSettings(await write(JSON.stringify(CUSTOM)));
    const options = statusNames(s).map((name, i) => ({ id: `opt${i}`, name }));
    const meta: ProjectMetaResponse = {
      organization: { projectV2: { id: 'PVT_7', field: { id: 'FLD_7', options } } },
    };
    const logs: string[] = [];
    const r = resolveProject(meta, s, (l) => logs.push(l));
    expect(r?.options.Doing).toBe('opt2');
    expect(r?.options.Shipped).toBe('opt4');
    expect(logs).toEqual([]);
    expect(resolveProject(meta, DEFAULT_SETTINGS, () => undefined)).toBeUndefined();
  });

  it('limits Orca dispatch to the configured agents', async () => {
    const s = await loadSettings(await write(JSON.stringify(CUSTOM)));
    const schema = dispatchBodyFor(s.orcaAgents);
    const body = { repo: 'Acme-Builders/api', number: 1, name: 'fix-it', prompt: 'Fix it' };
    expect(schema.safeParse({ ...body, agent: 'aider' }).success).toBe(true);
    expect(schema.safeParse({ ...body, agent: 'codex' }).success).toBe(false);
  });

  it('migrates a legacy org to orgs', async () => {
    const { org: _legacy, orgs: _orgs, ...rest } = CUSTOM as typeof CUSTOM & { org?: string };
    const s = await loadSettings(await write(JSON.stringify({ ...rest, org: 'Acme-Builders' })));
    expect(s.orgs).toEqual(['Acme-Builders']);
    expect('org' in s).toBe(false);
  });

  it('keeps orgs when both keys are set', async () => {
    const s = await loadSettings(await write(JSON.stringify({ ...CUSTOM, org: 'Old' })));
    expect(s.orgs).toEqual(['Acme-Builders']);
  });

  it('serves fixtures under two owners, whatever the orgs setting says', async () => {
    const s = await loadSettings(await write(JSON.stringify(CUSTOM)));
    const inbox = await new FixtureProvider(s).inbox(undefined);
    const owners = new Set(inbox.prs.map((p) => p.url.split('/')[3]));
    expect([...owners].sort()).toEqual(['acme-co', 'acme-dev']);
    expect(inbox.prs.every((p) => p.url.startsWith(`https://github.com/${p.repo}/`))).toBe(true);
  });
});

describe('broken settings file', () => {
  it('falls back to defaults on invalid JSON and logs one line', async () => {
    const logs: string[] = [];
    const s = await loadSettings(await write('{ not json'), (l) => logs.push(l));
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(logs).toHaveLength(1);
  });

  it('falls back to defaults on a value that fails validation and logs one line', async () => {
    const logs: string[] = [];
    const bad = { ...CUSTOM, orgs: ['not a valid org!'] };
    const s = await loadSettings(await write(JSON.stringify(bad)), (l) => logs.push(l));
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(logs).toHaveLength(1);
  });

  it('uses defaults silently when the file is missing', async () => {
    const logs: string[] = [];
    expect(await loadSettings(join(dir, 'none.json'), (l) => logs.push(l))).toEqual(DEFAULT_SETTINGS);
    expect(logs).toEqual([]);
  });
});
