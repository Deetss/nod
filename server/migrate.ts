import { cpSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { APP_ID, cacheBase, configBase, LEGACY_APP_ID, stateBase } from './app-paths';

export const MOVED_NOTE = `MOVED-TO-${APP_ID}`;

/** Chromium's instance lock files point at the old process, so the new profile starts without them. */
const SKIP = new Set(['SingletonLock', 'SingletonCookie', 'SingletonSocket', MOVED_NOTE]);

/** Every folder the app keeps, as [old, new] pairs. `-service` is the headless Electron profile. */
export function legacyPairs(): Array<[string, string]> {
  const pairs: Array<[string, string]> = [stateBase(), configBase(), cacheBase()].map((root) => [
    join(root, LEGACY_APP_ID),
    join(root, APP_ID),
  ]);
  pairs.push([join(configBase(), `${LEGACY_APP_ID}-service`), join(configBase(), `${APP_ID}-service`)]);
  return pairs;
}

/**
 * Copies each pre-rename folder to its new path when only the old one exists, then leaves a
 * note in the old folder. Old data is never deleted, and file modes (the keystore's 600) are kept.
 * Safe on every start: a folder already at the new path is left alone.
 */
export function migrateLegacyDirs(log: (line: string) => void = console.log): string[] {
  const moved: string[] = [];
  for (const [from, to] of legacyPairs()) {
    if (existsSync(to) || !existsSync(from)) continue;
    const tmp = `${to}.migrating-${process.pid}`;
    try {
      rmSync(tmp, { recursive: true, force: true });
      cpSync(from, tmp, {
        recursive: true,
        preserveTimestamps: true,
        verbatimSymlinks: true,
        filter: (src) => !SKIP.has(basename(src)),
      });
      renameSync(tmp, to);
    } catch (e) {
      rmSync(tmp, { recursive: true, force: true });
      log(`Could not copy ${from} to ${to}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    writeFileSync(join(from, MOVED_NOTE), `Copied to ${to}. Nod no longer reads this folder; delete it when you are sure.\n`);
    log(`Copied ${from} to ${to}`);
    moved.push(to);
  }
  return moved;
}
