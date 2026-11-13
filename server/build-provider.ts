import { DiskCache } from './disk-cache';
import { FixtureProvider } from './fixture-provider';
import { IssueCache } from './issue-cache';
import { GithubClient } from './github-client';
import { GithubProvider, runGh } from './github-provider';
import { PrCache } from './pr-cache';
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings';
import { ProjectConfig } from './project-config';
import type { Provider } from './provider';
import { consoleSink } from './request-log';
import { SeenStore } from './seen';
import { readGhToken } from './token';

/** Fixture data or the live GitHub provider. Throws when no token can be read. */
export async function buildProvider(fixtures: boolean, settings: Settings = DEFAULT_SETTINGS): Promise<Provider> {
  if (fixtures) return new FixtureProvider(settings);
  const client = new GithubClient(await readGhToken());
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
  );
}
