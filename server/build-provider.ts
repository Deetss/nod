import { DiskCache } from './disk-cache';
import { join } from 'node:path';
import { cacheDir } from './app-paths';
import { ImageStore } from './image-store';
import { FixtureProvider } from './fixture-provider';
import { IssueCache } from './issue-cache';
import { GithubClient } from './github-client';
import { GithubConnection } from './connection';
import { GithubProvider, runGh } from './github-provider';
import { PrCache } from './pr-cache';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { ProjectConfig } from './project-config';
import type { Provider } from './provider';
import { consoleSink } from './request-log';
import { RulesetBypass } from './ruleset-bypass';
import { SeenStore } from './seen';

/**
 * Fixture data or the live GitHub provider. Without a token the live provider still starts, in
 * the `none` state, and Settings > GitHub shows how to connect.
 */
export async function buildProvider(fixtures: boolean, settings: Settings = DEFAULT_SETTINGS): Promise<Provider> {
  if (fixtures) return new FixtureProvider(settings);
  const client = new GithubClient('');
  const connection = new GithubConnection(client);
  const { connection: first } = await connection.check();
  if (first.state === 'none') console.log('No GitHub token. Open Settings > GitHub in Nod to connect.');
  const disk = new DiskCache();
  const project = new ProjectConfig(settings, disk, consoleSink);
  return new GithubProvider(
    client,
    new SeenStore(),
    runGh,
    new PrCache(disk),
    undefined,
    undefined,
    new IssueCache(disk),
    project,
    connection,
    new RulesetBypass(client, disk),
    new ImageStore(join(cacheDir(), 'images')),
  );
}
