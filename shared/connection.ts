/** What the GitHub token lets Nod do. The server, the desktop card and the phone sheet all read it from here. */

export const SCOPE_NAMES = ['repo', 'read:org', 'project'] as const;
export type ScopeName = (typeof SCOPE_NAMES)[number];

export type ConnectionState = 'none' | 'required' | 'optional' | 'ok' | 'unknown';
export type TokenSource = 'gh' | 'GH_TOKEN' | 'GITHUB_TOKEN';
export type ScopeNeed = 'Required' | 'Optional';

export interface ScopeInfo {
  name: ScopeName;
  need: ScopeNeed;
  turnsOn: string;
}

export const SCOPES: readonly ScopeInfo[] = [
  { name: 'repo', need: 'Required', turnsOn: 'PRs, issues, checks, replies' },
  { name: 'read:org', need: 'Optional', turnsOn: 'Team review requests' },
  { name: 'project', need: 'Optional', turnsOn: 'Issue Status, Move to In progress' },
];

/** The token's state as the web app sees it. The token itself never leaves the server. */
export interface Connection {
  state: ConnectionState;
  /** GitHub login, from `GET /user`. */
  login?: string;
  source: TokenSource;
  /** Per scope. Absent with no token, or when GitHub sent no `X-OAuth-Scopes` header. */
  granted?: Record<ScopeName, boolean>;
  /** The header's own list, for Details. */
  tokenScopes?: string[];
  /** Status calls failed on a token whose scopes are unknown, so Status is off. */
  projectDenied?: boolean;
  /** Local HH:MM of the last check. */
  checkedAt: string;
}

export interface CheckResult {
  tone: 'ok' | 'danger';
  text: string;
}

/** `POST /api/connection/check` answers with the new connection and, when there is one, the result line. */
export interface ConnectionCheck {
  connection: Connection;
  result?: CheckResult;
}

