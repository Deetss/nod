import { describe, expect, it } from 'vitest';
import {
  MAX_BODY,
  MAX_ITEMS,
  MAX_TITLE,
  parseNotifyItems,
  parseSettings,
  parseTarget,
} from '../shared/notify-payload';
import { DEFAULT_SETTINGS } from '../shared/notify-rules';

const target = { kind: 'pr', repo: 'acme-co/acme-api', number: 310 };
const item = { title: 'Review requested: acme-co/acme-api #310', body: 'Fix totals', target };

describe('parseTarget', () => {
  it('accepts an issue target', () => {
    expect(parseTarget({ ...target, kind: 'issue' })).toEqual({ ...target, kind: 'issue' });
  });

  it('accepts a PR target', () => {
    expect(parseTarget(target)).toEqual(target);
  });

  it.each([
    ['wrong kind', { ...target, kind: 'repo' }],
    ['bare repo', { ...target, repo: 'acme-api' }],
    ['repo with two slashes', { ...target, repo: 'a/b/c' }],
    ['empty repo', { ...target, repo: '' }],
    ['non-integer number', { ...target, number: 1.5 }],
    ['zero number', { ...target, number: 0 }],
    ['string number', { ...target, number: '3' }],
    ['extra key', { ...target, url: 'x' }],
    ['not an object', 'pr'],
    ['null', null],
  ])('rejects %s', (_name, value) => {
    expect(parseTarget(value)).toBeUndefined();
  });
});

describe('parseNotifyItems', () => {
  it('accepts items with and without a target', () => {
    const summary = { title: '5 updates in Nod', body: '' };
    expect(parseNotifyItems([item, summary])).toEqual([item, summary]);
  });

  it('keeps a known kind for the log line', () => {
    expect(parseNotifyItems([{ ...item, kind: 'shipped' }])).toEqual([{ ...item, kind: 'shipped' }]);
  });

  it('accepts an empty list', () => {
    expect(parseNotifyItems([])).toEqual([]);
  });

  it.each([
    ['not an array', {}],
    ['too many items', Array.from({ length: MAX_ITEMS + 1 }, () => item)],
    ['empty title', [{ ...item, title: '' }]],
    ['long title', [{ ...item, title: 'x'.repeat(MAX_TITLE + 1) }]],
    ['long body', [{ ...item, body: 'x'.repeat(MAX_BODY + 1) }]],
    ['non-string body', [{ ...item, body: 4 }]],
    ['bad target', [{ ...item, target: { ...target, number: -1 } }]],
    ['extra key', [{ ...item, icon: 'x' }]],
    ['unknown kind', [{ ...item, kind: 'exfiltrate' }]],
    ['one bad item among good ones', [item, { title: 1, body: '' }]],
  ])('rejects %s', (_name, value) => {
    expect(parseNotifyItems(value)).toBeUndefined();
  });
});

describe('parseSettings', () => {
  it('accepts the default settings', () => {
    expect(parseSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('fills a trigger saved before it existed with its default and keeps the rest', () => {
    const saved = { muted: false, review: false, feedback: true, ci: true, issueAssigned: true, issueMention: true };
    expect(parseSettings(saved)).toEqual({ ...saved, shipped: true });
  });

  it.each([
    ['non-boolean value', { ...DEFAULT_SETTINGS, ci: 'yes' }],
    ['extra key', { ...DEFAULT_SETTINGS, extra: true }],
    ['array', []],
    ['null', null],
  ])('rejects %s', (_name, value) => {
    expect(parseSettings(value)).toBeUndefined();
  });
});
