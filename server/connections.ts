import type { Context, Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { SCOPES, type Connection, type ScopeName } from '../shared/connection';
import type { ConnectionsBody, DeviceLink, NodMode } from '../shared/connections';
import type { InboxData } from '../shared/types';
import { fixtureConnections } from './connections-fixtures';
import type { DeviceStore } from './devices';
import type { Orca } from './orca';
import type { OrcaSessions } from './orca-sessions';
import type { Provider } from './provider';
import { DEVICE_COOKIE, isTailnetRequest } from './security';
import type { TailscaleServe } from './tailscale-serve';

/** `conn-checking` holds the answer this long, so the first-load state can be captured. */
const FIXTURE_HOLD_MS = 120_000;

export interface ConnectionsDeps {
  provider: Pick<Provider, 'inbox' | 'connection'>;
  sync?: { failures?: number };
  devices: DeviceStore;
  orca: Orca;
  sessions: OrcaSessions;
  serve: TailscaleServe;
  /** The advertised phone origin. Undefined while phone access is off. */
  phoneUrl: string | undefined;
  mode: NodMode;
  port: number;
  build: string;
  fixtures: boolean;
}

const OPTIONAL: readonly ScopeName[] = SCOPES.filter((s) => s.need === 'Optional').map((s) => s.name);

function github(inbox: InboxData | undefined, conn: Connection, failures: number): ConnectionsBody['github'] {
  const error = inbox?.stale?.kind === 'error' ? inbox.stale.message : undefined;
  return {
    state: conn.state,
    ...(conn.login ? { login: conn.login } : {}),
    missing: OPTIONAL.filter((s) => conn.granted?.[s] === false),
    ...(inbox?.rate ? { rate: inbox.rate } : {}),
    syncedAt: inbox?.syncedAt ?? 0,
    failures,
    ...(error ? { error } : {}),
  };
}

/**
 * The desktop gets every device with its id. A paired phone gets its own row, and the others'
 * name, last-seen and push state only, since rename and revoke stay loopback only.
 */
function devicesFor(c: Context, devices: DeviceStore): DeviceLink[] {
  if (!isTailnetRequest(c)) return devices.links().map(({ self: _self, ...d }) => d);
  return devices.links(getCookie(c, DEVICE_COOKIE)).map(({ name, lastSeen, push, self }) => ({
    name,
    lastSeen,
    push,
    ...(self ? { self } : {}),
  }));
}

async function probe(c: Context, d: ConnectionsDeps): Promise<ConnectionsBody> {
  const fresh = c.req.query('fresh') === '1';
  const query = c.req.query('state');
  const [inbox, sessions, repos, serve] = await Promise.all([
    d.provider.inbox(query, 'none').catch(() => undefined),
    fresh ? d.sessions.fresh() : d.sessions.snapshot(),
    d.orca.mappedRepos().catch(() => undefined),
    d.phoneUrl ? d.serve.status(d.phoneUrl, fresh) : undefined,
  ]);
  const conn = inbox?.connection ?? d.provider.connection(query);
  return {
    checkedAt: Math.min(Date.now(), sessions.at, serve?.at ?? Infinity),
    github: github(inbox, conn, d.sync?.failures ?? 0),
    // A window's own server binds port 0, so the port it got comes from the request.
    nod: { mode: d.mode, port: d.port || Number(new URL(c.req.url).port) || 0, build: d.build },
    tailscale: {
      on: d.phoneUrl !== undefined,
      ...(d.phoneUrl ? { url: d.phoneUrl } : {}),
      serve: serve?.serve ?? 'off',
      ...(serve?.reachable !== undefined ? { reachable: serve.reachable } : {}),
    },
    devices: devicesFor(c, d.devices),
    orca: {
      running: sessions.available,
      ...(repos && sessions.available ? { repos: repos.length } : {}),
      sessions: sessions.sessions.length,
    },
  };
}

/** `GET /api/connections`. `?fresh=1` (Check now) re-runs every probe instead of reading the caches. */
export function registerConnectionsRoutes(app: Hono, d: ConnectionsDeps): void {
  app.get('/api/connections', async (c) => {
    if (!d.fixtures) return c.json(await probe(c, d));
    const state = c.req.query('state');
    if (state === 'conn-checking') await new Promise((r) => setTimeout(r, FIXTURE_HOLD_MS));
    const body = fixtureConnections(state);
    if (!isTailnetRequest(c)) return c.json(body);
    return c.json({ ...body, devices: body.devices.map(({ id: _id, ...rest }) => rest) });
  });
}
