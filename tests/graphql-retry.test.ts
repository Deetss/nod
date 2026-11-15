import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, GithubClient } from '../server/github-client';

const ok = () => new Response(JSON.stringify({ data: { viewer: { login: 'me' } } }));
const status = (code: number) => () => new Response('bad gateway', { status: code });

function client(responses: Array<() => Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit = {}) => {
    calls.push(String(init.body));
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next();
  }) as typeof fetch;
  return { calls, gh: new GithubClient('t', fetchImpl, () => undefined) };
}

describe('graphql retry', () => {
  afterEach(() => vi.useRealTimers());

  async function run<T>(p: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return p;
  }

  it('retries a read once after a 502 and returns the second answer', async () => {
    vi.useFakeTimers();
    const { calls, gh } = client([status(502), ok]);
    const data = await run(gh.graphql<{ viewer: { login: string } }>('query { viewer { login } }', {}));
    expect(data.viewer.login).toBe('me');
    expect(calls).toHaveLength(2);
  });

  it('gives up after the second 5xx', async () => {
    vi.useFakeTimers();
    const { calls, gh } = client([status(503), status(504)]);
    const p = gh.graphql('query { viewer { login } }', {});
    const settled = p.catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await settled;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(504);
    expect(calls).toHaveLength(2);
  });

  it('never retries a mutation', async () => {
    const { calls, gh } = client([status(502)]);
    await expect(gh.graphql('mutation { addStar(input: {}) { clientMutationId } }', {})).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it('does not retry other failures', async () => {
    const { calls, gh } = client([status(500)]);
    await expect(gh.graphql('query { viewer { login } }', {})).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });
});
