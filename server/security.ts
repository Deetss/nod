import { execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { DeviceStore } from './devices';
import { appEnv } from './env';
import { createLogOnce } from './log-once';
import { NOT_PAIRED_HTML } from './pair-pages';

export const TOKEN_HEADER = 'x-nod-token';
export const TAILSCALE_USER_HEADER = 'tailscale-user-login';
export const PHONE_PORT = 4477;
/** Tailscale Serve's default HTTPS port. The Android app verifies this origin. */
export const DEFAULT_PHONE_HTTPS_PORT = 443;
/** The previous Tailscale Serve port. Its Origin stays trusted so older bookmarks keep working. */
export const LEGACY_PHONE_HTTPS_PORT = 8443;
export const DEVICE_COOKIE = 'nod_device';
/** Chrome caps cookie lifetime at 400 days. */
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/**
 * Sets the device key cookie. Pairing and renewal both go through here. Lax,
 * because Chrome withholds Strict cookies when another app starts the
 * navigation, which is how the phone app launches.
 */
export function setDeviceCookie(c: Context, key: string): void {
  setCookie(c, DEVICE_COOKIE, key, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
}

/** The tailnet name and owner login that phone access trusts. */
export interface PhoneAccess {
  host: string;
  owner: string;
}

/** Reads the tailnet host name and owner login from `tailscale status --json`. */
export function parseTailscaleStatus(raw: unknown): PhoneAccess | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { Self: self, User: users } = raw as { Self?: unknown; User?: unknown };
  if (typeof self !== 'object' || self === null) return undefined;
  const { DNSName: dns, UserID: userId } = self as { DNSName?: unknown; UserID?: unknown };
  if (typeof dns !== 'string' || typeof userId !== 'number') return undefined;
  const host = dns.replace(/\.$/, '').toLowerCase();
  if (!host || typeof users !== 'object' || users === null) return undefined;
  const user = (users as Record<string, unknown>)[String(userId)];
  if (typeof user !== 'object' || user === null) return undefined;
  const owner = (user as { LoginName?: unknown }).LoginName;
  if (typeof owner !== 'string' || !owner) return undefined;
  return { host, owner };
}

/** Asks the local tailscale CLI who we are. Logs one line and returns undefined on any failure. */
export function detectTailnet(): Promise<PhoneAccess | undefined> {
  return new Promise((resolve) => {
    const opts = { timeout: 5000, maxBuffer: 16 * 1024 * 1024 };
    execFile('tailscale', ['status', '--json'], opts, (err, stdout) => {
      if (err) {
        console.error('Phone access is off: tailscale is unavailable.');
        return resolve(undefined);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout) as unknown;
      } catch {
        parsed = undefined;
      }
      const access = parseTailscaleStatus(parsed);
      if (!access) console.error('Phone access is off: could not read the tailnet name from tailscale.');
      resolve(access);
    });
  });
}

/** Phone access is requested by the env var or the saved setting. */
export function phoneRequested(saved: boolean): boolean {
  return appEnv('PHONE') === '1' || saved;
}

/** The HTTPS port the phone link advertises: `NOD_PHONE_HTTPS_PORT`, or 443. */
export function phoneHttpsPort(raw: string | undefined = appEnv('PHONE_HTTPS_PORT')): number {
  if (raw === undefined || raw === '') return DEFAULT_PHONE_HTTPS_PORT;
  const port = Number(raw);
  if (!/^\d{1,5}$/.test(raw) || port < 1 || port > 65535) {
    throw new Error(`NOD_PHONE_HTTPS_PORT must be a port number, not "${raw}".`);
  }
  return port;
}

/** `https://<tailnet host>`, with the port only when it is not 443. */
export function phoneOrigin(host: string, port: number = phoneHttpsPort()): string {
  return port === DEFAULT_PHONE_HTTPS_PORT ? `https://${host}` : `https://${host}:${port}`;
}

export function newSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * True for http loopback names on any port. Browsers resolve `*.localhost`
 * to loopback, so a remote site cannot claim one.
 */
function isLoopbackUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') return false;
  const name = url.hostname;
  return name === '127.0.0.1' || name === 'localhost' || name.endsWith('.localhost');
}

