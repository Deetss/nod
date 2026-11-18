// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostStatus } from '../shared/orca-hosts';
import type { PrSessions, SessionView } from '../shared/orca-sessions';
import { DispatchAllDialog } from '../web/DispatchAll';
import { HostSelect } from '../web/orca/HostPicker';
import { carryOffline, hostMenu, LOCAL_ONLY, offlineNotes, worktreeHost } from '../web/orca/hosts';
import { chipInputFor, hostChoice } from '../web/orca/OrcaContext';
import { OrcaChip } from '../web/orca/orca-ui';
import { OrcaSection, type OrcaSectionProps } from '../web/orca/OrcaSection';
import { Row } from '../web/orca/SessionPicker';
import { PhoneDispatchAll } from '../web/phone/PhoneDispatchAll';
import type { DispatchAllView, DispatchOffer } from '../web/useFindings';

vi.mock('../web/api', () => ({ api: { orcaModels: () => new Promise(() => undefined) } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.now();
const HOSTS: HostStatus[] = [
  { name: 'local', online: true, lastSeen: NOW },
  { name: 'laptop', online: true, lastSeen: NOW },
  { name: 'desktop', online: false, lastSeen: NOW - 2 * 3600_000 },
];

const session = (over: Partial<SessionView> = {}): SessionView => ({
  id: 's1',
  host: 'local',
  name: 'fix-migration-365',
  state: 'working',
  branch: 'sam-lee/fix-migration-365',
  via: 'pr',
  reason: 'linked PR #365',
  ...over,
});
const review = session({ id: 's2', host: 'laptop', name: 'review-365', state: 'done' });
const crew = session({ id: 's3', host: 'laptop', name: 'crew-310', via: 'number', reason: 'branch crew/orders-read-bonus' });

let root: Root | undefined;
let host: HTMLElement | undefined;
function render(node: ReturnType<typeof createElement>): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
});

const choice = (hosts: readonly HostStatus[], prefs: { hosts?: Record<string, string> } = {}, setRepoHost = vi.fn()) =>
  hostChoice({ hosts, hostPrefs: prefs, setRepoHost }, 'acme-co/orders-api');

function view(offer: Partial<DispatchOffer> = {}): DispatchAllView {
  return {
    repo: 'acme-co/orders-api',
    number: 365,
    rows: [],
    text: '[nod] two findings',
    edited: false,
    stale: false,
    busy: false,
    error: undefined,
    offer: { related: [session(), review], possible: [crew], agents: ['claude'], headRef: 'feature/365', ...offer },
    picked: undefined,
  };
}
const dialog = (v: DispatchAllView, onConfirm = vi.fn()) =>
  createElement(DispatchAllDialog, { v, onToggle: vi.fn(), onEdit: vi.fn(), onRebuild: vi.fn(), onCancel: vi.fn(), onConfirm });

describe('host logic', () => {
  it('notes at most two offline hosts, then a count', () => {
    const many = [...HOSTS, { name: 'tower', online: false, lastSeen: null }, { name: 'nas', online: false, lastSeen: null }];
    expect(offlineNotes(HOSTS, NOW)).toEqual(['desktop is offline (seen 2h ago), so its sessions are not listed.']);
    expect(offlineNotes(many, NOW)).toEqual([
      'desktop is offline (seen 2h ago), so its sessions are not listed.',
      'tower is offline (never seen), so its sessions are not listed.',
      'and 1 more',
    ]);
  });

  it('orders the menu online first, in list order, then offline', () => {
    const shuffled = [HOSTS[2]!, HOSTS[0]!, HOSTS[1]!];
    const m = hostMenu(shuffled);
    expect(m.online.map((h) => h.name)).toEqual(['local', 'laptop']);
    expect(m.offline.map((h) => h.name)).toEqual(['desktop']);
  });

  it('falls back to local when the repo host is offline, and names it', () => {
    expect(worktreeHost({ hosts: { 'acme-co/orders-api': 'laptop' } }, 'acme-co/orders-api', HOSTS)).toEqual({ host: 'laptop' });
    expect(worktreeHost({ hosts: { 'acme-co/orders-api': 'desktop' } }, 'acme-co/orders-api', HOSTS)).toEqual({ host: 'local', fallback: HOSTS[2] });
    expect(worktreeHost({ defaultHost: 'laptop' }, 'acme-co/other', HOSTS)).toEqual({ host: 'laptop' });
  });

  it('keeps a session whose host missed the snapshot, whichever poll lands first', () => {
    const was: Record<string, PrSessions> = { pr: { related: [session({ host: 'desktop', id: 'd1' })], possible: [] } };
    const at = NOW;
    const staleHosts = HOSTS.map((h) => (h.name === 'desktop' ? { ...h, online: true, lastSeen: at - 20_000 } : h));
    expect(carryOffline(was, {}, staleHosts, at).pr?.related).toHaveLength(1);
    expect(carryOffline(was, {}, HOSTS, at).pr?.related).toHaveLength(1);
    const back = HOSTS.map((h) => (h.name === 'desktop' ? { ...h, online: true, lastSeen: at } : h));
    expect(carryOffline(was, {}, back, at).pr).toBeUndefined();
  });
});

describe('D1 Send to list', () => {
  it('tags only non-local rows', () => {
    const el = render(
      createElement('div', null, [
        createElement(Row, { key: 'a', s: session(), focused: false, hint: '', onPick: vi.fn() }),
        createElement(Row, { key: 'b', s: review, focused: false, hint: '', onPick: vi.fn() }),
      ]),
    );
    const tags = [...el.querySelectorAll('.orca-host-tag')].map((t) => t.textContent);
    expect(tags).toEqual(['laptop']);
  });

  it('ends in a New worktree row on the repo host, with one offline note', () => {
    act(() => void render(dialog(view({ host: choice(HOSTS) }))));
    const body = document.body;
    expect(body.querySelector('.orca-new-row')?.textContent).toContain('New worktree');
    expect(body.querySelector('.orca-host-button')?.textContent).toBe('local (hub)');
    expect(body.querySelector('.orca-offline-note')?.textContent).toBe('desktop is offline (seen 2h ago), so its sessions are not listed.');
  });

  it('stores the picked host as the repo pref and dispatches there', () => {
    const setRepoHost = vi.fn();
    const onConfirm = vi.fn();
    render(dialog(view({ host: choice(HOSTS, {}, setRepoHost) }), onConfirm));
    const b = document.body;
    act(() => (b.querySelector('.orca-new-row') as HTMLElement).click());
    act(() => (b.querySelector('.orca-host-button') as HTMLElement).click());
    const laptop = [...b.querySelectorAll('.orca-host-row')].find((r) => r.textContent === 'laptop') as HTMLElement;
    act(() => laptop.click());
    expect(setRepoHost).toHaveBeenCalledWith('acme-co/orders-api', 'laptop');
    expect(b.querySelector('.orca-host-button')?.textContent).toBe('laptop');
  });

  it('says why the row fell back when the repo host is offline (D3)', () => {
    render(dialog(view({ host: choice(HOSTS, { hosts: { 'acme-co/orders-api': 'desktop' } }) })));
    expect(document.body.querySelector('.orca-host-fallback')?.textContent).toBe('This repo usually runs on desktop, which is offline (seen 2h ago).');
    expect(document.body.querySelector('.orca-host-button')?.textContent).toBe('local (hub)');
  });
});

describe('D2 host menu', () => {
  it('lists online hosts first, greys offline ones, and only picks online', () => {
    const onPick = vi.fn();
    const el = render(createElement(HostSelect, { hosts: [HOSTS[2]!, HOSTS[0]!, HOSTS[1]!], value: 'local', label: 'Host', onPick }));
    act(() => (el.querySelector('.orca-host-button') as HTMLElement).click());
    const rows = [...el.querySelectorAll('.orca-host-row')];
    expect(rows.map((r) => r.textContent)).toEqual(['local (hub)', 'laptop', 'desktopoffline · 2h ago']);
    expect(rows[2]?.getAttribute('aria-disabled')).toBe('true');
    act(() => (rows[2] as HTMLElement).click());
    expect(onPick).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Offline hosts cannot be picked.');
  });

  it('moves with arrows, picks with Enter, and Esc closes only the menu', () => {
    const onPick = vi.fn();
    const outer = vi.fn();
    const el = render(createElement('div', { onKeyDown: outer }, createElement(HostSelect, { hosts: HOSTS, value: 'local', label: 'Host', onPick })));
    act(() => (el.querySelector('.orca-host-button') as HTMLElement).click());
    const menu = () => el.querySelector('.orca-host-menu') as HTMLElement;
    act(() => void menu().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    act(() => void menu().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    act(() => void menu().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onPick).toHaveBeenCalledWith('laptop');
    act(() => (el.querySelector('.orca-host-button') as HTMLElement).click());
    act(() => void menu().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(el.querySelector('.orca-host-menu')).toBeNull();
    expect(outer).not.toHaveBeenCalled();
  });
});

describe('C1 chips and card', () => {
  it('prefixes the host for a remote session and keeps local chips as before', () => {
    const remote = render(createElement(OrcaChip, { input: chipInputFor({ related: [review], possible: [] }, HOSTS)! }));
    expect(remote.textContent).toBe('laptop · done');
    act(() => root?.unmount());
    const local = render(createElement(OrcaChip, { input: chipInputFor({ related: [session()], possible: [] }, HOSTS)! }));
    expect(local.textContent).toBe('fix-migration-365working');
  });

  it('shows an offline host dashed, with how long ago it answered', () => {
    const off = session({ host: 'desktop', name: 'webhooks-373' });
    const el = render(createElement(OrcaChip, { input: chipInputFor({ related: [off], possible: [] }, HOSTS)! }));
    expect(el.textContent).toBe('desktop · offline 2h');
    expect(el.querySelector('.orca-chip')?.className).toContain('is-offline');
  });

  it('names the host on the card and disables Send for an offline one', () => {
    const noop = vi.fn();
    const props: OrcaSectionProps = {
      prId: 'PR_1',
      repo: 'acme-co/orders-api',
      sessions: { related: [session({ host: 'desktop', name: 'webhooks-373' })], possible: [] },
      hosts: HOSTS,
      autoOn: true,
      outcome: undefined,
      sent: undefined,
      busy: false,
      onSend: noop,
      onOpen: noop,
      onChoose: noop,
      onCloseOutcome: noop,
      onSendAgain: noop,
      onCheckAgain: noop,
      onRetry: noop,
      onDispatch: noop,
      onCopy: noop,
      onTurnOn: noop,
    };
    const el = render(createElement(OrcaSection, props));
    expect(el.querySelector('.orca-on-host')?.textContent).toBe('on desktop');
    const send = [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Send message')) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.title).toContain('Orca host desktop is offline');
  });
});

describe('P1 phone sheet', () => {
  it('lists sessions with tags, a New worktree card with Run on, and the offline note', () => {
    render(
      createElement(PhoneDispatchAll, {
        v: view({ host: choice(HOSTS) }),
        onToggle: vi.fn(),
        onEdit: vi.fn(),
        onRebuild: vi.fn(),
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }),
    );
    const b = document.body;
    expect([...b.querySelectorAll('.ph-send-row .ph-host-tag')].map((t) => t.textContent)).toEqual(['laptop', 'laptop']);
    expect(b.querySelector('.ph-host-field')?.textContent).toContain('Run onlocal (hub)');
    expect(b.querySelector('.ph-offline-note')?.textContent).toContain('desktop is offline');
    act(() => (b.querySelector('.ph-host-field') as HTMLElement).click());
    const desktop = [...b.querySelectorAll('.ph-pk-row')].find((r) => r.textContent?.includes('desktop'));
    expect(desktop?.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('one machine', () => {
  it('draws the dispatch dialog exactly as before hosts', () => {
    const local = { related: [session(), { ...review, host: 'local' }], possible: [{ ...crew, host: 'local' }] };
    render(dialog(view(local)));
    const before = document.body.innerHTML;
    act(() => root?.unmount());
    document.body.innerHTML = '';
    render(dialog(view({ ...local, host: choice(LOCAL_ONLY) })));
    const after = document.body.innerHTML;
    expect(after).toBe(before);
    expect(after).not.toMatch(/New worktree|This machine|local \(hub\)|orca-host/);
  });

  it('keeps a local chip without host words', () => {
    const el = render(createElement(OrcaChip, { input: chipInputFor({ related: [session()], possible: [] }, LOCAL_ONLY)! }));
    expect(el.textContent).not.toMatch(/local|·/);
  });
});
