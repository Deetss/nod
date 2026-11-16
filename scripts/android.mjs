// `pnpm android:build` builds the signed release APK. `pnpm android:install` installs it over adb.
//
// android/ is a hand-kept TWA project and this script runs its Gradle build. No host is baked in:
// the app asks for its server on first launch. The signing key and its password live under
// ~/.config/nod and reach Gradle only through the environment, never the repo, argv or the log.
//
// Runs under tsx so it shares the app's paths and its pre-rename migration.

import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { configDir } from '../server/app-paths.ts';
import { publishRelease } from '../server/android-release.ts';
import { migrateLegacyDirs } from '../server/migrate.ts';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const config = configDir();
const keystore = join(config, 'android.keystore');
const passFile = join(config, 'android-keystore.pass');
const fingerprintFile = join(config, 'android-fingerprint.txt');
const versionFile = join(config, 'android-version.txt');
const apk = join(root, 'release', 'android', 'nod.apk');
const builtApk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const DEFAULT_PACKAGE = 'io.github.reviewinbox';
const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

// The key alias inside the existing keystore. It predates the rename and must stay, or the fingerprint changes.
// android/app/build.gradle signs with the same alias.
const ALIAS = 'review-inbox';

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

async function exists(path) {
  return stat(path).then(() => true, () => false);
}

/** `android.packageId` from the service's settings file, so the APK matches assetlinks.json. */
async function packageId() {
  const dir = process.env.REVIEW_INBOX_SETTINGS_DIR ?? `${config}-service`;
  let raw = {};
  try {
    raw = JSON.parse(await readFile(join(dir, 'app-settings.json'), 'utf8'));
  } catch {
    // No settings file: the default package applies, as it does on the server.
  }
  const id = raw?.android?.packageId ?? DEFAULT_PACKAGE;
  if (typeof id !== 'string' || !PACKAGE_RE.test(id)) fail(`android.packageId "${id}" is not a valid package ID.`);
  return id;
}

/** The JDK 17 pinned by .mise.toml. The system Java stays untouched. */
async function jdkHome() {
  const { stdout } = await run('mise', ['where', 'java'], { cwd: root }).catch(() =>
    fail('JDK 17 is missing. Run `mise install` in the repo.'),
  );
  return stdout.trim();
}

async function sdkHome() {
  const sdk = process.env.ANDROID_HOME || join(homedir(), 'Android', 'Sdk');
  if (!(await exists(sdk))) fail('Android SDK not found. Set ANDROID_HOME.');
  return sdk;
}

function keytool(jdk, args, password) {
  return run(join(jdk, 'bin', 'keytool'), args, {
    env: { ...process.env, NOD_KEYSTORE_PASS: password },
    maxBuffer: 1024 * 1024,
  });
}

/** Creates the keystore on first use and returns its password. */
async function ensureKeystore(jdk) {
  await mkdir(config, { recursive: true, mode: 0o700 });
  if (!(await exists(keystore)) || !(await exists(passFile))) {
    if (await exists(keystore)) fail(`${keystore} exists but its password file is missing. Restore it or remove both.`);
    const password = randomBytes(24).toString('base64url');
    await writeFile(passFile, password, { mode: 0o600 });
    await keytool(
      jdk,
      [
        '-genkeypair', '-keystore', keystore, '-alias', ALIAS, '-keyalg', 'RSA', '-keysize', '2048',
        '-validity', '10000', '-dname', 'CN=Nod, O=Nod',
        '-storepass:env', 'NOD_KEYSTORE_PASS', '-keypass:env', 'NOD_KEYSTORE_PASS',
      ],
      password,
    );
  }
  return (await readFile(passFile, 'utf8')).trim();
}

/** Writes the certificate SHA-256 where the server reads it for assetlinks.json. */
async function writeFingerprint(jdk, password) {
  const { stdout } = await keytool(
    jdk,
    ['-list', '-v', '-keystore', keystore, '-alias', ALIAS, '-storepass:env', 'NOD_KEYSTORE_PASS'],
    password,
  );
  const value = /SHA256:\s*([0-9A-F:]{95})/.exec(stdout)?.[1];
  if (!value) fail('Could not read the certificate fingerprint from the keystore.');
  await writeFile(fingerprintFile, `${value}\n`);
}

/** The last built version code. Builds before the counter existed all used 1. */
async function lastVersion() {
  const n = Number.parseInt(await readFile(versionFile, 'utf8').catch(() => '1'), 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export const versionNameFor = (version) => `1.0.${version}`;

/** The Gradle task and properties. The release workflow passes the same properties. */
export function gradleArgs(version, pkg) {
  return [
    'assembleRelease',
    `-PnodPackage=${pkg}`,
    `-PnodVersionCode=${version}`,
    `-PnodVersionName=${versionNameFor(version)}`,
  ];
}

function gradle(args, env) {
  return new Promise((ok, bad) => {
    const child = spawn(join(androidDir, 'gradlew'), args, {
      cwd: androidDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', (code) => (code === 0 ? ok() : bad(new Error(`gradlew exited with ${code}`))));
  });
}

async function build() {
  const pkg = await packageId();
  const jdk = await jdkHome();
  const sdk = await sdkHome();
  const password = await ensureKeystore(jdk);
  await writeFingerprint(jdk, password);
  const version = (await lastVersion()) + 1;
  await gradle(gradleArgs(version, pkg), {
    JAVA_HOME: jdk,
    ANDROID_HOME: sdk,
    NOD_KEYSTORE: keystore,
    NOD_KEYSTORE_PASSWORD: password,
  });
  await finishBuild(builtApk, version, pkg);
  console.log(`Fingerprint written to ${fingerprintFile}. Restart the service so assetlinks.json serves it.`);
}

/**
 * Copies the signed APK to release/android for adb, publishes it with its metadata to the
 * state dir the server reads, and only then counts the version as built.
 */
export async function finishBuild(signedApk, version, pkg, releaseApk = apk) {
  await mkdir(dirname(releaseApk), { recursive: true });
  await copyFile(signedApk, releaseApk);
  const release = await publishRelease(signedApk, { versionCode: version, versionName: versionNameFor(version), packageId: pkg });
  await mkdir(config, { recursive: true, mode: 0o700 });
  await writeFile(versionFile, `${version}\n`);
  console.log(`APK: ${releaseApk} (version ${version})`);
  console.log(`Published ${release.versionName} for phones to install. Update phones in the desktop app tells them.`);
  return release;
}

async function install() {
  if (!(await exists(apk))) fail('No APK yet. Run `pnpm android:build` first.');
  const child = spawn('adb', ['install', '-r', apk], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 1));
}

// Imported by tests for its helpers; only a direct run builds or installs.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // The keystore must come from the old folder, never a fresh key, or the fingerprint changes.
  migrateLegacyDirs();

  const command = process.argv[2];
  if (command === 'build') await build();
  else if (command === 'install') await install();
  else fail('Usage: node scripts/android.mjs build|install');
}
