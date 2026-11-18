import { hubStatusFrom, parseHubUrl, type HubStatus } from '../shared/hub';

/** No Electron import here, so the attach decision is testable in Node. */

const PROBE_TIMEOUT_MS = 3000;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** The saved Hub URL from `hub.json`. A damaged or invalid value reads as none. */
export function readHubSetting(raw: unknown): string {
  const value = typeof raw === 'object' && raw !== null ? (raw as { hubUrl?: unknown }).hubUrl : undefined;
  if (typeof value !== 'string') return '';
  const parsed = parseHubUrl(value);
  return parsed.ok ? parsed.url : '';
}

/**
 * Asks the hub who this desktop is, with the device cookie from the window's session. The
 * fetcher must send that session's cookies. Redirects are not followed, so a hub that moves
 * reads as unreachable rather than sending the cookie elsewhere.
 */
export async function probeHub(origin: string, fetcher: Fetcher, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<HubStatus> {
  try {
    const res = await fetcher(`${origin}/api/devices/me`, {
      credentials: 'include',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body: unknown = res.status === 200 ? await res.json().catch(() => undefined) : undefined;
    return hubStatusFrom(res.status, body);
  } catch {
    return { state: 'unreachable' };
  }
}

export type StartChoice = { mode: 'hub'; origin: string } | { mode: 'local'; log?: string };

/**
 * Where the window goes at startup. A Hub URL is used only when the hub answers and this
 * desktop is paired with it; otherwise the window starts as today, on this machine.
 */
export async function chooseStart(hubUrl: string, probe: (origin: string) => Promise<HubStatus>): Promise<StartChoice> {
  if (!hubUrl) return { mode: 'local' };
  const status = await probe(hubUrl);
  if (status.state === 'paired') return { mode: 'hub', origin: hubUrl };
  const why = status.state === 'not-paired' ? 'answers but this desktop is not paired' : 'did not answer';
  return { mode: 'local', log: `[hub] ${hubUrl} ${why}; starting a local server.` };
}

/** Channels any page the window shows may call: notifications, their switches, and the shell build. */
const PAGE_CHANNELS = new Set(['notify', 'notify:test', 'settings:get', 'settings:set', 'shell:build']);

/** Channels that choose or pair the hub, or restart the shell. Only this machine's own server page may call them. */
const LOCAL_CHANNELS = new Set(['hub:get', 'hub:check', 'hub:pair', 'shell:relaunch']);

/** The only permission a page may get: Copy buttons write to the clipboard. */
const PERMISSIONS = new Set(['clipboard-sanitized-write']);

/** Whether `permission` may be granted to a frame at `requestingUrl`. Only the window's exact origin, only the listed permissions. */
export function permissionAllowed(permission: string, requestingUrl: string | undefined, origin: string): boolean {
  return PERMISSIONS.has(permission) && isOrigin(requestingUrl, origin);
}

/** Whether a frame may navigate to `url`: the window's exact origin, over http or https. */
export function frameNavigationAllowed(url: string, origin: string): boolean {
  return /^https?:/.test(url) && isOrigin(url, origin);
}

/**
 * Lets one call through per `gapMs` and drops the rest, so a hostile hub page cannot flood the
 * desktop with notifications.
 */
export function rateGate(gapMs: number, now: () => number = Date.now): () => boolean {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < gapMs) return false;
    last = t;
    return true;
  };
}


/**
 * Whether a call on `channel` from a frame at `frameUrl` is allowed. `current` is the window's
 * origin; `local` is this machine's server, empty when the window started on the hub. A hub
 * page can never change or pair the hub, so a hostile hub cannot point the desktop elsewhere.
 */
export function ipcAllowed(channel: string, frameUrl: string | undefined, o: { current: string; local: string }): boolean {
  if (LOCAL_CHANNELS.has(channel)) return o.local !== '' && o.current === o.local && isOrigin(frameUrl, o.local);
  return PAGE_CHANNELS.has(channel) && isOrigin(frameUrl, o.current);
}

/** True when `raw` is a URL on exactly `origin`. */
export function isOrigin(raw: string | undefined, origin: string): boolean {
  if (!raw || !origin) return false;
  try {
    return new URL(raw).origin === origin;
  } catch {
    return false;
  }
}
