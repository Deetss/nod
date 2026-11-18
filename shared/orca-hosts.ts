import { z } from 'zod';

/** The hub's own Orca. It never gets `--environment`. */
export const LOCAL_HOST = 'local';

/** An Orca host name: `local` or a paired environment's name. A leading dash could be read as a CLI flag. */
export const hostName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);

/** One entry of `GET /api/orca/hosts`. `lastSeen` is ms of the last good read, null when never seen. */
export interface HostStatus {
  name: string;
  online: boolean;
  lastSeen: number | null;
}

/** `GET /api/orca/host-prefs`: the default host (null is `local`) and the per-repo hosts. */
export interface HostPrefs {
  defaultHost: string | null;
  hosts: Record<string, string>;
}
