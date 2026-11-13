import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { FixtureProvider } from '../server/fixture-provider';
import { dispatchPrompt, repoInOrca, worktreeName } from '../shared/orca';
import {
  cliErrorMessage,
  dispatchArgs,
  dispatchBody,
  Orca,
  parseCreated,
  repoFromRemote,
  withWrapUp,
  WRAP_UP,
  type OrcaExec,
} from '../server/orca';

const PORT = 4477;
const TOKEN = 'test-token';
const ORIGIN = `http://127.0.0.1:${PORT}`;

const good = {
  repo: 'acme-co/Acme-Api',
  number: 12,
  agent: 'claude',
  name: 'issue-12-fix-it',
  prompt: 'Work on it',
};

describe('repoFromRemote', () => {
  it('reads ssh and https forms', () => {
    expect(repoFromRemote('git@github.com:acme-co/acme-api.git\n', ['acme-co'])).toBe('acme-api');
    expect(repoFromRemote('https://github.com/acme-co/acme-api.git', ['acme-co'])).toBe('acme-api');
    expect(repoFromRemote('https://github.com/acme-co/acme-api', ['acme-co'])).toBe('acme-api');
  });

  it('ignores case in the org and repo', () => {
    expect(repoFromRemote('git@github.com:ACME-CO/Acme-API.git', ['acme-co'])).toBe('acme-api');
  });

  it('rejects other orgs and hosts', () => {
    expect(repoFromRemote('git@github.com:someone-else/acme-api.git', ['acme-co'])).toBeUndefined();
    expect(repoFromRemote('git@example.com:acme-co/acme-api.git', ['acme-co'])).toBeUndefined();
    expect(repoFromRemote('https://github.com/acme-co-fake/acme-api.git', ['acme-co'])).toBeUndefined();
  });

  it('matches any owner, or any of several orgs', () => {
    expect(repoFromRemote('git@github.com:someone-else/acme-api.git', [])).toBe('acme-api');
    expect(repoFromRemote('git@github.com:acme-dev/tools.git', ['acme-co', 'acme-dev'])).toBe('tools');
  });
});

describe('dispatch validation', () => {
  it('accepts a good body', () => {
    expect(dispatchBody.safeParse(good).success).toBe(true);
    expect(dispatchBody.safeParse({ ...good, baseBranch: 'release/1.2' }).success).toBe(true);
  });

  it.each([
    ['number zero', { number: 0 }],
    ['fractional number', { number: 1.5 }],
    ['unknown agent', { agent: 'rm' }],
    ['uppercase name', { name: 'Issue-1' }],
    ['name with a space', { name: 'a b' }],
    ['name starting with a dash', { name: '-a' }],
    ['name over 61 characters', { name: 'a'.repeat(62) }],
    ['base branch with a space', { baseBranch: 'a b' }],
    ['base branch with a semicolon', { baseBranch: 'main;ls' }],
    ['prompt over 12000 characters', { prompt: 'x'.repeat(12001) }],
    ['empty prompt', { prompt: '' }],
    ['bad repo', { repo: '../etc' }],
  ])('rejects %s', (_label, patch) => {
    expect(dispatchBody.safeParse({ ...good, ...patch }).success).toBe(false);
  });
});

describe('dispatchArgs', () => {
  it('builds an argument array with each value as one entry', () => {
    const body = dispatchBody.parse({ ...good, prompt: 'a b; rm -rf /', baseBranch: 'main' });
    const args = dispatchArgs('rid', body);
    expect(args).toEqual([
      'worktree', 'create', '--repo', 'id:rid', '--name', 'issue-12-fix-it', '--issue', '12',
      '--agent', 'claude', '--prompt', withWrapUp('a b; rm -rf /'), '--base-branch', 'main', '--no-parent', '--json',
    ]);
  });

  it('ends every prompt with the wrap-up exactly once', () => {
    const args = dispatchArgs('rid', dispatchBody.parse(good));
    expect(args[args.indexOf('--prompt') + 1]?.endsWith(WRAP_UP)).toBe(true);
    expect(withWrapUp(withWrapUp('Fix it'))).toBe(withWrapUp('Fix it'));
    expect(WRAP_UP).toContain('--worktree current');
    expect(WRAP_UP).not.toMatch(/worktree rm|terminal close/);
  });

  it('omits the base branch when empty', () => {
    expect(dispatchArgs('rid', dispatchBody.parse(good))).not.toContain('--base-branch');
  });

  it('passes --no-parent with and without a base branch', () => {
    const withBase = dispatchArgs('rid', dispatchBody.parse({ ...good, baseBranch: 'main' }));
    const withoutBase = dispatchArgs('rid', dispatchBody.parse(good));
    expect(withBase).toContain('--no-parent');
    expect(withoutBase).toContain('--no-parent');
    expect(withoutBase[withoutBase.length - 2]).toBe('--no-parent');
    expect(withoutBase[withoutBase.length - 1]).toBe('--json');
  });
});

