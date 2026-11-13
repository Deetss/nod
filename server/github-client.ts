import { contentsPath, REDIRECT_HOSTS, sniffImageType, type FetchedImage, type ImageTarget } from '../shared/image-url';
import { githubErrorText } from '../shared/pr-actions';
import type { RateInfo } from '../shared/types';
import { consoleSink, formatCall, operationName, type LogSink } from './request-log';

export type ApiErrorKind = 'ratelimit' | 'http' | 'network';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: ApiErrorKind,
    readonly status?: number,
    readonly resetAt?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type FetchLike = typeof fetch;

interface GraphqlResponse<T> {
  data?: T & { rateLimit?: RateInfo };
  errors?: { type?: string; message: string }[];
}

/** A REST body with the ETag GitHub sent for it. */
export interface Stored<T> {
  etag?: string;
  body: T;
}

const API = 'https://api.github.com';
const UPLOADS = 'https://uploads.github.com';
const UPLOAD_TIMEOUT_MS = 60_000;

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 15_000;
const IMAGE_MAX_HOPS = 4;

/** Reads a body up to the image size cap, stopping the download once it is passed. */
async function readCapped(res: Response): Promise<Uint8Array> {
  const tooLarge = () => new ApiError('Image is too large', 'http', 413);
  if (Number(res.headers.get('content-length')) > IMAGE_MAX_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > IMAGE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Thin GitHub client. The token stays inside this object. */
export class GithubClient {
  /** Newest rate numbers from any call. */
  lastRate: RateInfo | undefined;
  /** Newest numbers from a GraphQL query, the pool the top bar shows. */
  graphqlRate: RateInfo | undefined;

  /** Calls in flight, so identical concurrent reads share one request. */
  private readonly flights = new Map<string, Promise<unknown>>();

  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly log: LogSink = consoleSink,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'nod',
    };
  }

  private noteRate(res: Response): void {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining === null || limit === null || reset === null) return;
    this.lastRate = {
      limit: Number(limit),
      remaining: Number(remaining),
      resetAt: new Date(Number(reset) * 1000).toISOString(),
    };
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}`, {
        ...init,
        headers: { ...this.headers(), ...init.headers },
      });
    } catch (e) {
      throw new ApiError(e instanceof Error ? e.message : 'Network error', 'network');
    }
    this.noteRate(res);
    const limited =
      res.status === 429 ||
      (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
    if (limited) {
      throw new ApiError('GitHub rate limit reached', 'ratelimit', res.status, this.lastRate?.resetAt);
    }
    return res;
  }

  /** Concurrent callers with the same key share one promise. */
  private once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const live = this.flights.get(key);
    if (live) return live as Promise<T>;
    const p = run().finally(() => this.flights.delete(key));
    this.flights.set(key, p);
    return p;
  }

  /**
   * `label` tells apart calls that share one query, such as a full and a delta sync.
   * Identical concurrent queries share one request; mutations never do.
   */
  graphql<T>(query: string, variables: Record<string, unknown>, label?: string): Promise<T> {
    if (/^\s*mutation\b/.test(query)) return this.runGraphql<T>(query, variables, label);
    return this.once(`gql|${query}|${JSON.stringify(variables)}`, () =>
      this.runGraphql<T>(query, variables, label),
    );
  }

  private async runGraphql<T>(
    query: string,
    variables: Record<string, unknown>,
    label?: string,
  ): Promise<T> {
    const name = label ?? operationName(query);
    const res = await this.send('/graphql', {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new ApiError(`GitHub API error ${res.status}`, 'http', res.status);
    const json = (await res.json()) as GraphqlResponse<T>;
    const first = json.errors?.[0];
    if (first) {
      if (first.type === 'RATE_LIMITED') {
        throw new ApiError('GitHub rate limit reached', 'ratelimit', 200, this.lastRate?.resetAt);
      }
      throw new ApiError(first.message, 'http', 200);
    }
    if (!json.data) throw new ApiError('Empty GraphQL response', 'http', 200);
    const rate = json.data.rateLimit;
    if (rate) this.graphqlRate = rate;
    this.log(formatCall({ method: 'POST', target: name, cost: rate?.cost ?? 1, cache: 'miss' }));
    return json.data;
  }

  async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.send(path, init);
    const method = init.method ?? 'GET';
    if (!res.ok) {
      throw new ApiError(githubErrorText(res.status, await res.text().catch(() => '')), 'http', res.status);
    }
    this.log(formatCall({ method, target: path, cost: 1, cache: 'miss' }));
    // Some writes (the re-run endpoints) answer with an empty body.
    const text = await res.text();
    return (text === '' ? undefined : JSON.parse(text)) as T;
  }

  /** GitHub's rendered HTML for `text`. The response is text, not JSON, so it is not parsed. */
  async markdown(text: string, repo: string): Promise<string> {
    const res = await this.send('/markdown', {
      method: 'POST',
      body: JSON.stringify({ text, mode: 'gfm', context: repo }),
    });
    if (!res.ok) {
      throw new ApiError(githubErrorText(res.status, await res.text().catch(() => '')), 'http', res.status);
    }
    this.log(formatCall({ method: 'POST', target: '/markdown', cost: 1, cache: 'miss' }));
    return res.text();
  }

  /** Re-runs the failed jobs of a workflow run, or every job when `mode` is `all`. */
  rerunRun(owner: string, repo: string, runId: number, mode: 'failed' | 'all'): Promise<void> {
    const suffix = mode === 'failed' ? '/rerun-failed-jobs' : '/rerun';
    return this.rest<void>(`/repos/${owner}/${repo}/actions/runs/${runId}${suffix}`, { method: 'POST' });
  }

  /**
   * GET with If-None-Match when `prev` carries an ETag. A 304 costs no rate limit,
   * so the stored body is reused.
   */
  restConditional<T, R = T>(
    path: string,
    prev?: Stored<T>,
    pick: (raw: R) => T = (raw) => raw as unknown as T,
  ): Promise<Stored<T>> {
    return this.once(`get|${path}|${prev?.etag ?? ''}`, () => this.runConditional(path, prev, pick));
  }

  private async runConditional<T, R>(
    path: string,
    prev: Stored<T> | undefined,
    pick: (raw: R) => T,
  ): Promise<Stored<T>> {
    const headers: Record<string, string> = prev?.etag ? { 'If-None-Match': prev.etag } : {};
    const res = await this.send(path, { headers });
    if (res.status === 304 && prev) {
      this.log(formatCall({ method: 'GET', target: path, cost: 0, cache: 'hit' }));
      return prev;
    }
    if (!res.ok) throw new ApiError(`GitHub API error ${res.status}`, 'http', res.status);
    this.log(formatCall({ method: 'GET', target: path, cost: 1, cache: 'miss' }));
    const etag = res.headers.get('etag') ?? undefined;
    return { etag, body: pick((await res.json()) as R) };
  }

  /**
   * Uploads a comment image and returns its `github.com/user-attachments/assets/<id>` URL.
   * This is the endpoint `gh pr edit --attach` uses; GitHub does not document it. It needs
   * write access to the repo and answers 404 without it.
   */
  async uploadAsset(repositoryId: number, name: string, contentType: string, bytes: Uint8Array): Promise<string> {
    const q = new URLSearchParams({ name, content_type: contentType, repository_id: String(repositoryId) });
    const target = '/user-attachments/assets';
    let res: Response;
    try {
      res = await this.fetchImpl(`${UPLOADS}${target}?${q}`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/octet-stream' },
        body: bytes as Uint8Array<ArrayBuffer>,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError('Image upload failed: GitHub did not answer', 'network');
    }
    this.log(formatCall({ method: 'POST', target, cost: 1, cache: 'miss' }));
    if (res.status === 404) throw new ApiError('Uploading images needs write access to this repository', 'http', 404);
    if (res.status === 429) throw new ApiError('GitHub rate limit reached', 'ratelimit', 429);
    if (!res.ok) throw new ApiError(githubErrorText(res.status, await res.text().catch(() => '')), 'http', res.status);
    const url = ((await res.json().catch(() => ({}))) as { url?: unknown }).url;
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new ApiError('GitHub returned no image URL', 'http', 502);
    return url;
  }

  /**
   * Fetches an allowed image. Repo files go through the contents API with the token. Hosted
   * URLs carry their own signature and are fetched without it. An attachment URL gets the
   * token on its first hop only, and redirects may only land on GitHub image hosts.
   */
  async image(target: ImageTarget): Promise<FetchedImage> {
    const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
    let res: Response;
    try {
      res =
        target.kind === 'contents'
          ? await this.send(contentsPath(target), {
              headers: { Accept: 'application/vnd.github.raw+json' },
              signal,
            })
          : await this.follow(target.url, target.kind === 'attachment', signal);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError('Image fetch failed', 'network');
    }
    if (!res.ok) throw new ApiError(`Image not available (${res.status})`, 'http', res.status);
    const bytes = await readCapped(res);
    const contentType = sniffImageType(bytes);
    if (!contentType) throw new ApiError('Not a supported image', 'http', 415);
    return { bytes, contentType };
  }

  private async follow(url: string, withToken: boolean, signal: AbortSignal): Promise<Response> {
    let next = url;
    for (let hop = 0; hop < IMAGE_MAX_HOPS; hop++) {
      const headers: Record<string, string> = { 'User-Agent': 'nod', Accept: 'image/*' };
      if (withToken && hop === 0) headers.Authorization = `Bearer ${this.token}`;
      const res = await this.fetchImpl(next, { headers, redirect: 'manual', signal });
      if (res.status < 300 || res.status >= 400) return res;
      const loc = res.headers.get('location');
      await res.body?.cancel().catch(() => undefined);
      const to = loc ? new URL(loc, next) : undefined;
      if (!to || to.protocol !== 'https:' || to.username || to.password || !REDIRECT_HOSTS.has(to.hostname)) {
        throw new ApiError('Image redirect refused', 'http', 400);
      }
      next = to.href;
    }
    throw new ApiError('Too many image redirects', 'http', 400);
  }
}
