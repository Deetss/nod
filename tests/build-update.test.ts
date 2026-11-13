// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  DEV_BUILD,
  formatBuildId,
  parseOpenParam,
  phonesUpdateText,
  reloadDecision,
  reloadUrl,
  type UpdateSignal,
} from '../shared/build-update';
import { createUpdateWatcher, hasUnsentDraft, parseSignal, RELOAD_DELAY_MS, type UpdateNotice } from '../web/build-updates';

const OLD = '8152277-2026-11-11T17:00:00Z';
const NEW = 'a995b64-2026-11-11T18:00:00Z';
const build = (b: string): UpdateSignal => ({ kind: 'build', build: b });
const none = new Set<string>();

describe('build id', () => {
  it('is the short sha plus the build time to the second', () => {
    expect(formatBuildId('8152277', new Date('2026-11-11T17:12:03.456Z'))).toBe('8152277-2026-11-11T17:12:03Z');
  });
});

describe('reloadDecision', () => {
  it('reloads when the server build differs from the page build', () => {
    expect(reloadDecision({ signal: build(NEW), client: OLD, reloaded: none, draft: false })).toBe('reload');
  });

  it('does nothing when the builds match', () => {
    expect(reloadDecision({ signal: build(OLD), client: OLD, reloaded: none, draft: false })).toBe('none');
  });

  it('never reloads a dev build or for a dev server', () => {
    expect(reloadDecision({ signal: build(NEW), client: DEV_BUILD, reloaded: none, draft: false })).toBe('none');
    expect(reloadDecision({ signal: build(DEV_BUILD), client: OLD, reloaded: none, draft: false })).toBe('none');
  });

  it('reloads at most once per build id in a tab', () => {
    const reloaded = new Set([`build:${NEW}`]);
    expect(reloadDecision({ signal: build(NEW), client: OLD, reloaded, draft: false })).toBe('none');
  });

  it('offers a reload instead when a comment box holds unsent text', () => {
    expect(reloadDecision({ signal: build(NEW), client: OLD, reloaded: none, draft: true })).toBe('prompt');
  });

  it('follows an Update phones press even on the same build, once per press', () => {
    const signal: UpdateSignal = { kind: 'reload', build: OLD, nonce: 'n1' };
    expect(reloadDecision({ signal, client: OLD, reloaded: none, draft: false })).toBe('reload');
    expect(reloadDecision({ signal, client: OLD, reloaded: new Set(['reload:n1']), draft: false })).toBe('none');
    expect(reloadDecision({ signal, client: OLD, reloaded: none, draft: true })).toBe('prompt');
  });
});

describe('reloadUrl', () => {
  it('keeps the open PR or issue and the other params, and drops a stale open and apk', () => {
    const loc = { pathname: '/', search: '?state=empty&open=issue/old/1&apk=4' };
    expect(reloadUrl(loc, { kind: 'pr', repo: 'nod', number: 12 })).toBe('/?state=empty&open=pr/nod/12');
    expect(reloadUrl(loc, undefined)).toBe('/?state=empty');
    expect(reloadUrl({ pathname: '/', search: '' }, undefined)).toBe('/');
  });

  it('round-trips through parseOpenParam', () => {
    const url = reloadUrl({ pathname: '/', search: '' }, { kind: 'issue', repo: 'acme-co/acme-web', number: 7 });
    expect(parseOpenParam(new URL(url, 'http://x').searchParams.get('open'))).toEqual({
      kind: 'issue',
      repo: 'acme-co/acme-web',
      number: 7,
    });
    expect(parseOpenParam('commit/nod/1')).toBeUndefined();
    expect(parseOpenParam(null)).toBeUndefined();
  });
});

describe('hasUnsentDraft', () => {
  it('is true only while a textarea holds text', () => {
    const root = document.createElement('div');
    const box = document.createElement('textarea');
    root.append(box);
    expect(hasUnsentDraft(root)).toBe(false);
    box.value = '   ';
    expect(hasUnsentDraft(root)).toBe(false);
    box.value = 'Looks good';
    expect(hasUnsentDraft(root)).toBe(true);
  });
});

describe('parseSignal', () => {
  it('reads build and reload events and rejects anything else', () => {
    expect(parseSignal('build', JSON.stringify({ kind: 'build', build: NEW }))).toEqual(build(NEW));
    expect(parseSignal('reload', JSON.stringify({ build: NEW, nonce: 'x' }))).toEqual({ kind: 'reload', build: NEW, nonce: 'x' });
    expect(parseSignal('reload', JSON.stringify({ build: NEW }))).toBeUndefined();
    expect(parseSignal('build', 'not json')).toBeUndefined();
  });
});

function watcher(opts: { draft?: boolean; search?: string } = {}) {
  const store = new Map<string, string>();
  const session = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const navigated: string[] = [];
  const shown: (UpdateNotice | undefined)[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let draft = opts.draft ?? false;
  const w = createUpdateWatcher({
    client: OLD,
    session,
    hasDraft: () => draft,
    currentOpen: () => ({ kind: 'pr', repo: 'nod', number: 12 }),
    location: () => ({ pathname: '/', search: opts.search ?? '' }),
    navigate: (url) => navigated.push(url),
    show: (n) => shown.push(n),
    later: (fn, ms) => timers.push({ fn, ms }),
  });
  const flush = () => timers.splice(0).forEach((t) => t.fn());
  return { w, navigated, shown, timers, flush, setDraft: (d: boolean) => (draft = d) };
}

describe('update watcher', () => {
  it('shows "Nod updated", then reloads onto the open PR', () => {
    const t = watcher();
    t.w.onSignal(build(NEW));
    expect(t.shown).toEqual(['updated']);
    expect(t.timers[0]?.ms).toBe(RELOAD_DELAY_MS);
    t.flush();
    expect(t.navigated).toEqual(['/?open=pr/nod/12']);
  });

  it('reloads once per build id even when the server keeps announcing it', () => {
    const t = watcher();
    t.w.onSignal(build(NEW));
    t.flush();
    t.w.onSignal(build(NEW));
    t.flush();
    expect(t.navigated).toHaveLength(1);
  });

  it('waits for a tap while a draft is unsent', () => {
    const t = watcher({ draft: true });
    t.w.onSignal(build(NEW));
    expect(t.shown).toEqual(['ready']);
    expect(t.timers).toHaveLength(0);
    expect(t.navigated).toHaveLength(0);
    t.w.reloadNow();
    expect(t.navigated).toEqual(['/?open=pr/nod/12']);
  });
});

describe('phonesUpdateText', () => {
  it('reports what the button did', () => {
    expect(phonesUpdateText({ reloaded: 1, notified: 1, apkNotified: 0 })).toBe('Reloaded 1 phone, notified 1');
    expect(phonesUpdateText({ reloaded: 2, notified: 0, apkNotified: 1 })).toBe(
      'Reloaded 2 phones, notified 0, 1 told about the app update',
    );
    expect(phonesUpdateText({ reloaded: 0, notified: 0, apkNotified: 0 })).toBe('No phones connected or subscribed');
  });
});
