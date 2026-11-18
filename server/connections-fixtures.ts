import type { ConnectionsBody, DeviceLink } from '../shared/connections';
import type { StateQuery } from './provider';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const PORT = 4477;
const URL = 'https://hub.example.ts.net';

const ago = (now: number, ms: number) => new Date(now - ms).toISOString();

function devices(now: number): DeviceLink[] {
  return [
    { id: 'fx-phone', name: 'Android phone', role: 'phone', lastSeen: ago(now, 2 * MIN), push: true, self: true },
    { id: 'fx-laptop', name: 'Laptop browser', role: 'desktop', lastSeen: ago(now, 26 * MIN), push: false },
  ];
}

const MANY = ['Tablet', 'Work phone', 'Spare phone', 'Kitchen tablet'];

/**
 * Fixture-only answers, by `?state=`: `conn-local`, `conn-off`, `conn-warn`, `conn-broken`,
 * `conn-nodevices`, `conn-noorca`, `conn-many` and `conn-checking` (never answers). Anything else
 * is the all-good service. The phone row is `self`, so the phone sheet shows it as This phone.
 */
export function fixtureConnections(state: StateQuery, now: number = Date.now()): ConnectionsBody {
  const base: ConnectionsBody = {
    checkedAt: now,
    github: {
      state: 'ok',
      login: 'acme-dev',
      missing: [],
      rate: { limit: 5000, remaining: 4885, resetAt: new Date(now + 54 * MIN).toISOString() },
      syncedAt: now - 2 * MIN,
      failures: 0,
    },
    nod: { mode: 'service', port: PORT, build: 'v0.2.32' },
    tailscale: { on: true, url: URL, serve: 'served', reachable: true },
    devices: devices(now),
    orca: { running: true, repos: 3, sessions: 5 },
  };
  switch (state) {
    case 'conn-local':
      return { ...base, nod: { ...base.nod, mode: 'own' }, devices: base.devices.slice(0, 1) };
    case 'conn-off':
      return {
        ...base,
        nod: { mode: 'own', port: 41873, build: 'v0.2.32' },
        tailscale: { on: false, serve: 'off' },
        devices: [],
      };
    case 'conn-warn':
      return {
        ...base,
        devices: [base.devices[0]!, { ...base.devices[1]!, lastSeen: ago(now, 9 * DAY) }],
      };
    case 'conn-broken':
      return {
        ...base,
        github: { ...base.github, failures: 3, error: 'gh is logged out.', syncedAt: now - 14 * MIN },
        nod: { mode: 'own', port: 41873, build: 'v0.2.32' },
        tailscale: { on: false, serve: 'off' },
        devices: [],
        orca: { running: false, sessions: 0 },
      };
    case 'conn-nodevices':
      return { ...base, devices: [] };
    case 'conn-noorca':
      return { ...base, orca: { running: false, sessions: 0 } };
    case 'conn-many':
      return {
        ...base,
        devices: [
          ...base.devices,
          ...MANY.map((name, i): DeviceLink => ({ id: `fx-${i}`, name, role: 'phone', lastSeen: ago(now, (i + 2) * 40 * MIN), push: i % 2 === 0 })),

        ],
      };
    default:
      return base;
  }
}