function isTailnetHost(raw: string, phone: PhoneAccess): boolean {
  try {
    return new URL(`http://${raw}`).hostname === phone.host;
  } catch {
    return false;
  }
}

function isTailnetOrigin(raw: string, phone: PhoneAccess): boolean {
  return [DEFAULT_PHONE_HTTPS_PORT, LEGACY_PHONE_HTTPS_PORT, phoneHttpsPort()].some(
    (port) => raw === phoneOrigin(phone.host, port),
  );
}

/**
 * Rejects any request whose Host is not a loopback name (DNS rebinding).
 * With phone access on, the tailnet name is also allowed, but only for the
 * tailnet owner named by the `Tailscale-User-Login` header.
 */
export function hostGuard(phone?: PhoneAccess): MiddlewareHandler {
  const logOnce = createLogOnce();
  const deny = (c: Context, reason: string) => {
    logOnce(`[security] 403 ${reason} on ${c.req.path}`);
    return c.text(reason, 403);
  };
  return async (c, next) => {
    const host = c.req.header('host') ?? '';
    const login = c.req.header(TAILSCALE_USER_HEADER);
    // Tailscale Serve may forward with a loopback Host, so the header is checked on its own.
    if (login !== undefined && (!phone || login !== phone.owner)) {
      return deny(c, 'Not your tailnet user');
    }
    if (isLoopbackUrl(`http://${host}`)) return next();
    if (!phone || !isTailnetHost(host, phone)) return deny(c, 'Forbidden host');
    if (login !== phone.owner) return deny(c, 'Not your tailnet user');
    await next();
  };
}

export function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Mutating routes need the per-process token header and a same-origin Origin. */
export function mutationGuard(token: string, phone?: PhoneAccess): MiddlewareHandler {
  const logOnce = createLogOnce();
  const deny = (c: Context, reason: string) => {
    logOnce(`[security] 403 ${reason} on ${c.req.path}`);
    return c.text(reason, 403);
  };
  return async (c, next) => {
    const origin = c.req.header('origin');
    const originOk = origin !== undefined && (isLoopbackUrl(origin) || (phone && isTailnetOrigin(origin, phone)));
    if (!originOk) return deny(c, 'Forbidden origin');
    const sent = c.req.header(TOKEN_HEADER) ?? '';
    if (!tokensMatch(sent, token)) return deny(c, 'Forbidden token');
    await next();
  };
}

/**
 * True when the request came through the tailnet: it carries a Tailscale login
 * (Serve may forward with a loopback Host) or its Host is not a loopback name.
 */
export function isTailnetRequest(c: Context): boolean {
  if (c.req.header(TAILSCALE_USER_HEADER) !== undefined) return true;
  return !isLoopbackUrl(`http://${c.req.header('host') ?? ''}`);
}

/** Routes an unpaired phone may reach. None of them return data. */
function isPublicPath(method: string, path: string): boolean {
  if (method === 'POST') return path === '/api/pair';
  if (method !== 'GET' && method !== 'HEAD') return false;
  return (
    path === '/pair' ||
    path === '/manifest.webmanifest' ||
    path === '/.well-known/assetlinks.json' ||
    path.startsWith('/icons/')
  );
}

/** Rejects loopback-only routes (pairing admin) when the request came through the tailnet. */
export const loopbackOnly: MiddlewareHandler = async (c, next) => {
  if (isTailnetRequest(c)) return c.text('Loopback only', 403);
  await next();
};

/**
 * Tailnet requests also need a device key from a paired phone, on top of the
 * Tailscale login check. Loopback requests (the desktop) pass untouched.
 */
export function deviceGuard(devices: DeviceStore): MiddlewareHandler {
  const logOnce = createLogOnce();
  return async (c, next) => {
    if (!isTailnetRequest(c) || isPublicPath(c.req.method, c.req.path)) return next();
    const key = getCookie(c, DEVICE_COOKIE);
    if (key && devices.verify(key)) {
      await next();
      if (devices.shouldRenew(key)) setDeviceCookie(c, key);
      return;
    }
    logOnce(
      key
        ? `[devices] unrecognized device cookie on ${c.req.path}`
        : `[devices] no device cookie on ${c.req.path}`,
    );
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not paired' }, 401);
    return c.html(NOT_PAIRED_HTML, 401);
  };
}
