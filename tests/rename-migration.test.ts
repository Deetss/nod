import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettingsPath } from '../server/settings';
import { appEnv } from '../server/env';
import { migrateLegacyDirs, MOVED_NOTE } from '../server/migrate';
import { phoneRequested } from '../server/security';
import { defaultSeenPath } from '../server/seen';

let home: string;
const saved = { ...process.env };

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'nod-migrate-'));
  process.env.XDG_STATE_HOME = join(home, 'state');
  process.env.XDG_CONFIG_HOME = join(home, 'config');
  process.env.XDG_CACHE_HOME = join(home, 'cache');
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(home, { recursive: true, force: true });
});

const write = (path: string, text: string, mode = 0o644) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  chmodSync(path, mode);
};
const read = (path: string) => readFileSync(path, 'utf8');
const quiet = () => undefined;

describe('migrateLegacyDirs', () => {
  it('copies old-only folders, keeps the old data and leaves a note', () => {
    write(join(home, 'state/review-inbox/seen.json'), '{"a":1}');
    write(join(home, 'state/review-inbox/devices.json'), '[]');
    write(join(home, 'state/review-inbox/vapid.json'), '{"k":1}', 0o600);
    write(join(home, 'config/review-inbox/app-settings.json'), '{"org":"x"}');
    write(join(home, 'config/review-inbox-service/Preferences'), '{}');
    write(join(home, 'cache/review-inbox/inbox.json'), '[]');

    const moved = migrateLegacyDirs(quiet);

    expect(moved.sort()).toEqual(
      ['cache/nod', 'config/nod', 'config/nod-service', 'state/nod'].map((p) => join(home, p)),
    );
    expect(read(join(home, 'state/nod/seen.json'))).toBe('{"a":1}');
    expect(read(join(home, 'state/nod/devices.json'))).toBe('[]');
    expect(statSync(join(home, 'state/nod/vapid.json')).mode & 0o777).toBe(0o600);
    expect(read(join(home, 'config/nod/app-settings.json'))).toBe('{"org":"x"}');
    expect(read(join(home, 'cache/nod/inbox.json'))).toBe('[]');
    expect(read(join(home, 'state/review-inbox/seen.json'))).toBe('{"a":1}');
    expect(read(join(home, 'state/review-inbox', MOVED_NOTE))).toContain(join(home, 'state/nod'));
    expect(existsSync(join(home, 'state/nod', MOVED_NOTE))).toBe(false);
  });

  it('keeps the keystore and its pass file at mode 600', () => {
    write(join(home, 'config/review-inbox/android.keystore'), 'KEY', 0o600);
    write(join(home, 'config/review-inbox/android-keystore.pass'), 'secret', 0o600);
    chmodSync(join(home, 'config/review-inbox'), 0o700);

    migrateLegacyDirs(quiet);

    for (const name of ['android.keystore', 'android-keystore.pass']) {
      const path = join(home, 'config/nod', name);
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
    expect(read(join(home, 'config/nod/android.keystore'))).toBe('KEY');
    expect(statSync(join(home, 'config/nod')).mode & 0o777).toBe(0o700);
  });

  it('skips Chromium instance locks in the Electron profile', () => {
    write(join(home, 'config/review-inbox/Local State'), '{}');
    symlinkSync('host-123', join(home, 'config/review-inbox/SingletonLock'));

    migrateLegacyDirs(quiet);

    expect(existsSync(join(home, 'config/nod/Local State'))).toBe(true);
    expect(existsSync(join(home, 'config/nod/SingletonLock'))).toBe(false);
  });

  it('does nothing when only the new folder exists', () => {
    write(join(home, 'state/nod/seen.json'), 'new');

    expect(migrateLegacyDirs(quiet)).toEqual([]);
    expect(read(join(home, 'state/nod/seen.json'))).toBe('new');
    expect(existsSync(join(home, 'state/review-inbox'))).toBe(false);
  });

  it('leaves both folders alone when both exist', () => {
    write(join(home, 'state/review-inbox/seen.json'), 'old');
    write(join(home, 'state/nod/seen.json'), 'new');

    expect(migrateLegacyDirs(quiet)).toEqual([]);
    expect(read(join(home, 'state/nod/seen.json'))).toBe('new');
    expect(read(join(home, 'state/review-inbox/seen.json'))).toBe('old');
    expect(existsSync(join(home, 'state/review-inbox', MOVED_NOTE))).toBe(false);
  });

  it('is idempotent', () => {
    write(join(home, 'state/review-inbox/seen.json'), 'old');
    migrateLegacyDirs(quiet);
    write(join(home, 'state/nod/seen.json'), 'changed');

    expect(migrateLegacyDirs(quiet)).toEqual([]);
    expect(read(join(home, 'state/nod/seen.json'))).toBe('changed');
  });

  it('points the app at the new folders', () => {
    expect(defaultSeenPath()).toBe(join(home, 'state/nod/seen.json'));
    delete process.env.NOD_SETTINGS_DIR;
    delete process.env.REVIEW_INBOX_SETTINGS_DIR;
    expect(defaultSettingsPath()).toBe(join(home, 'config/nod/app-settings.json'));
  });
});

describe('environment variables', () => {
  it('reads NOD_ first', () => {
    process.env.NOD_X1 = 'new';
    process.env.REVIEW_INBOX_X1 = 'old';
    const log = vi.fn();
    expect(appEnv('X1', log)).toBe('new');
    expect(log).not.toHaveBeenCalled();
  });

  it('falls back to REVIEW_INBOX_ with one deprecation line per name', () => {
    process.env.REVIEW_INBOX_X2 = 'old';
    const log = vi.fn();
    expect(appEnv('X2', log)).toBe('old');
    expect(appEnv('X2', log)).toBe('old');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('REVIEW_INBOX_X2 is deprecated; set NOD_X2 instead.');
  });

  it('applies to the phone flag and the settings dir', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete process.env.NOD_PHONE;
    process.env.REVIEW_INBOX_PHONE = '1';
    expect(phoneRequested(false)).toBe(true);
    process.env.NOD_SETTINGS_DIR = join(home, 'custom');
    expect(defaultSettingsPath()).toBe(join(home, 'custom', 'app-settings.json'));
    warn.mockRestore();
  });
});