/** `X-OAuth-Scopes: repo, read:org` as a list. Undefined when the header is absent. */
export function parseScopes(header: string | null | undefined): string[] | undefined {
  if (header === null || header === undefined) return undefined;
  return header
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** `read:project` alone counts as missing, since Move to In progress writes. Org write scopes imply `read:org`. */
export function grantedScopes(list: readonly string[]): Record<ScopeName, boolean> {
  const has = new Set(list);
  return {
    repo: has.has('repo'),
    'read:org': has.has('read:org') || has.has('write:org') || has.has('admin:org'),
    project: has.has('project'),
  };
}

export function connectionState(hasToken: boolean, granted: Record<ScopeName, boolean> | undefined): ConnectionState {
  if (!hasToken) return 'none';
  if (!granted) return 'unknown';
  if (!granted.repo) return 'required';
  return granted['read:org'] && granted.project ? 'ok' : 'optional';
}

/** Scopes the token lacks, in table order. */
export function missingScopes(c: Pick<Connection, 'granted'>): ScopeName[] {
  return SCOPE_NAMES.filter((s) => c.granted?.[s] === false);
}

/** Missing scopes Nod cannot sync without. */
export function missingRequired(c: Pick<Connection, 'granted'>): ScopeName[] {
  return missingScopes(c).filter((s) => SCOPES.find((x) => x.name === s)?.need === 'Required');
}

/** What runs with this connection. Unknown scopes count as present until GitHub refuses a call. */
export interface ConnectionFeatures {
  sync: boolean;
  teams: boolean;
  project: boolean;
}

export function connectionFeatures(c: Pick<Connection, 'state' | 'granted' | 'projectDenied'>): ConnectionFeatures {
  return {
    sync: c.state !== 'none' && c.state !== 'required',
    teams: c.granted?.['read:org'] !== false,
    project: c.granted?.project !== false && !c.projectDenied,
  };
}

/** Status is off because of the token, as opposed to a project that does not resolve. */
export const projectOff = (c: Connection | undefined): boolean => c !== undefined && c.state !== 'none' && !connectionFeatures(c).project;

export type ScopeMark = 'granted' | 'missing-required' | 'missing-optional' | 'unknown';

export const MARK_LABELS: Record<ScopeMark, string> = {
  granted: 'granted',
  'missing-required': 'missing, required',
  'missing-optional': 'missing, optional',
  unknown: 'unknown',
};

export function scopeMark(c: Pick<Connection, 'granted'>, scope: ScopeInfo): ScopeMark {
  const g = c.granted?.[scope.name];
  if (g === undefined) return 'unknown';
  if (g) return 'granted';
  return scope.need === 'Required' ? 'missing-required' : 'missing-optional';
}

export type PillTone = 'neutral' | 'danger' | 'attention' | 'success';

export const PILLS: Record<ConnectionState, { label: string; tone: PillTone }> = {
  none: { label: 'Not connected', tone: 'neutral' },
  unknown: { label: 'Scopes unknown', tone: 'neutral' },
  required: { label: 'Sync paused', tone: 'danger' },
  optional: { label: 'Partly on', tone: 'attention' },
  ok: { label: 'All on', tone: 'success' },
};

/** The gear and nav `!`. Absent when nothing needs doing. */
export function attentionTone(c: Connection | undefined): 'danger' | 'attention' | undefined {
  if (!c) return undefined;
  if (c.state === 'none' || c.state === 'required') return 'danger';
  return c.state === 'optional' ? 'attention' : undefined;
}

export const NO_TOKEN_LINE = 'No token. gh is not installed, or not logged in.';
export const LOGIN_COMMAND = 'gh auth login -s project';

export function whoLine(c: Connection): string {
  if (c.state === 'none') return NO_TOKEN_LINE;
  const host = c.login ? `${c.login} on github.com` : 'github.com';
  return `${host} · token from ${c.source}`;
}

/** The command that fixes the token, or undefined when there is none to run. */
export function fixCommand(c: Connection): string | undefined {
  if (c.state === 'none') return LOGIN_COMMAND;
  const missing = missingScopes(c);
  if (c.source !== 'gh' || missing.length === 0) return undefined;
  return `gh auth refresh -h github.com -s ${missing.join(',')}`;
}

/** The line shown in place of the command when the token comes from the environment. */
export function envTokenLine(c: Connection): string | undefined {
  if (c.state === 'none' || c.source === 'gh' || missingScopes(c).length === 0) return undefined;
  return `Nod reads ${c.source}. Give that token the missing scopes, or unset it and run ${LOGIN_COMMAND}.`;
}

/** `Token scopes: read:org, gist. Nod needs repo.` for the required banner's Details. */
export function scopesDetail(c: Connection): string {
  const list = c.tokenScopes && c.tokenScopes.length > 0 ? c.tokenScopes.join(', ') : 'none';
  return `Token scopes: ${list}. Nod needs ${missingRequired(c).join(', ') || 'repo'}.`;
}

const GAINED_TEXT: Record<ScopeName, string> = {
  repo: 'Sync is on.',
  'read:org': 'Team review requests are on.',
  project: 'Issue Status is on.',
};

function gained(before: Connection, after: Connection): ScopeName[] {
  return SCOPE_NAMES.filter((s) => after.granted?.[s] === true && before.granted?.[s] !== true);
}

/** Whether a check left Nod able to do more than before it. */
export function improved(before: Connection, after: Connection): boolean {
  return gained(before, after).length > 0 || (before.state === 'none' && after.state !== 'none');
}

/** The line under the scope table after Check again. Undefined when there is nothing to say. */
export function checkResult(before: Connection, after: Connection, tokenChanged: boolean): CheckResult | undefined {
  const at = `Checked ${after.checkedAt}.`;
  const missing = missingScopes(after)[0];
  if (after.state === 'ok') {
    if (!improved(before, after)) return undefined;
    const turned = gained(before, after).reverse()[0];
    return { tone: 'ok', text: `${at} Nod picked up the new token.${turned ? ` ${GAINED_TEXT[turned]}` : ''}` };
  }
  if (after.state === 'none') return { tone: 'danger', text: `${at} Still no token. Run the command, then check again.` };
  if (!missing) return undefined;
  if (tokenChanged) return { tone: 'danger', text: `${at} The new token is still missing ${missing}.` };
  return {
    tone: 'danger',
    text: `${at} Still missing ${missing}. gh gave Nod the same token, so finish the command and approve in the browser.`,
  };
}
