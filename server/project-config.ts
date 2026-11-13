import type { ProjectStatus } from '../shared/project-status';
import { DEFAULT_SETTINGS, statusNames, type Settings } from '../shared/settings';
import { DiskCache } from './disk-cache';
import type { GithubClient } from './github-client';
import { PROJECT_META_QUERY } from './issue-queries';
import type { LogSink } from './request-log';

const CACHE_FILE = 'project.json';

/** Ids of the project, its Status field and each option, looked up by name. */
export interface ResolvedProject {
  number: number;
  projectId: string;
  fieldId: string;
  /** Option id by option name. */
  options: Record<ProjectStatus, string>;
}

export interface ProjectMetaResponse {
  organization: {
    projectV2: {
      id: string;
      field: { id?: string; options?: { id: string; name: string }[] } | null;
    } | null;
  } | null;
}

/**
 * Resolves option ids by name. Returns undefined, with one log line, when the project,
 * the field or any of the five options is missing (for example a renamed option).
 */
export function resolveProject(
  data: ProjectMetaResponse,
  settings: Settings,
  log: LogSink,
): ResolvedProject | undefined {
  const { number, statusField } = settings.project;
  const names = statusNames(settings);
  const project = data.organization?.projectV2;
  if (!project) {
    log(`[project] #${number} not found in ${settings.orgs.join(', ')}; project status hidden`);
    return undefined;
  }
  const field = project.field;
  if (!field?.id || !field.options) {
    log(`[project] #${number} has no single-select field "${statusField}"; project status hidden`);
    return undefined;
  }
  const byName = new Map(field.options.map((o) => [o.name, o.id]));
  const missing = names.filter((s) => !byName.has(s));
  if (missing.length > 0) {
    log(`[project] #${number} Status option missing: ${missing.join(', ')}; project status hidden`);
    return undefined;
  }
  const options = Object.fromEntries(names.map((s) => [s, byName.get(s)])) as Record<ProjectStatus, string>;
  return { number, projectId: project.id, fieldId: field.id, options };
}

/** The resolved project, cached on disk and refreshed on each full sweep. */
export class ProjectConfig {
  resolved: ResolvedProject | undefined;
  private loaded = false;

  constructor(
    readonly settings: Settings = DEFAULT_SETTINGS,
    private readonly disk: DiskCache = new DiskCache(null),
    private readonly log: LogSink = () => undefined,
  ) {}

  get number(): number {
    return this.settings.project.number;
  }

  get enabled(): boolean {
    return this.resolved !== undefined;
  }

  /** Reads the saved ids so the first render needs no request. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const saved = await this.disk.read<ResolvedProject>(CACHE_FILE);
    const names = statusNames(this.settings);
    const sameOptions = saved !== undefined && names.every((n) => typeof saved.options?.[n] === 'string');
    if (saved && sameOptions && saved.number === this.number && saved.projectId && saved.fieldId) {
      this.resolved = saved;
    }
  }

  /** Looks the ids up again. A request failure keeps the last good ids. */
  async refresh(client: GithubClient): Promise<void> {
    await this.load();
    const org = this.settings.orgs[0];
    if (!org) return;
    let data: ProjectMetaResponse;
    try {
      data = await client.graphql<ProjectMetaResponse>(PROJECT_META_QUERY, {
        org,
        number: this.number,
        field: this.settings.project.statusField,
      });
    } catch (e) {
      this.log(`[project] lookup failed (${e instanceof Error ? e.message : 'error'}); keeping saved ids`);
      return;
    }
    this.resolved = resolveProject(data, this.settings, this.log);
    if (this.resolved) await this.disk.write(CACHE_FILE, this.resolved);
    else await this.disk.remove(CACHE_FILE);
  }
}
