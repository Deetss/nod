// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activityKeyAction } from '../web/activity-keys';
import { ACTIVITY_HELP_KEYS, FOOTER_ACTIVITY, HELP_KEYS } from '../web/keys';
import { parseView, saveView, savedView } from '../web/list-view';

describe('activityKeyAction', () => {
  it('maps j, k, Enter, O, R, ? and Escape', () => {
    expect(activityKeyAction('j', false)).toBe('next');
    expect(activityKeyAction('k', false)).toBe('prev');
    expect(activityKeyAction('Enter', false)).toBe('open');
    expect(activityKeyAction('O', false)).toBe('github');
    expect(activityKeyAction('R', false)).toBe('refresh');
    expect(activityKeyAction('?', false)).toBe('help');
    expect(activityKeyAction('Escape', false)).toBe('escape');
  });

  it('reads p, i and a as view jumps only right after g', () => {
    expect(activityKeyAction('p', true)).toBe('goPrs');
    expect(activityKeyAction('i', true)).toBe('goIssues');
    expect(activityKeyAction('a', true)).toBe('goActivity');
    expect(activityKeyAction('p', false)).toBeUndefined();
    expect(activityKeyAction('a', false)).toBeUndefined();
  });

  it('still reads j after g as a move', () => {
    expect(activityKeyAction('j', true)).toBe('next');
  });
});

describe('persisted list view', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('accepts activity as a view and rejects unknown values', () => {
    expect(parseView('activity')).toBe('activity');
    expect(parseView('nope')).toBeUndefined();
  });

  it('remembers activity between visits', () => {
    saveView('activity');
    expect(savedView()).toBe('activity');
    saveView('prs');
    expect(savedView()).toBe('prs');
  });
});

describe('help rows', () => {
  it('lists the g a key in the main help and in the Activity help', () => {
    expect(HELP_KEYS.some((k) => k.keys.includes('g a'))).toBe(true);
    expect(ACTIVITY_HELP_KEYS.some((k) => k.keys === 'g a')).toBe(true);
    expect(FOOTER_ACTIVITY.some((k) => k.keys === 'j/k')).toBe(true);
  });
});
