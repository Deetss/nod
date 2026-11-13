import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRelease, type AndroidRelease } from '../shared/android-release';
import { stateDir } from './app-paths';

export const APK_FILE = 'nod.apk';
export const RELEASE_FILE = 'latest.json';
export const APK_CONTENT_TYPE = 'application/vnd.android.package-archive';

/** Where `pnpm android:build` publishes the signed APK for the server to hand out. Never the repo. */
export function androidReleaseDir(): string {
  return join(stateDir(), 'android');
}

/** The published release, or undefined until the first build (or when the file is unreadable). */
export async function readRelease(dir: string = androidReleaseDir()): Promise<AndroidRelease | undefined> {
  try {
    return parseRelease(JSON.parse(await readFile(join(dir, RELEASE_FILE), 'utf8')) as unknown);
  } catch {
    return undefined;
  }
}

/** The APK's download name, for example `nod-1.0.12.apk`. */
export function apkFileName(release: AndroidRelease): string {
  return `nod-${release.versionName.replace(/[^0-9A-Za-z.]/g, '')}.apk`;
}

/**
 * Copies the APK into `dir` and writes its metadata beside it. Both land by rename, so the
 * server never serves a half-written file, and the metadata goes last so it never names a missing APK.
 */
export async function publishRelease(
  apk: string,
  version: { versionCode: number; versionName: string },
  dir: string = androidReleaseDir(),
  now: Date = new Date(),
): Promise<AndroidRelease> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = join(dir, APK_FILE);
  await copyFile(apk, `${target}.tmp`);
  const sha256 = createHash('sha256').update(await readFile(`${target}.tmp`)).digest('hex');
  await rename(`${target}.tmp`, target);
  const release: AndroidRelease = { ...version, sha256, builtAt: now.toISOString() };
  const meta = join(dir, RELEASE_FILE);
  await writeFile(`${meta}.tmp`, `${JSON.stringify(release, null, 2)}\n`, { mode: 0o644 });
  await rename(`${meta}.tmp`, meta);
  return release;
}
