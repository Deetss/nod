/** What `pnpm android:build` publishes next to the APK, and `/api/android/latest` returns. */
export interface AndroidRelease {
  versionCode: number;
  versionName: string;
  /** SHA-256 of the APK, hex. */
  sha256: string;
  /** ISO time of the build. */
  builtAt: string;
}

const isVersionCode = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

export function parseRelease(raw: unknown): AndroidRelease | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { versionCode, versionName, sha256, builtAt } = raw as Record<string, unknown>;
  if (!isVersionCode(versionCode)) return undefined;
  if (typeof versionName !== 'string' || typeof builtAt !== 'string') return undefined;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return undefined;
  return { versionCode, versionName, sha256, builtAt };
}

/** The version code the TWA bakes into its start URL as `?apk=<code>`, or undefined. */
export function parseApkParam(search: string): number | undefined {
  const raw = new URLSearchParams(search).get('apk');
  if (raw === null || !/^\d{1,9}$/.test(raw)) return undefined;
  const n = Number(raw);
  return isVersionCode(n) ? n : undefined;
}

/** True when a published APK is newer than the one installed. An unknown install (a browser tab) never is. */
export function apkUpdateAvailable(latest: AndroidRelease | undefined, installed: number | undefined): boolean {
  return latest !== undefined && installed !== undefined && latest.versionCode > installed;
}

/** The phone's "App update available" banner: shown for a newer APK until dismissed for that version. */
export function apkBanner(input: {
  latest: AndroidRelease | undefined;
  installed: number | undefined;
  dismissed: number | undefined;
}): AndroidRelease | undefined {
  const { latest, installed, dismissed } = input;
  if (!apkUpdateAvailable(latest, installed) || !latest) return undefined;
  return dismissed === latest.versionCode ? undefined : latest;
}
