import { describe, expect, it } from 'vitest';
import { fixtureConnections } from '../server/connections-fixtures';
import type { ConnectionsBody } from '../shared/connections';
import { chipFor, desktopRows, stripFor, versionText } from '../web/connections/model';
import { phoneRail } from '../web/connections/phone-model';

const NOW = Date.parse('2026-11-18T12:24:00');
const ctx = { now: NOW, clock: '12h' as const };
const body = (state?: string): ConnectionsBody => fixtureConnections(state, NOW);

describe('chip, worst state wins', () => {
  it.each([
    [undefined, 'checking', 'Checking…'],
    ['ok', 'ok', 'Service · 2 devices'],
    ['conn-local', 'ok', 'Local · 1 device'],
    ['conn-off', 'neutral', 'This machine only'],
    ['conn-warn', 'attention', '1 warning'],
    ['conn-broken', 'danger', 'Sync failing'],
    ['conn-nodevices', 'ok', 'Service · 0 devices'],
    ['conn-noorca', 'ok', 'Service · 2 devices'],
  ])('%s reads %s, %s', (state, tone, label) => {
    const chip = chipFor(state === undefined ? undefined : body(state), ctx);
    expect(chip.tone).toBe(tone);
    expect(chip.label).toBe(label);
  });

  it('puts danger over warnings, and names the first broken link', () => {
    const b = body('conn-warn');
    const broken = { ...b, tailscale: { ...b.tailscale, serve: 'off' as const, reachable: undefined } };
    expect(chipFor(broken, ctx)).toMatchObject({ tone: 'danger', label: 'Tailscale off', short: '1' });
  });

  it('counts every warning: optional scope, low budget, stale device, failed reach', () => {
    const b = body('conn-warn');
    const many: ConnectionsBody = {
      ...b,
      github: { ...b.github, missing: ['project'] },
      tailscale: { ...b.tailscale, reachable: false },
    };
    expect(chipFor(many, ctx)).toMatchObject({ tone: 'attention', label: '3 warnings', short: '3' });
    const low = { ...body(), github: { ...body().github, rate: { limit: 5000, remaining: 312, resetAt: '' } } };
    expect(chipFor(low, ctx).label).toBe('1 warning');
  });

  it('keeps the device count for the narrow chip', () => {
    expect(chipFor(body(), ctx).short).toBe('2');
  });
});

describe('popover rows', () => {
  it('lists GitHub, This Nod, Tailscale, devices by last seen, Orca', () => {
    const { rows } = desktopRows(body(), ctx);
    expect(rows.map((r) => r.name)).toEqual(['GitHub', 'This Nod', 'Tailscale', 'Android phone', 'Laptop browser', 'Orca']);
    expect(rows.map((r) => r.mark)).toEqual(['ok', 'ok', 'ok', 'ok', 'off', 'ok']);
    expect(rows[0]?.detail).toBe('All scopes on. API 4,885 / 5,000.');
    expect(rows[1]?.detail).toBe('v0.2.32. Synced 2m ago, no errors.');
    expect(rows[2]).toMatchObject({ detail: 'https://hub.example.ts.net', mono: true, action: 'copy' });
    expect(rows[3]).toMatchObject({ detail: expect.stringMatching(/^Seen .+\. Push on\.$/), action: 'rename', deviceId: 'fx-phone' });
    expect(rows[5]?.detail).toBe('Running here. 3 repos, 5 sessions.');
  });

  it('puts the broken row first with Fix, and shows each off link', () => {
    const { rows } = desktopRows(body('conn-broken'), ctx);
    expect(rows[0]).toMatchObject({ name: 'GitHub', mark: 'broken', action: 'fix', detail: 'Last 3 syncs failed: gh is logged out.' });
    expect(rows.find((r) => r.name === 'This Nod')?.detail).toBe('v0.2.32. Own server on port 41873.');
    expect(rows.find((r) => r.name === 'Tailscale')).toMatchObject({ mark: 'off', detail: 'Phone access is off.', action: 'setup' });
    expect(rows.find((r) => r.name === 'Devices')?.detail).toBe('No devices paired.');
    expect(rows.find((r) => r.name === 'Orca')).toMatchObject({ mark: 'off', detail: 'Not running on this machine.' });
  });

  it('warns on a device not seen in 7 days', () => {
    const { rows } = desktopRows(body('conn-warn'), ctx);
    expect(rows.find((r) => r.name === 'Laptop browser')).toMatchObject({ mark: 'warn', detail: expect.stringMatching(/^Not seen since /) });
  });

  it('folds devices past four into a more row', () => {
    const { rows, hidden } = desktopRows(body('conn-many'), ctx);
    expect(rows.filter((r) => r.key.startsWith('device:'))).toHaveLength(4);
    expect(hidden).toHaveLength(2);
  });

  it('shows a hash build short', () => {
    expect(versionText('8152277-2026-11-11T17:12:03Z')).toBe('Build 8152277');
    expect(versionText('dev')).toBe('Dev build');
  });
});

describe('strip', () => {
  it('links everything when all is good', () => {
    const s = stripFor(body());
    expect(s.links).toEqual({ github: 'ok', tailscale: 'ok', devices: 'ok', orca: 'ok' });
    expect([s.nod.detail, s.tailscale.detail, s.devices.detail, s.orca.detail]).toEqual(['service :4477', 'serve 443', '2 paired', '5 sessions']);
  });

  it('breaks the GitHub link and dashes the rest in the broken state', () => {
    const s = stripFor(body('conn-broken'));
    expect(s.links).toEqual({ github: 'broken', tailscale: 'off', devices: 'off', orca: 'off' });
    expect(s.github).toMatchObject({ state: 'broken', detail: 'Sync failing' });
    expect(s.devices).toMatchObject({ state: 'off', detail: 'none' });
  });
});

describe('phone rail', () => {
  it('follows the path the phone uses, with the hub as the accent ring', () => {
    const r = phoneRail(body(), ctx);
    expect(r.rail.map((x) => x.name)).toEqual(['This phone', 'Tailscale', 'Hub', 'GitHub', 'Orca on the hub']);
    expect(r.rail.map((x) => x.detail)).toEqual([
      'Android phone. Push on.',
      'https://hub.example.ts.net',
      'Nod service, v0.2.32. Synced 2m ago.',
      'acme-dev. API 4,885 / 5,000.',
      'Running. 3 repos, 5 sessions.',
    ]);
    expect(r.rail[2]?.mark).toBe('hub');
    expect(r.links).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(r.others.map((x) => [x.name, x.action])).toEqual([['Laptop browser', undefined]]);
  });

  it('dashes the rail while checking', () => {
    const r = phoneRail(undefined, ctx);
    expect(r.rail.every((x) => x.mark === 'checking')).toBe(true);
    expect(r.links.every((l) => l === 'off')).toBe(true);
  });
});
