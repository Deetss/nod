// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_FINDING_THREADS, FIXTURE_REVIEWER } from '../server/fixture-findings';
import { bannerOf, dispatchAllOf, dispatchAllText, dispatchText, groupThreads, showDispatchAll } from '../shared/findings';
import type { ThreadItem } from '../shared/fix-comments';
import { SEND_MAX, type SessionView } from '../shared/orca-sessions';
import type { PrDetail } from '../shared/types';
import { FindingBanner } from '../web/FindingParts';
import { FOOTER_FINDINGS, HELP_KEYS } from '../web/keys';
import { setOrgSettings } from '../web/org-settings';
import { useFindings, type FindingControls, type FindingSender } from '../web/useFindings';
import { TEST_BOT, TEST_SETTINGS } from './bot-settings';

vi.mock('../web/api', () => ({ api: {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REPO = 'acme-co/orders-api';
const g = groupThreads(FIXTURE_FINDING_THREADS, FIXTURE_REVIEWER);
const [blocker, major] = dispatchAllOf(g);

function finding(n: number, text: string, severity: 'blocker' | 'major' = 'major') {
  const t = {
    kind: 'thread',
    at: '2026-11-15T09:00:00Z',
    id: `T${n}`,
    threadId: `PRRT_${n}`,
    path: `db/migrate/file_${n}.rb`,
    line: n,
    resolved: false,
    isOutdated: false,
    comments: [{ id: `C${n}`, author: 'review-bot', createdAt: '', bodyHtml: '', url: `https://github.com/${REPO}/pull/365#discussion_r${n}` }],
  } as ThreadItem;
  return { thread: t, severity, text };
}

describe('dispatchAllText', () => {
  it('is the single Dispatch message for one finding', () => {
    expect(dispatchAllText([blocker!], REPO, 365)).toBe(dispatchText(blocker!, REPO, 365));
    expect(dispatchAllText([blocker!], REPO, 365)).toHaveLength(306);
  });

  it('numbers the findings in list order on one tagged line', () => {
    const text = dispatchAllText([blocker!, major!], REPO, 365);
    expect(text).toHaveLength(553);
    expect(text).toBe(
      '[nod] 2 review findings on acme-co/orders-api#365. ' +
        '(1) blocker, db/migrate/20261113000000_add_amounts.rb:12: The diff adds the new migration without deleting the old version, so the duplicate version remains and migration loading still fails. https://github.com/acme-co/orders-api/pull/365#discussion_r2234567891 ' +
        '(2) major, db/migrate/20261113000000_add_amounts.rb:31: Rolling back the new migration drops the existing parcels table on a database where the old migration already ran. https://github.com/acme-co/orders-api/pull/365#discussion_r2234567892',
    );
    expect(text).not.toContain('\n');
  });

  it('cuts each text to an even share past 600 and keeps every link whole', () => {
    const long = [finding(1, 'a'.repeat(400)), finding(2, 'b'.repeat(400)), finding(3, 'c'.repeat(400))];
    const text = dispatchAllText(long, REPO, 365);
    expect(text.length).toBeLessThanOrEqual(SEND_MAX);
    for (const f of long) expect(text).toContain(` ${f.thread.comments[0]?.url}`);
    const kept = ['a', 'b', 'c'].map((ch) => (text.match(new RegExp(`${ch}+\\.\\.\\.`)) ?? [''])[0].length);
    expect(Math.max(...kept) - Math.min(...kept)).toBeLessThanOrEqual(1);
  });

  it('leaves a short text whole and gives its spare room to the long one', () => {
    const text = dispatchAllText([finding(1, 'Short one.'), finding(2, 'x'.repeat(800))], REPO, 365);
    expect(text).toContain(': Short one. https://');
    expect(text).toMatch(/x+\.\.\. https:/);
    expect(SEND_MAX - text.length).toBeLessThan(3);
  });

  it('comes back over the limit when the heads and links alone pass 600', () => {
    const many = Array.from({ length: 6 }, (_, i) => finding(i + 1, 'Text.'));
    for (const f of many) f.thread.comments[0]!.url = `https://github.com/${REPO}/pull/365#discussion_r${'9'.repeat(60)}${f.thread.line}`;
    expect(dispatchAllText(many, REPO, 365).length).toBeGreaterThan(SEND_MAX);
  });
});

describe('which findings Dispatch all carries', () => {
  it('takes unresolved bot findings only, never human threads or resolved findings', () => {
    const ids = dispatchAllOf(g).map((f) => f.thread.id);
    expect(ids).toEqual(['PRRC_ta1', 'PRRC_ta2']);
    expect(ids).not.toContain('PRRC_ta3');
    expect(ids).not.toContain('PRRC_ta4');
  });

  it('shows when blocked, Orca can take a message, and 2 or more are open', () => {
    const banner = bannerOf(g);
    expect(showDispatchAll(banner, true, 2)).toBe(true);
    expect(showDispatchAll(banner, false, 2)).toBe(false);
    expect(showDispatchAll(banner, true, 1)).toBe(false);
    expect(showDispatchAll({ ...banner, blocked: false }, true, 2)).toBe(false);
  });
});

describe('merge banner', () => {
  beforeEach(() => setOrgSettings({ ...TEST_SETTINGS, bot: { ...TEST_BOT, name: 'review-bot' } }));
  const banner = { unresolved: 3, findings: 2, blocked: true };
  const html = (over: Partial<Parameters<typeof FindingBanner>[0]>) =>
    renderToStaticMarkup(createElement(FindingBanner, { banner, botOn: true, canHand: true, cap: 'H', onHandAll: () => undefined, ...over }));

  it('puts Hand all and Dispatch all on their own row', () => {
    const out = html({ canDispatch: true, onDispatchAll: () => undefined, dispatchCap: 'S' });
    expect(out).toContain('has-actions');
    expect(out).toMatch(/finding-banner-actions.*Hand all to review-bot.*Dispatch all/);
  });

  it('hides Dispatch all, not disables it, when it cannot show', () => {
    const out = html({ canDispatch: false, onDispatchAll: () => undefined });
    expect(out).not.toContain('Dispatch all');
    expect(out).not.toContain('has-actions');
  });

  it('puts Dispatch all after the No bot set note when the bot is off', () => {
    const out = html({ botOn: false, canDispatch: true, onDispatchAll: () => undefined });
    expect(out).toMatch(/No bot set.*Dispatch all/);
    expect(out).not.toContain('Hand all');
  });

  it('counts what went to Orca in the sub line', () => {
    expect(html({ sent: 2 })).toContain('3 unresolved · 2 sent to Orca');
  });
});

describe('keys', () => {
  it('lists S in help and shares the footer entry with H', () => {
    expect(HELP_KEYS.some((k) => k.keys === 'S' && k.label.startsWith('dispatch all findings to Orca'))).toBe(true);
    expect(FOOTER_FINDINGS).toHaveLength(6);
    expect(FOOTER_FINDINGS.at(-1)).toEqual({ keys: 'H S', label: 'hand all / dispatch all' });
  });
});

describe('useFindings Dispatch all', () => {
  let root: Root | undefined;
  let host: HTMLElement | undefined;
  beforeEach(() => setOrgSettings({ ...TEST_SETTINGS, reviewer: FIXTURE_REVIEWER }));
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
  });

  const detail = { summary: { id: 'pr-365', repo: REPO, number: 365 }, isOpen: true, headRef: 'feature/365', thread: FIXTURE_FINDING_THREADS } as unknown as PrDetail;
  const session: SessionView = { id: 's1', host: 'local', name: 'fix-migration-365', state: 'working', branch: 'b', via: 'pr', reason: 'linked PR #365' };

  function mount(sender: FindingSender | undefined) {
    const notify = vi.fn();
    let c: FindingControls | undefined;
    function Harness() {
      c = useFindings({ detail, limited: false, sender, notify, onDone: () => undefined });
      return null;
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(createElement(Harness)));
    return { get: () => c!, notify };
  }

  const senderWith = (sendAll: FindingSender['sendAll']): FindingSender => ({
    send: () => true,
    offer: { related: [session], possible: [], single: session, agents: ['claude'], headRef: 'feature/365' },
    sendAll,
    pick: () => undefined,
  });

  it('is hidden without Orca', () => {
    expect(mount(undefined).get().canDispatchAll).toBe(false);
  });

  it('rebuilds the prompt on untick until the user edits it', () => {
    const h = mount(senderWith(vi.fn()));
    act(() => h.get().openDispatchAll());
    expect(h.get().dispatchAll?.text).toHaveLength(553);
    act(() => h.get().toggleDispatchAll('PRRC_ta2'));
    expect(h.get().dispatchAll?.text).toHaveLength(306);
    act(() => h.get().editDispatchAll('my own words'));
    act(() => h.get().toggleDispatchAll('PRRC_ta2'));
    expect(h.get().dispatchAll).toMatchObject({ text: 'my own words', stale: true });
    expect(h.get().dispatchAll?.rows.filter((r) => r.checked)).toHaveLength(2);
    act(() => h.get().rebuildDispatchAll());
    expect(h.get().dispatchAll).toMatchObject({ edited: false, stale: false });
    expect(h.get().dispatchAll?.text).toHaveLength(553);
  });

  it('sends once and marks every ticked card dispatched', async () => {
    const sendAll = vi.fn().mockResolvedValue({ name: 'fix-migration-365', status: 'sent' });
    const h = mount(senderWith(sendAll));
    act(() => h.get().openDispatchAll());
    await act(async () => h.get().confirmDispatchAll({ kind: 'session', session }));
    expect(sendAll).toHaveBeenCalledTimes(1);
    expect(h.get().dispatchAll).toBeUndefined();
    expect(h.get().cell('PRRC_ta1').dispatch).toMatchObject({ s: 'done', note: 'fix-migration-365' });
    expect(h.get().cell('PRRC_ta2').dispatch).toMatchObject({ s: 'done', note: 'fix-migration-365' });
    expect(h.get().sentCount).toBe(2);
    expect(h.notify).toHaveBeenCalledWith(true, 'Dispatched 2 findings to fix-migration-365');
  });

  it('keeps the confirm open with the text when the session refuses it', async () => {
    const h = mount(senderWith(vi.fn().mockResolvedValue({ name: 'fix-migration-365', status: 'blocked' })));
    act(() => h.get().openDispatchAll());
    await act(async () => h.get().confirmDispatchAll({ kind: 'session', session }));
    expect(h.get().dispatchAll).toMatchObject({ busy: false, error: 'Not sent: fix-migration-365 is showing a prompt. Your text is kept.' });
    expect(h.get().cell('PRRC_ta1').dispatch.s).toBe('idle');
  });

  it('writes the failure on every ticked card when the send is not confirmed', async () => {
    const h = mount(senderWith(vi.fn().mockResolvedValue({ name: 'fix-migration-365', status: 'unconfirmed' })));
    act(() => h.get().openDispatchAll());
    act(() => h.get().toggleDispatchAll('PRRC_ta2'));
    await act(async () => h.get().confirmDispatchAll({ kind: 'session', session }));
    expect(h.get().cell('PRRC_ta1').dispatch).toMatchObject({ s: 'failed', all: true });
    expect(h.get().cell('PRRC_ta2').dispatch.s).toBe('idle');
    act(() => h.get().retryDispatchAll());
    expect(h.get().dispatchAll?.rows.map((r) => r.checked)).toEqual([true, false]);
  });
});