describe('parseCreated', () => {
  it('reads the worktree from the CLI envelope', () => {
    const out = JSON.stringify({ ok: true, result: { worktree: { displayName: 'wt', path: '/p/wt' } } });
    expect(parseCreated(out, 'x')).toEqual({ worktree: 'wt', path: '/p/wt' });
  });

  it('falls back to the requested name', () => {
    expect(parseCreated('not json', 'x')).toEqual({ worktree: 'x' });
  });
});

describe('worktree name and availability', () => {
  it('slugs the title to at most 40 characters', () => {
    expect(worktreeName(7, 'Fix: the *Big* Bug!')).toBe('issue-7-fix-the-big-bug');
    const long = worktreeName(7, 'a'.repeat(100));
    expect(long).toBe(`issue-7-${'a'.repeat(40)}`);
    expect(worktreeName(7, '!!!')).toBe('issue-7');
  });

  it('matches repos case-insensitively and treats a missing list as all', () => {
    expect(repoInOrca({ available: true, agents: [], repos: ['acme-api'] }, 'acme-co/Acme-Api')).toBe(true);
    expect(repoInOrca({ available: true, agents: [], repos: ['acme-api'] }, 'acme-co/other')).toBe(false);
    expect(repoInOrca({ available: true, agents: [] }, 'acme-co/other')).toBe(true);
    expect(repoInOrca({ available: false, agents: [] }, 'acme-co/acme-api')).toBe(false);
  });

  it('keeps the issue body out of the default prompt', () => {
    const p = dispatchPrompt('acme-co/acme-api', 12, 'T', 'https://x/y');
    expect(p).toContain('gh issue view 12 --repo acme-co/acme-api --comments');
    expect(p).toContain('Closes #12');
    expect(p.length).toBeLessThan(4000);
  });
});

interface Call {
  bin: string;
  args: string[];
}

function fakeOrca() {
  const calls: Call[] = [];
  const exec: OrcaExec = async (bin, args) => {
    calls.push({ bin, args });
    if (bin === 'git') {
      const path = args[1];
      return path === '/r/api' ? 'git@github.com:acme-co/Acme-Api.git\n' : 'git@github.com:other/x.git\n';
    }
    if (args[0] === 'repo') {
      return JSON.stringify({
        result: { repos: [{ id: 'r1', path: '/r/api' }, { id: 'r2', path: '/r/other' }] },
      });
    }
    if (args[0] === 'worktree') return JSON.stringify({ result: { worktree: { name: 'made', path: '/w/made' } } });
    return '';
  };
  const orca = new Orca({ exec, candidates: ['orca-ide'], now: () => 0 });
  return { orca, calls };
}

describe('Orca', () => {
  it('maps a repo by its origin remote, case-insensitively', async () => {
    const { orca } = fakeOrca();
    expect(await orca.repoId('acme-co/Acme-Api')).toBe('r1');
    expect(await orca.repoId('acme-co/other')).toBeUndefined();
  });

  it('spawns with an argument array, never a shell string', async () => {
    const { orca, calls } = fakeOrca();
    const res = await orca.dispatch(dispatchBody.parse({ ...good, prompt: '$(touch x) `y` ; z' }));
    expect(res).toEqual({ ok: true, worktree: 'made', path: '/w/made' });
    const spawn = calls.find((c) => c.args[0] === 'worktree');
    expect(spawn?.bin).toBe('orca-ide');
    expect(Array.isArray(spawn?.args)).toBe(true);
    expect(spawn?.args).toContain(withWrapUp('$(touch x) `y` ; z'));
  });

  it('reports a repo that Orca does not have', async () => {
    const { orca } = fakeOrca();
    const res = await orca.dispatch(dispatchBody.parse({ ...good, repo: 'acme-co/other' }));
    expect(res).toEqual({ ok: false, message: 'Repo not in Orca' });
  });

  it('trims CLI errors to 300 characters', async () => {
    const exec: OrcaExec = async (bin, args) => {
      if (bin === 'git') return 'git@github.com:acme-co/acme-api.git';
      if (args[0] === 'repo') return JSON.stringify({ result: { repos: [{ id: 'r1', path: '/r/api' }] } });
      throw new Error('e'.repeat(1000));
    };
    const orca = new Orca({ exec, candidates: ['orca-ide'] });
    const res = await orca.dispatch(dispatchBody.parse(good));
    expect(res.ok).toBe(false);
    expect(res.ok ? 0 : res.message.length).toBeLessThanOrEqual(320);
  });

  it('is unavailable when no candidate runs', async () => {
    const exec: OrcaExec = async () => {
      throw new Error('nope');
    };
    const orca = new Orca({ exec, candidates: ['orca-ide'] });
    expect(await orca.status()).toEqual({ available: false, agents: [] });
  });

  it('fixture mode never spawns and logs the argument array', async () => {
    const logs: string[] = [];
    const exec: OrcaExec = async () => {
      throw new Error('must not spawn');
    };
    const orca = new Orca({ exec, fixtures: true, log: (l) => logs.push(l) });
    expect((await orca.status()).available).toBe(true);
    const res = await orca.dispatch(dispatchBody.parse(good));
    expect(res).toEqual({ ok: true, worktree: 'issue-12-fix-it' });
    expect(logs[0]).toContain('"worktree","create"');
  });
});

