import { LOCAL_HOST, type HostStatus } from '../../shared/orca-hosts';
import { hostFor, type OrcaPrefs } from '../../shared/orca-prefs';
import type { PrSessions, SessionView } from '../../shared/orca-sessions';

export type HostPrefs = Partial<Pick<OrcaPrefs, 'defaultHost' | 'hosts'>>;

/** Shown before the first read, and on a server without hosts: this machine only. */
export const LOCAL_ONLY: readonly HostStatus[] = [{ name: LOCAL_HOST, online: true, lastSeen: null }];

export const isRemote = (host: string | undefined): boolean => host !== undefined && host !== LOCAL_HOST;

/** Paired hosts exist. Without them every host word stays hidden, so one machine looks as before hosts. */
export const multiHost = (hosts: readonly HostStatus[]): boolean => hosts.length > 1;

/** `30s`, `5m`, `2h`, `3d`. */
export function agoShort(at: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** `seen 2h ago`, or `never seen`. */
export const seenAgo = (h: HostStatus, now?: number): string => (h.lastSeen === null ? 'never seen' : `seen ${agoShort(h.lastSeen, now)} ago`);

export const offlineHost = (name: string, hosts: readonly HostStatus[]): HostStatus | undefined =>
  hosts.find((h) => h.name === name && !h.online);

/** One line per offline host, at most 2, then `and N more`. */
export function offlineNotes(hosts: readonly HostStatus[], now?: number): string[] {
  const off = hosts.filter((h) => !h.online);
  const lines = off.slice(0, 2).map((h) => `${h.name} is offline (${seenAgo(h, now)}), so its sessions are not listed.`);
  return off.length > 2 ? [...lines, `and ${off.length - 2} more`] : lines;
}

/** The host menu: online hosts in list order, then the offline ones. */
export function hostMenu(hosts: readonly HostStatus[]): { online: HostStatus[]; offline: HostStatus[] } {
  return { online: hosts.filter((h) => h.online), offline: hosts.filter((h) => !h.online) };
}

/** What a host reads as in a select. */
export const hostLabel = (name: string, hosts: readonly HostStatus[]): string =>
  name !== LOCAL_HOST ? name : multiHost(hosts) ? 'local (hub)' : 'This machine';

/**
 * The host a new worktree starts on: the repo's host, the default host, then `local`. A preferred
 * host that is offline falls back to `local` and is named so the dialog can say why.
 */
export function worktreeHost(prefs: HostPrefs, repo: string | undefined, hosts: readonly HostStatus[]): { host: string; fallback?: HostStatus } {
  const want = hostFor({ hosts: prefs.hosts ?? {}, ...(prefs.defaultHost ? { defaultHost: prefs.defaultHost } : {}) }, repo);
  const h = hosts.find((x) => x.name === want);
  if (h?.online) return { host: want };
  return h ? { host: LOCAL_HOST, fallback: h } : { host: LOCAL_HOST };
}

/**
 * Keeps each PR's related sessions whose host went offline, so the chip shows the last state it
 * knew. They drop once the host answers again or leaves the list.
 */
export function carryOffline(
  prev: Readonly<Record<string, PrSessions>>,
  next: Readonly<Record<string, PrSessions>>,
  hosts: readonly HostStatus[],
): Record<string, PrSessions> {
  const out: Record<string, PrSessions> = { ...next };
  for (const [prId, ps] of Object.entries(prev)) {
    const kept = ps.related.filter((s) => offlineHost(s.host, hosts));
    if (kept.length === 0) continue;
    const cur = out[prId] ?? { related: [], possible: [] };
    const fresh = kept.filter((s) => !cur.related.some((r) => r.host === s.host && r.id === s.id));
    out[prId] = { ...cur, related: [...cur.related, ...fresh] };
  }
  return out;
}

/** The chip and card text for a session on an offline host: `offline 2h`, or `offline`. */
export function offlineWord(s: Pick<SessionView, 'host'>, hosts: readonly HostStatus[], now?: number): string | undefined {
  const h = offlineHost(s.host, hosts);
  if (!h) return undefined;
  return h.lastSeen === null ? 'offline' : `offline ${agoShort(h.lastSeen, now)}`;
}
