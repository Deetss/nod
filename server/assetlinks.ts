import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { configBase, configDir, LEGACY_APP_ID } from './app-paths';

/** The package before the rename. Listed for one release so an installed old app keeps working. */
export const LEGACY_ANDROID_PACKAGE = 'dev.example.reviewinbox';

const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export type AssetLinks = Array<{
  relation: string[];
  target: { namespace: 'android_app'; package_name: string; sha256_cert_fingerprints: string[] };
}>;

const FINGERPRINT_FILE = 'android-fingerprint.txt';

/** Where `pnpm android:build` writes the signing certificate fingerprint (a public value). */
export function defaultFingerprintPath(): string {
  return join(configDir(), FINGERPRINT_FILE);
}

/** The pre-rename location, read when the new one has no fingerprint. */
export function legacyFingerprintPath(): string {
  return join(configBase(), LEGACY_APP_ID, FINGERPRINT_FILE);
}

/**
 * The Digital Asset Links statements that let the app open this origin without a browser bar.
 * `packageId` is settings `android.packageId`, the package the APK was built with. Both packages share one key.
 */
export function buildAssetLinks(fingerprint: string, packageId: string): AssetLinks {
  return [packageId, LEGACY_ANDROID_PACKAGE].map((package_name) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name, sha256_cert_fingerprints: [fingerprint] },
  }));
}

/** The SHA-256 fingerprint in the file, upper-case and colon separated, or undefined when absent or malformed. */
export async function readFingerprint(path: string = defaultFingerprintPath()): Promise<string | undefined> {
  try {
    const value = (await readFile(path, 'utf8')).trim().toUpperCase();
    return FINGERPRINT_RE.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** assetlinks.json for a server with phone access on, or undefined until `pnpm android:build` has run. */
export async function loadAssetLinks(
  packageId: string,
  paths: string[] = [defaultFingerprintPath(), legacyFingerprintPath()],
): Promise<AssetLinks | undefined> {
  for (const path of paths) {
    const fingerprint = await readFingerprint(path);
    if (fingerprint) return buildAssetLinks(fingerprint, packageId);
  }
  return undefined;
}
