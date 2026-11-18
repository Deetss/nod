import { isDeviceRole, type DeviceRole, type DeviceSelf } from './pairing';

const URL_MAX = 200;
const CODE_RE = /^[A-Za-z0-9_-]{8,200}$/;

export type Parsed = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validates a Hub URL and reduces it to its origin. Empty clears the setting. Only https,
 * with no user, password, path, query or fragment, so it can only ever name a host.
 */
export function parseHubUrl(raw: string): Parsed {
  const text = raw.trim();
  if (text === '') return { ok: true, url: '' };
  if (text.length > URL_MAX) return { ok: false, error: 'The hub URL is too long.' };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: 'Enter a full URL, such as https://hub.example.ts.net.' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'The hub URL must start with https://.' };
  if (url.username || url.password) return { ok: false, error: 'The hub URL cannot hold a user name or password.' };
  if (url.pathname !== '/' || url.search || url.hash || /[?#]/.test(text)) {
    return { ok: false, error: 'Use the hub address only, with no path.' };
  }
  return { ok: true, url: url.origin };
}

/**
 * The hub page that pairs this desktop: a pasted pairing link on the hub's own origin, or a
 * bare code. A link to any other host is refused, so pairing never leaves the hub.
 */
export function pairTarget(hubUrl: string, input: string): Parsed {
  const hub = parseHubUrl(hubUrl);
  if (!hub.ok || hub.url === '') return { ok: false, error: 'Check a hub URL first.' };
  const text = input.trim();
  let code = text;
  if (text.includes('/')) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, error: 'Paste the pairing link or code from nod pair --admin.' };
    }
    if (url.origin !== hub.url || url.pathname !== '/pair') {
      return { ok: false, error: 'That link is for another server. Use a link from this hub.' };
    }
    code = new URLSearchParams(url.hash.slice(1)).get('code') ?? '';
  }
  if (!CODE_RE.test(code)) return { ok: false, error: 'Paste the pairing link or code from nod pair --admin.' };
  return { ok: true, url: `${hub.url}/pair#code=${code}` };
}

/** What a check of the hub found. */
export type HubStatus =
  | { state: 'unreachable' }
  | { state: 'not-paired' }
  | { state: 'paired'; role: DeviceRole; version?: string };

/** Reads the answer to `GET /api/devices/me`. A 401 means the hub answers but this desktop holds no key. */
export function hubStatusFrom(status: number, body: unknown): HubStatus {
  if (status === 401) return { state: 'not-paired' };
  if (status !== 200 || typeof body !== 'object' || body === null) return { state: 'unreachable' };
  const { role, version } = body as Partial<DeviceSelf>;
  if (!isDeviceRole(role)) return { state: 'unreachable' };
  return typeof version === 'string' && version.length <= 40 ? { state: 'paired', role, version } : { state: 'paired', role };
}

/** The desktop's view of its hub, as the Electron shell reports it. */
export interface HubView {
  /** The saved Hub URL, or '' for none. */
  url: string;
  /** True when this window shows the hub rather than a server on this machine. */
  attached: boolean;
}

export type CheckResult = { ok: true; url: string; status: HubStatus | undefined } | { ok: false; error: string };
export type PairResult = { ok: true } | { ok: false; error: string };

/** `window.nod.hub`: only the desktop app has it. */
export interface HubBridge {
  get: () => Promise<HubView>;
  /** Validates and saves the URL, then checks it. An empty URL clears it and checks nothing. */
  check: (url: string) => Promise<CheckResult>;
  /** Opens the hub's pair page in this window's session, and resolves once the hub accepts the code. */
  pair: (input: string) => Promise<PairResult>;
}
