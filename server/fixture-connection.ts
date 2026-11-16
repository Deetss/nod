import {
  checkResult,
  connectionState,
  grantedScopes,
  type Connection,
  type ConnectionCheck,
} from '../shared/connection';
import type { StateQuery } from './provider';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const ALL = ['gist', 'project', 'read:org', 'repo', 'workflow'];
const NO_REPO = ['read:org', 'gist'];
const NO_PROJECT = ['gist', 'read:org', 'repo'];

/**
 * Fixture-only token states, by `?state=`:
 * `token-none`, `token-required`, `token-optional`, `token-unknown`, `token-env` (required, from
 * `GH_TOKEN`) and `token-fixable` (optional until Check again, then all on). Anything else is all on.
 */
export class FixtureConnection {
  /** `token-fixable` after its Check again. */
  private fixed = false;
  private checkedAt = hhmm(new Date());

  get(state: StateQuery): Connection {
    const base = { source: 'gh' as const, checkedAt: this.checkedAt };
    if (state === 'token-none') return { ...base, state: 'none' };
    if (state === 'token-unknown') return { ...base, state: 'unknown', login: 'acme-dev' };
    const scopes =
      state === 'token-required' || state === 'token-env'
        ? NO_REPO
        : state === 'token-optional' || (state === 'token-fixable' && !this.fixed)
          ? NO_PROJECT
          : ALL;
    const granted = grantedScopes(scopes);
    return {
      ...base,
      ...(state === 'token-env' ? { source: 'GH_TOKEN' as const } : {}),
      state: connectionState(true, granted),
      login: 'acme-dev',
      granted,
      tokenScopes: scopes,
    };
  }

  /** `token-fixable` picks up a new token; every other state gets the same one back. */
  check(state: StateQuery): ConnectionCheck {
    const before = this.get(state);
    const changed = state === 'token-fixable' && !this.fixed;
    if (changed) this.fixed = true;
    this.checkedAt = hhmm(new Date());
    const connection = this.get(state);
    const result = checkResult(before, connection, changed);
    return { connection, ...(result ? { result } : {}) };
  }
}
