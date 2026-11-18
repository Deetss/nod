/** `GET /api/connections`: how this Nod reaches GitHub, Tailscale, paired devices and Orca. */

import type { ConnectionState, ScopeName } from './connection';
import type { RateInfo } from './types';

/** `service` when this server is the shared Nod service, `own` when a window started it for itself. */
export type NodMode = 'service' | 'own';

/** `elsewhere`: something serves the HTTPS port, but not this Nod. */
export type ServeState = 'served' | 'off' | 'elsewhere';

/** A paired device. Never carries the key or its hash. */
export interface DeviceLink {
  /** Sent to the desktop only, since rename needs it. */
  id?: string;
  name: string;
  /** ISO time. */
  lastSeen: string;
  push: boolean;
  /** The device that made the request. */
  self?: true;
}

export interface ConnectionsBody {
  /** Epoch ms of the probes behind this answer. */
  checkedAt: number;
  github: {
    state: ConnectionState;
    login?: string;
    /** Optional scopes the token lacks. */
    missing: ScopeName[];
    rate?: RateInfo;
    /** Epoch ms of the last good sync, 0 before the first. */
    syncedAt: number;
    /** Background polls that failed in a row. */
    failures: number;
    /** Why the last sync failed, while the lists are stale from an error. */
    error?: string;
  };
  nod: { mode: NodMode; port: number; build: string };
  tailscale: {
    /** Phone access is on, so the server knows its tailnet name. */
    on: boolean;
    url?: string;
    serve: ServeState;
    /** A request through Serve reached this Nod. Set only while served. */
    reachable?: boolean;
  };
  /** Most recently seen first. */
  devices: DeviceLink[];
  orca: { running: boolean; repos?: number; sessions: number };
}