describe('PR mode dispatch', () => {
  const pr = {
    repo: 'acme-co/acme-web',
    number: 42,
    agent: 'claude',
    name: 'pr-42-fix-checks',
    baseBranch: 'build-bot/cart-rounding',
    prompt: 'Fix the failing checks on acme-web#42',
    pr: true,
  };

  it('builds the exact argument list with --pr and no --issue', () => {
    expect(dispatchArgs('r1', dispatchBody.parse(pr))).toEqual([
      'worktree',
      'create',
      '--repo',
      'id:r1',
      '--name',
      'pr-42-fix-checks',
      '--pr',
      '42',
      '--base-branch',
      'origin/build-bot/cart-rounding',
      '--agent',
      'claude',
      '--prompt',
      withWrapUp('Fix the failing checks on acme-web#42'),
      '--no-parent',
      '--json',
    ]);
  });

  it('keeps the issue argument list unchanged', () => {
    const args = dispatchArgs('r1', dispatchBody.parse(good));
    expect(args).toContain('--issue');
    expect(args).not.toContain('--pr');
  });

  it('needs the head branch and validates it like a base branch', () => {
    const { baseBranch: _unused, ...noBranch } = pr;
    expect(dispatchBody.safeParse(noBranch).success).toBe(false);
    expect(dispatchBody.safeParse({ ...pr, baseBranch: 'a b' }).success).toBe(false);
    expect(dispatchBody.safeParse({ ...pr, baseBranch: 'a..b' }).success).toBe(false);
    expect(dispatchBody.safeParse({ ...pr, name: 'Bad Name' }).success).toBe(false);
    expect(dispatchBody.safeParse({ ...pr, prompt: '--x' }).success).toBe(false);
  });

  it('returns the CLI error text, trimmed, on failure', async () => {
    const cliJson = JSON.stringify({
      ok: false,
      error: {
        code: 'runtime_error',
        message: 'Command failed: git worktree add --no-track -b x /p/x bot/y\nfatal: invalid reference: bot/y\n',
      },
    });
    const exec: OrcaExec = async (bin, args) => {
      if (bin === 'git') return 'git@github.com:acme-co/acme-web.git';
      if (args[0] === 'repo') return JSON.stringify({ result: { repos: [{ id: 'r1', path: '/r/web' }] } });
      if (args[0] === 'worktree') throw new Error(cliJson);
      return '';
    };
    const orca = new Orca({ exec, candidates: ['orca-ide'], log: () => {} });
    const res = await orca.dispatch(dispatchBody.parse(pr));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.message).toBe('Dispatch failed: fatal: invalid reference: bot/y');
  });

  it('keeps the first two lines of plain-text stderr', () => {
    expect(cliErrorMessage('  boom one \n\nboom two\nboom three')).toBe('boom one boom two');
    expect(cliErrorMessage('')).toBe('Unknown error');
  });

  it('logs the PR arguments in fixture mode', async () => {
    const logs: string[] = [];
    const orca = new Orca({ fixtures: true, log: (l) => logs.push(l) });
    expect(await orca.dispatch(dispatchBody.parse(pr))).toEqual({ ok: true, worktree: 'pr-42-fix-checks' });
    expect(logs[0]).toContain('"--pr","42"');
    expect(logs[0]).not.toContain('--issue');
  });
});

describe('orca routes', () => {
  const app = () =>
    createApp({
      provider: new FixtureProvider(),
      port: PORT,
      token: TOKEN,
      orca: new Orca({ fixtures: true, log: () => undefined }),
    });
  const headers = (extra: Record<string, string> = {}) => ({
    'content-type': 'application/json',
    host: `127.0.0.1:${PORT}`,
    origin: ORIGIN,
    'x-nod-token': TOKEN,
    ...extra,
  });

  it('reports availability', async () => {
    const res = await app().request(`${ORIGIN}/api/orca`, { headers: { host: `127.0.0.1:${PORT}` } });
    expect(await res.json()).toMatchObject({ available: true });
  });

  it('dispatches behind the mutation guard', async () => {
    const body = JSON.stringify(good);
    const denied = await app().request(`${ORIGIN}/api/orca/dispatch`, {
      method: 'POST',
      headers: headers({ 'x-nod-token': 'wrong' }),
      body,
    });
    expect(denied.status).toBe(403);
    const ok = await app().request(`${ORIGIN}/api/orca/dispatch`, { method: 'POST', headers: headers(), body });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, worktree: 'issue-12-fix-it' });
  });

  it('rejects a bad body with 400', async () => {
    const res = await app().request(`${ORIGIN}/api/orca/dispatch`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...good, name: 'Bad Name' }),
    });
    expect(res.status).toBe(400);
  });
});
