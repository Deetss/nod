// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_ORGS_WITH_INVOLVED, orgScope } from '../shared/org-scope';
import { DEFAULT_SETTINGS, parseSettings } from '../shared/settings';
import { closedSearch } from '../server/closed';
import { issueDeltaSearch, issueFullSearch, mentionDeltaSearch, mentionFullSearch } from '../server/issue-queries';
import { deltaSearch, fullSearch, ownOpenSearch } from '../server/queries';
import { SettingsPane } from '../web/settings/SettingsPanes';
import { toForm, toRaw, validateForm, type FormState } from '../web/settings/form';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('orgScope', () => {
  it('keeps the plain org list when the switch is off', () => {
    expect(orgScope(['a', 'b'])).toBe('org:a org:b');
    expect(orgScope(['a', 'b'], false)).toBe('org:a org:b');
  });

  it('ORs the orgs with involves:@me when the switch is on', () => {
    expect(orgScope(['a', 'b'], true)).toBe('(org:a OR org:b OR involves:@me)');
  });

  it('searches involves:@me alone when there are no orgs, switch or not', () => {
    expect(orgScope([], true)).toBe('involves:@me');
    expect(orgScope([], false)).toBe('involves:@me');
  });
});

describe('searches take the switch', () => {
  const orgs = ['acme-co'];
  const scope = '(org:acme-co OR involves:@me)';

  it('puts the scope in every query', () => {
    expect(fullSearch(orgs, true)).toBe(`is:open is:pr ${scope}`);
    expect(deltaSearch(orgs, 0, 0, true)).toContain(`is:pr ${scope} updated:`);
    expect(ownOpenSearch(orgs, 'me', true)).toBe(`is:pr is:open ${scope} author:me`);
    expect(issueFullSearch(orgs, true)).toBe(`is:open is:issue ${scope}`);
    expect(mentionFullSearch(orgs, true)).toBe(`is:open is:issue ${scope} mentions:@me`);
    expect(issueDeltaSearch(orgs, 0, 0, true)).toContain(`is:issue ${scope} updated:`);
    expect(mentionDeltaSearch(orgs, 0, 0, true)).toContain(`${scope} updated:`);
    expect(closedSearch('prs', orgs, 30, 0, true)).toContain(`is:pr is:closed ${scope} closed:`);
  });

  it('keeps the current query when the switch is off', () => {
    expect(fullSearch(orgs, false)).toBe('is:open is:pr org:acme-co');
  });
});

describe('includeInvolved setting', () => {
  it('defaults to on, also for a file that lists orgs and never mentions it', () => {
    expect(DEFAULT_SETTINGS.includeInvolved).toBe(true);
    const parsed = parseSettings({ orgs: ['acme-co'] });
    expect(parsed.ok && parsed.settings.includeInvolved).toBe(true);
  });

  it('allows up to the cap with the switch on, and names the fifth org when over', () => {
    const ok = Array.from({ length: MAX_ORGS_WITH_INVOLVED }, (_, i) => `org-${i}`);
    expect(parseSettings({ orgs: ok }).ok).toBe(true);
    const over = parseSettings({ orgs: [...ok, 'org-x'] });
    expect(over.ok).toBe(false);
    expect(over.ok === false && over.message).toContain('orgs.4');
  });

  it('allows more orgs with the switch off', () => {
    const many = Array.from({ length: 6 }, (_, i) => `org-${i}`);
    expect(parseSettings({ orgs: many, includeInvolved: false }).ok).toBe(true);
  });

  it('round-trips through the dialog form', () => {
    const off = { ...DEFAULT_SETTINGS, orgs: ['acme-co'], includeInvolved: false };
    expect(toForm(off).includeInvolved).toBe(false);
    expect((toRaw(toForm(off)) as { includeInvolved: boolean }).includeInvolved).toBe(false);
  });

  it('puts the fifth-org error on that org field', () => {
    const form: FormState = { ...toForm(DEFAULT_SETTINGS), orgs: ['a', 'b', 'c', 'd', 'e'] };
    expect(Object.keys(validateForm(form))).toEqual(['orgs.4']);
  });
});

describe('GitHub pane', () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  function pane(form: FormState, patch = vi.fn()): HTMLElement {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(createElement(SettingsPane, { section: 'github', form, errors: {}, patch, onEnter: () => undefined })),
    );
    return host;
  }

  const base = toForm(DEFAULT_SETTINGS);

  it('shows the switch on, with the OR query, when orgs are set', () => {
    const el = pane({ ...base, orgs: ['acme-co', 'acme-web'] });
    const sw = el.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(sw?.getAttribute('aria-checked')).toBe('true');
    expect(sw?.disabled).toBe(false);
    expect(el.querySelector('.settings-query')?.textContent).toBe('(org:acme-co OR org:acme-web OR involves:@me)');
  });

  it('changes the setting and the query when the switch is turned off', () => {
    const patch = vi.fn();
    const el = pane({ ...base, orgs: ['acme-co'] }, patch);
    act(() => el.querySelector<HTMLButtonElement>('[role="switch"]')?.click());
    expect(patch).toHaveBeenCalledWith({ includeInvolved: false });
    act(() => root?.unmount());
    host?.remove();
    const off = pane({ ...base, orgs: ['acme-co'], includeInvolved: false });
    expect(off.querySelector('.settings-query')?.textContent).toBe('org:acme-co');
  });

  it('locks the switch and searches involves:@me when there are no orgs', () => {
    const el = pane({ ...base, orgs: [], includeInvolved: false });
    const sw = el.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(sw?.disabled).toBe(true);
    expect(sw?.getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('.settings-switch-row')?.classList.contains('is-locked')).toBe(true);
    expect(el.querySelector('.settings-query')?.textContent).toBe('involves:@me');
  });

  it('ignores blank org rows in the query', () => {
    const el = pane({ ...base, orgs: ['acme-co', '  '] });
    expect(el.querySelector('.settings-query')?.textContent).toBe('(org:acme-co OR involves:@me)');
  });
});
