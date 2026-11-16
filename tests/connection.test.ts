import { describe, expect, it } from 'vitest';
import {
  checkResult,
  connectionFeatures,
  connectionState,
  envTokenLine,
  fixCommand,
  grantedScopes,
  parseScopes,
  scopeMark,
  SCOPES,
  type Connection,
} from '../shared/connection';
import { GithubClient } from '../server/github-client';
import { GithubConnection, isProjectScopeError, tokenSource } from '../server/connection';
import { issueDetailQuery, issueInboxQuery, ISSUE_INBOX_QUERY, pollQuery } from '../server/issue-queries';
import { PR_FIELDS } from '../server/queries';

const conn = (scopes: string[] | undefined, over: Partial<Connection> = {}): Connection => {
  const granted = scopes ? grantedScopes(scopes) : undefined;
  return { state: connectionState(true, granted), source: 'gh', checkedAt: '10:26', login: 'acme-dev', ...(granted ? { granted, tokenScopes: scopes } : {}), ...over };
};

describe('X-OAuth-Scopes parsing', () => {
  it('splits and trims the header', () => {
    expect(parseScopes('repo, read:org,  gist')).toEqual(['repo', 'read:org', 'gist']);
    expect(parseScopes('')).toEqual([]);
  });

  it('is undefined without the header, so scopes are unknown', () => {
    expect(parseScopes(null)).toBeUndefined();
    expect(connectionState(true, undefined)).toBe('unknown');
  });

  it('counts org write scopes as read:org and read:project as missing project', () => {
    expect(grantedScopes(['repo', 'admin:org', 'read:project'])).toEqual({ repo: true, 'read:org': true, project: false });
  });

  it('keeps the newest header from any response', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ login: 'acme-dev' }), {
        status: 200,
        headers: { 'x-oauth-scopes': 'repo, gist' },
      })) as unknown as typeof fetch;
    const client = new GithubClient('t1', fetchImpl, () => undefined);
    expect(await client.whoami()).toBe('acme-dev');
    expect(client.scopes).toEqual(['repo', 'gist']);
  });
});

describe('scope to feature mapping', () => {
  it('states follow the scopes', () => {
    expect(connectionState(false, undefined)).toBe('none');
    expect(conn(['read:org', 'gist']).state).toBe('required');
    expect(conn(['repo', 'read:org']).state).toBe('optional');
    expect(conn(['repo', 'read:org', 'project']).state).toBe('ok');
  });

  it('pauses sync without repo and drops teams and Status per missing scope', () => {
    expect(connectionFeatures(conn(['read:org']))).toEqual({ sync: false, teams: true, project: false });
    expect(connectionFeatures(conn(['repo']))).toEqual({ sync: true, teams: false, project: false });
    expect(connectionFeatures(conn(undefined))).toEqual({ sync: true, teams: true, project: true });
    expect(connectionFeatures(conn(undefined, { projectDenied: true })).project).toBe(false);
  });

  it('builds the fix command in table order', () => {
    expect(fixCommand(conn(['read:org', 'gist']))).toBe('gh auth refresh -h github.com -s repo,project');
    expect(fixCommand(conn(['repo', 'read:org']))).toBe('gh auth refresh -h github.com -s project');
    expect(fixCommand({ state: 'none', source: 'gh', checkedAt: '' })).toBe('gh auth login -s project');
    expect(fixCommand(conn(['repo', 'read:org', 'project']))).toBeUndefined();
  });

  it('gives a GH_TOKEN line instead of a command', () => {
    const env = conn(['read:org'], { source: 'GH_TOKEN' });
    expect(fixCommand(env)).toBeUndefined();
    expect(envTokenLine(env)).toMatch(/^Nod reads GH_TOKEN\./);
    expect(tokenSource({ GH_TOKEN: 'x' })).toBe('GH_TOKEN');
    expect(tokenSource({})).toBe('gh');
  });

  it('marks never guess a cross without a header', () => {
    expect(SCOPES.map((s) => scopeMark(conn(['read:org']), s))).toEqual(['missing-required', 'granted', 'missing-optional']);
    expect(SCOPES.map((s) => scopeMark(conn(undefined), s))).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('recognises a projectItems scope refusal', () => {
    expect(isProjectScopeError("The 'projectItems' field requires one of the following scopes: ['read:project']")).toBe(true);
    expect(isProjectScopeError('Something went wrong')).toBe(false);
  });
});

describe('issue queries without the project scope', () => {
  it('leave out projectItems and $statusField', () => {
    for (const doc of [issueInboxQuery(false), issueDetailQuery(false), pollQuery(PR_FIELDS, false)]) {
      expect(doc).not.toContain('projectItems');
      expect(doc).not.toContain('$statusField');
    }
    expect(ISSUE_INBOX_QUERY).toContain('projectItems(first: 5)');
  });
});

describe('Check again', () => {
  function setup(tokens: string[], scopesByToken: Record<string, string>) {
    const seen: string[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization ?? '';
      const token = auth.replace('Bearer ', '');
      seen.push(token);
      return new Response(JSON.stringify({ login: 'acme-dev' }), { status: 200, headers: { 'x-oauth-scopes': scopesByToken[token] ?? '' } });
    }) as unknown as typeof fetch;
    const client = new GithubClient('', fetchImpl, () => undefined);
    let i = 0;
    const read = async () => {
      const t = tokens[Math.min(i++, tokens.length - 1)];
      if (!t) throw new Error('no token');
      return t;
    };
    const lines: string[] = [];
    const connection = new GithubConnection(client, read, {}, (l) => lines.push(l), () => new Date(2026, 10, 16, 10, 42));
    return { client, connection, seen, lines };
  }

  it('swaps the token in memory and re-reads the scopes', async () => {
    const { client, connection, seen, lines } = setup(['old-token', 'new-token'], { 'old-token': 'read:org, gist', 'new-token': 'repo, read:org, project' });
    expect((await connection.check()).connection.state).toBe('required');
    const res = await connection.check();
    expect(res.tokenChanged).toBe(true);
    expect(res.connection.state).toBe('ok');
    expect(res.result).toEqual({ tone: 'ok', text: 'Checked 10:42. Nod picked up the new token. Issue Status is on.' });
    expect(client.isToken('new-token')).toBe(true);
    expect(seen).toEqual(['old-token', 'new-token']);
    expect(JSON.stringify(res)).not.toContain('new-token');
    expect(lines.join('\n')).not.toContain('token-');
  });

  it('says so when gh gives the same token back', async () => {
    const { connection } = setup(['t'], { t: 'read:org, gist' });
    await connection.check();
    const res = await connection.check();
    expect(res.tokenChanged).toBe(false);
    expect(res.result?.text).toBe(
      'Checked 10:42. Still missing repo. gh gave Nod the same token, so finish the command and approve in the browser.',
    );
  });

  it('falls back to none when gh has no token, without throwing', async () => {
    const { connection } = setup([], {});
    const res = await connection.check();
    expect(res.connection.state).toBe('none');
    expect(res.connection.login).toBeUndefined();
  });

  it('reports a new token still missing a scope', () => {
    const before = conn(['read:org']);
    expect(checkResult(before, conn(['read:org', 'gist'], { checkedAt: '10:42' }), true)?.text).toBe(
      'Checked 10:42. The new token is still missing repo.',
    );
  });
});
