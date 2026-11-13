import { parseApkParam } from '../shared/android-release';

const STORAGE_KEY = 'nod.apk';
const COOKIE = 'nod_apk';
const DISMISSED_KEY = 'nod.apkDismissed';
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: the cookie still holds the version
  }
}

const asVersion = (raw: string | null | undefined) => parseApkParam(`?apk=${raw ?? ''}`);

function cookieValue(): string | undefined {
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
}

/**
 * The app opens `/?apk=<versionCode>`. Remembers that version and drops it from the address,
 * so later reloads and shared links stay clean.
 */
export function rememberApk(loc: Location = window.location): void {
  const version = parseApkParam(loc.search);
  if (version === undefined) return;
  storageSet(STORAGE_KEY, String(version));
  document.cookie = `${COOKIE}=${version}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${loc.protocol === 'https:' ? '; secure' : ''}`;
  const q = new URLSearchParams(loc.search);
  q.delete('apk');
  const qs = q.toString();
  window.history.replaceState(window.history.state, '', `${loc.pathname}${qs ? `?${qs}` : ''}${loc.hash}`);
}

/** The installed Android app's version code, or undefined in a plain browser tab. */
export function installedApk(): number | undefined {
  return asVersion(storageGet(STORAGE_KEY)) ?? asVersion(cookieValue());
}

export function dismissedApk(): number | undefined {
  return asVersion(storageGet(DISMISSED_KEY));
}

export function dismissApk(versionCode: number): void {
  storageSet(DISMISSED_KEY, String(versionCode));
}
