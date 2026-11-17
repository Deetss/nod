import { DiskCache, fileKey } from './disk-cache';
import { ApiError, type GithubClient, type Stored } from './github-client';

/** A ruleset answer stays fresh this long. */
export const RULESET_TTL_MS = 60 * 60_000;

/** `current_user_can_bypass` values that let the viewer skip a ruleset's required review. */
const BYPASS_VALUES: ReadonlySet<string> = new Set(['always', 'pull_requests_only', 'exempt']);

export interface RulesetVerdict {
  bypass: boolean;
  /** The highest `required_approving_review_count` among the kept rules. */
  required: number;
}

const NO_BYPASS: RulesetVerdict = { bypass: false, required: 0 };

interface RuleRow {
  rulesetId: number;
  required: number;
}

interface RawRule {
  type?: string;
  ruleset_id?: number;
  parameters?: { required_approving_review_count?: number };
}

interface Entry {
  at: number;
  verdict: RulesetVerdict;
  /** Each REST body with its ETag, by path, so a later lookup sends If-None-Match. */
  bodies: Record<string, Stored<unknown>>;
}

type Client = Pick<GithubClient, 'restConditional'>;

/** The branch's pull_request rules that require at least one approval. */
function reviewRules(raw: RawRule[]): RuleRow[] {
  return (Array.isArray(raw) ? raw : []).flatMap((r) => {
    const required = r.parameters?.required_approving_review_count ?? 0;
    return r.type === 'pull_request' && required >= 1 && typeof r.ruleset_id === 'number'
      ? [{ rulesetId: r.ruleset_id, required }]
      : [];
  });
}

/**
 * Whether a repository ruleset lets the viewer skip the required review on a base branch.
 * Memory first, disk behind it, one hour per `repo@base`. A 403 or 404 caches no bypass;
 * a 5xx, network or rate-limit error answers no bypass without caching, so the next load retries.
 */
export class RulesetBypass {
  private readonly mem = new Map<string, Entry>();

  constructor(
    private readonly client: Client,
    private readonly disk: DiskCache = new DiskCache(null),
    private readonly now: () => number = Date.now,
  ) {}

  private file(key: string): string {
    return `ruleset-bypass/${fileKey(key)}.json`;
  }

  private async entry(key: string): Promise<Entry | undefined> {
    const hit = this.mem.get(key);
    if (hit) return hit;
    const stored = await this.disk.read<Entry>(this.file(key));
    if (stored) this.mem.set(key, stored);
    return stored;
  }

  private async save(key: string, entry: Entry): Promise<void> {
    this.mem.set(key, entry);
    await this.disk.write(this.file(key), entry);
  }

  /** `fresh` skips the TTL; the ETags still go out, so an unchanged answer costs nothing. */
  async check(repo: string, base: string, opts: { fresh?: boolean } = {}): Promise<RulesetVerdict> {
    const key = `${repo}@${base}`;
    const prev = await this.entry(key);
    if (prev && !opts.fresh && this.now() - prev.at < RULESET_TTL_MS) return prev.verdict;
    const bodies: Record<string, Stored<unknown>> = {};
    const get = async <T, R>(path: string, pick: (raw: R) => T): Promise<T> => {
      const got = await this.client.restConditional<T, R>(path, prev?.bodies[path] as Stored<T> | undefined, pick);
      bodies[path] = got;
      return got.body;
    };
    try {
      const verdict = await this.lookup(repo, base, get);
      await this.save(key, { at: this.now(), verdict, bodies });
      return verdict;
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'http' && (e.status === 403 || e.status === 404)) {
        await this.save(key, { at: this.now(), verdict: NO_BYPASS, bodies });
      }
      return NO_BYPASS;
    }
  }

  /** Forgets `repo@base`, after GitHub refused a merge the cache said it would allow. */
  async drop(repo: string, base: string): Promise<void> {
    const key = `${repo}@${base}`;
    this.mem.delete(key);
    await this.disk.remove(this.file(key));
  }

  private async lookup(
    repo: string,
    base: string,
    get: <T, R>(path: string, pick: (raw: R) => T) => Promise<T>,
  ): Promise<RulesetVerdict> {
    const rules = await get<RuleRow[], RawRule[]>(
      `/repos/${repo}/rules/branches/${encodeURIComponent(base)}?per_page=100`,
      reviewRules,
    );
    const ids = [...new Set(rules.map((r) => r.rulesetId))];
    if (ids.length === 0) return NO_BYPASS;
    const required = Math.max(...rules.map((r) => r.required));
    for (const id of ids) {
      const can = await get<string | null, { current_user_can_bypass?: string }>(
        `/repos/${repo}/rulesets/${id}`,
        (raw) => raw.current_user_can_bypass ?? null,
      );
      if (can === null || !BYPASS_VALUES.has(can)) return { bypass: false, required };
    }
    return { bypass: true, required };
  }
}
