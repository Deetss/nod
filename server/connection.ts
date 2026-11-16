import {
  checkResult,
  connectionState,
  grantedScopes,
  type Connection,
  type ConnectionCheck,
  type TokenSource,
} from '../shared/connection';
import type { GithubClient } from './github-client';
import { consoleSink, type LogSink } from './request-log';
import { readGhToken } from './token';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** `gh auth token` prints `GH_TOKEN` or `GITHUB_TOKEN` when either is set, in that order. */
export function tokenSource(env: NodeJS.ProcessEnv): TokenSource {
  if (env.GH_TOKEN) return 'GH_TOKEN';
  if (env.GITHUB_TOKEN) return 'GITHUB_TOKEN';
  return 'gh';
}

/** A GraphQL refusal of `projectItems` for want of a project scope. */
export const isProjectScopeError = (message: string): boolean => /projectItems|read:project/.test(message);

export interface ConnectionChange extends ConnectionCheck {
  before: Connection;
  tokenChanged: boolean;
}

/**
 * The token's state. `gh auth token` is the only source; the token goes straight into the
 * client and is never logged, written or returned.
 */
export class GithubConnection {
  private login: string | undefined;
  private checkedAt = '';
  private source: TokenSource;
  /** A token with unknown scopes had `projectItems` refused. */
  projectDenied = false;

  constructor(
    private readonly client: GithubClient,
    private readonly readToken: () => Promise<string> = readGhToken,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly log: LogSink = consoleSink,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.source = tokenSource(env);
  }

  /** Derived on every call, so scopes GitHub reports on later responses show up. */
  current(): Connection {
    const scopes = this.client.hasToken ? this.client.scopes : undefined;
    const granted = scopes ? grantedScopes(scopes) : undefined;
    return {
      state: connectionState(this.client.hasToken, granted),
      source: this.source,
      checkedAt: this.checkedAt,
      ...(this.client.hasToken && this.login ? { login: this.login } : {}),
      ...(granted ? { granted, tokenScopes: scopes } : {}),
      ...(this.projectDenied ? { projectDenied: true } : {}),
    };
  }

  /** Re-reads the token, swaps it in, and reads its scopes and login with `GET /user`. Never throws. */
  async check(): Promise<ConnectionChange> {
    const before = this.current();
    const token = await this.readToken().catch(() => '');
    const tokenChanged = !this.client.isToken(token);
    this.client.setToken(token);
    this.source = tokenSource(this.env);
    if (tokenChanged) {
      this.login = undefined;
      this.projectDenied = false;
    }
    if (token !== '') {
      try {
        this.login = await this.client.whoami();
      } catch (e) {
        this.log(`[gh] token check failed (${e instanceof Error ? e.message : 'error'})`);
      }
    }
    this.checkedAt = hhmm(this.now());
    const connection = this.current();
    const result = checkResult(before, connection, tokenChanged);
    return { before, connection, tokenChanged, ...(result ? { result } : {}) };
  }
}
