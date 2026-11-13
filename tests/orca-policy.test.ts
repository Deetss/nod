import { describe, expect, it } from 'vitest';
import type { OrcaEventKind } from '../shared/orca-message';
import {
  DEFAULT_ORCA_PREFS,
  applyPrefsPatch,
  orcaEnabledFor,
  parseOrcaPrefs,
  prefsPatchBody,
  withChosen,
} from '../shared/orca-prefs';
import { autoMessagesOn, stateReceives } from '../shared/orca-policy';
import type { SessionState } from '../shared/orca-sessions';

type Row = [OrcaEventKind, Record<SessionState, boolean>];

// docs/design/orca-sessions-spec.md section 12.3
const TABLE: Row[] = [
  ['approve', { working: true, waiting: true, done: false, unknown: false }],
  ['comment', { working: true, waiting: true, done: false, unknown: false }],
  ['ready', { working: true, waiting: true, done: false, unknown: false }],
  ['auto-merge-on', { working: true, waiting: true, done: false, unknown: false }],
  ['auto-merge-off', { working: true, waiting: true, done: false, unknown: false }],
  ['request-changes', { working: true, waiting: true, done: true, unknown: false }],
  ['merge', { working: true, waiting: true, done: true, unknown: false }],
  ['admin-merge', { working: true, waiting: true, done: true, unknown: false }],
  ['issue-close', { working: true, waiting: true, done: true, unknown: false }],
  ['issue-reopen', { working: true, waiting: true, done: false, unknown: false }],
];

describe('stateReceives', () => {
  for (const [kind, expected] of TABLE) {
    for (const state of Object.keys(expected) as SessionState[]) {
      it(`${kind} to a ${state} session: ${expected[state] ? 'sent' : 'not sent'}`, () => {
        expect(stateReceives(kind, state)).toBe(expected[state]);
      });
    }
  }
});

describe('autoMessagesOn', () => {
  it('follows the global box when a repo has no override', () => {
    expect(autoMessagesOn({ enabled: true, repos: {} }, 'Acme-Co/Acme-Api')).toBe(true);
    expect(autoMessagesOn({ enabled: false, repos: {} }, 'Acme-Co/Acme-Api')).toBe(false);
  });

  it('lets an override beat the global box, in both directions', () => {
    expect(autoMessagesOn({ enabled: true, repos: { 'acme-co/acme-api': 'off' } }, 'Acme-Co/Acme-Api')).toBe(false);
    expect(autoMessagesOn({ enabled: false, repos: { 'acme-co/acme-api': 'on' } }, 'Acme-Co/Acme-Api')).toBe(true);
  });

  it('keeps other repos on the global box', () => {
    expect(autoMessagesOn({ enabled: false, repos: { 'acme-co/acme-api': 'on' } }, 'acme-co/acme-web')).toBe(false);
  });
});

describe('prefs', () => {
  it('defaults to on, no overrides, nothing chosen', () => {
    expect(DEFAULT_ORCA_PREFS).toEqual({ enabled: true, repos: {}, chosen: {}, dispatch: {} });
    expect(orcaEnabledFor(DEFAULT_ORCA_PREFS, 'x')).toBe(true);
  });

  it('reads an old file without the keys as the defaults', () => {
    expect(parseOrcaPrefs({})).toEqual(DEFAULT_ORCA_PREFS);
    expect(parseOrcaPrefs(undefined)).toEqual(DEFAULT_ORCA_PREFS);
  });

  it.each([
    ['a non-boolean switch', { enabled: 'yes' }],
    ['an unknown override value', { repos: { 'acme-co/acme-api': 'maybe' } }],
    ['an upper-case repo key', { repos: { 'Acme-API': 'on' } }],
    ['a chosen entry without a session', { chosen: { PR_1: { worktreeId: 'w' } } }],
  ])('falls back to the defaults for %s', (_label, raw) => {
    expect(parseOrcaPrefs(raw)).toEqual(DEFAULT_ORCA_PREFS);
  });

  it('applies a patch without mutating', () => {
    const base = parseOrcaPrefs({});
    const off = applyPrefsPatch(base, { enabled: false });
    const repo = applyPrefsPatch(off, { repo: 'acme-co/acme-api', mode: 'on' });
    expect(base.enabled).toBe(true);
    expect(repo).toMatchObject({ enabled: false, repos: { 'acme-co/acme-api': 'on' } });
    expect(applyPrefsPatch(repo, { repo: 'acme-co/acme-api', mode: 'default' }).repos).toEqual({});
  });

  it('validates the patch body', () => {
    expect(prefsPatchBody.safeParse({ enabled: true }).success).toBe(true);
    expect(prefsPatchBody.safeParse({ repo: 'acme-co/acme-api', mode: 'off' }).success).toBe(true);
    expect(prefsPatchBody.safeParse({ repo: '../x', mode: 'off' }).success).toBe(false);
    expect(prefsPatchBody.safeParse({ repo: 'acme-co/acme-api', mode: 'sometimes' }).success).toBe(false);
  });

  it('stores and clears a chosen session per PR', () => {
    const base = parseOrcaPrefs({});
    const set = withChosen(base, 'PR_1', { worktreeId: 'w', sessionId: 'w|p' });
    expect(set.chosen).toEqual({ PR_1: { worktreeId: 'w', sessionId: 'w|p' } });
    expect(withChosen(set, 'PR_1', null).chosen).toEqual({});
    expect(base.chosen).toEqual({});
  });
});
