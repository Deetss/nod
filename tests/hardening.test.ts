import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { ApiError } from '../server/github-client';
import { dispatchBody } from '../server/orca';
import { parseRef, REPO_RE } from '../server/provider';
import { SeenStore } from '../server/seen';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;

class Throwing extends FixtureProvider {
  constructor(private readonly err: Error) {
    super();
  }
  override async markSeen(): Promise<void> {
    throw this.err;
  }
}

async function seenError(err: Error) {
  const app = createApp({ provider: new Throwing(err), port: PORT, token: TOKEN });
  const res = await app.request(`${ORIGIN}/api/seen`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: `127.0.0.1:${PORT}`,
      origin: ORIGIN,
      'x-nod-token': TOKEN,
    },
    body: JSON.stringify({ id: 'PR_x', updatedAt: 'now', headSha: 'abc', commitCount: 1 }),
  });
  return { status: res.status, body: JSON.stringify(await res.json()) };
}

describe('error text', () => {
  it('hides local paths from non-API errors', async () => {
    const res = await seenError(new Error("ENOENT: no such file '/home/someone/.local/state/seen.json'"));
    expect(res.status).toBe(500);
    expect(res.body).not.toContain('/home/someone');
  });

  it('passes GitHub API error text through', async () => {
    const res = await seenError(new ApiError('422: Validation Failed', 'http', 422));
    expect(res.body).toContain('422: Validation Failed');
  });
});

describe('repo name', () => {
  it('rejects dot segments', () => {
    expect(REPO_RE.test('.')).toBe(false);
    expect(REPO_RE.test('..')).toBe(false);
    expect(parseRef('acme-co/..', '7')).toBeUndefined();
  });

  it('keeps ordinary names, including dots inside', () => {
    expect(REPO_RE.test('acme-co/acme-api')).toBe(true);
    expect(REPO_RE.test('acme-co/.github')).toBe(true);
    expect(REPO_RE.test('acme-co/a..b')).toBe(true);
  });

  it('needs exactly one slash and no dot segment', () => {
    for (const bad of ['acme-api', 'a/b/c', '/b', 'a/', './b', 'a/..', '../b', 'a/.']) {
      expect(REPO_RE.test(bad), bad).toBe(false);
    }
  });
});

describe('dispatch input', () => {
  const good = { repo: 'acme-co/acme-api', number: 7, agent: 'claude', name: 'fix-7', prompt: 'Fix it' };

  it('rejects a base branch that could read as a flag or climb a path', () => {
    for (const baseBranch of ['--json', '-x', 'a/../b', 'main/', '..', '/abs']) {
      expect(dispatchBody.safeParse({ ...good, baseBranch }).success, baseBranch).toBe(false);
    }
  });

  it('accepts ordinary branches', () => {
    for (const baseBranch of ['main', 'release/2026.11', 'feat_x-1']) {
      expect(dispatchBody.safeParse({ ...good, baseBranch }).success, baseBranch).toBe(true);
    }
  });

  it('rejects a prompt that starts with a dash', () => {
    expect(dispatchBody.safeParse({ ...good, prompt: '--agent' }).success).toBe(false);
    expect(dispatchBody.safeParse({ ...good, prompt: '  -x' }).success).toBe(false);
    expect(dispatchBody.safeParse({ ...good, prompt: 'Fix it - now' }).success).toBe(true);
  });
});

describe('seen store', () => {
  it('survives two marks landing together', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ri-seen-'));
    try {
      const path = join(dir, 'seen.json');
      const store = new SeenStore(path);
      await Promise.all([
        store.mark({ id: 'PR_1', updatedAt: 'a', headSha: 'h', commitCount: 1 }),
        store.mark({ id: 'I_1', updatedAt: 'b', commentCount: 2 }),
      ]);
      const saved = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(saved).sort()).toEqual(['I_1', 'PR_1']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
