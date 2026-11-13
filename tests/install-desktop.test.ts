import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The installer runs from a copy of the repo layout with a fake build, against a temporary HOME.
// systemctl and the desktop tools are stubs on PATH; systemctl logs its calls and answers from files.

let dir: string;
let repo: string;
let home: string;
let stubs: string;

const write = (path: string, text: string, mode = 0o644) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  chmodSync(path, mode);
};
const at = (rel: string) => join(home, rel);
const exists = (rel: string) => existsSync(at(rel)) || isLink(rel);
const isLink = (rel: string) => {
  try {
    return lstatSync(at(rel)).isSymbolicLink();
  } catch {
    return false;
  }
};
const systemctlCalls = () => (existsSync(join(dir, 'systemctl.log')) ? readFileSync(join(dir, 'systemctl.log'), 'utf8') : '');

const SYSTEMCTL = `#!/usr/bin/env bash
echo "$*" >> "${'$'}STUB_DIR/systemctl.log"
case "$2" in
  is-active) [[ -f "${'$'}STUB_DIR/active-$4" ]] ;;
  is-enabled) [[ -f "${'$'}STUB_DIR/enabled-$4" ]] ;;
  *) exit 0 ;;
esac
`;

function run(...args: string[]) {
  return spawnSync('bash', [join(repo, 'scripts/install-desktop.sh'), ...args], {
    encoding: 'utf8',
    env: { HOME: home, PATH: `${stubs}:/usr/bin:/bin`, STUB_DIR: dir },
  });
}

/** What the pre-rename installer left behind. */
function oldInstall() {
  write(at('.local/opt/review-inbox/review-inbox'), 'old binary', 0o755);
  write(at('.local/bin/review-inbox'), `#!/usr/bin/env bash\nexec "${home}/.local/opt/review-inbox/review-inbox" "$@"\n`, 0o755);
  write(at('.local/share/applications/review-inbox.desktop'), '[Desktop Entry]\nName=review-inbox\nStartupWMClass=review-inbox\n');
  for (const size of [256, 512]) write(at(`.local/share/icons/hicolor/${size}x${size}/apps/review-inbox.png`), 'png');
  write(at('.config/systemd/user/review-inbox.service'), '[Service]\nExecStart=%h/.local/bin/review-inbox serve\n');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nod-install-'));
  repo = join(dir, 'repo');
  home = join(dir, 'home');
  stubs = join(dir, 'stubs');
  mkdirSync(home);
  write(join(repo, 'scripts/install-desktop.sh'), readFileSync('scripts/install-desktop.sh', 'utf8'), 0o755);
  copyFileSync('scripts/nod.service', join(repo, 'scripts/nod.service'));
  // sort -V must pick 0.1.10 over 0.1.9.
  write(join(repo, 'release/nod-0.1.9.AppImage'), 'old appimage', 0o755);
  write(join(repo, 'release/nod-0.1.10.AppImage'), 'new appimage', 0o755);
  for (const size of [256, 512]) write(join(repo, `electron/assets/icon-${size}.png`), 'png');
  write(join(stubs, 'systemctl'), SYSTEMCTL, 0o755);
  for (const tool of ['pgrep', 'curl', 'setsid', 'gtk-update-icon-cache', 'update-desktop-database']) {
    write(join(stubs, tool), '#!/usr/bin/env bash\nexit 0\n', 0o755);
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('install-desktop.sh', () => {
  it('installs the new names on a clean HOME and links the old command', () => {
    const res = run();
    expect(res.status, res.stderr).toBe(0);
    expect(readFileSync(at('.local/opt/nod/nod.AppImage'), 'utf8')).toBe('new appimage');
    expect(readFileSync(at('.local/bin/nod'), 'utf8')).toContain(`exec "${home}/.local/opt/nod/nod.AppImage"`);
    const entry = readFileSync(at('.local/share/applications/nod.desktop'), 'utf8');
    expect(entry).toContain('Name=Nod');
    expect(entry).toContain('StartupWMClass=nod');
    expect(entry).toContain('Icon=nod');
    expect(exists('.local/share/icons/hicolor/512x512/apps/nod.png')).toBe(true);
    expect(readlinkSync(at('.local/bin/review-inbox'))).toBe('nod');
    expect(exists('.config/systemd/user/nod.service')).toBe(false);
  });

  it('replaces the old install, stops and disables the old unit, and enables nod when the old one was', () => {
    oldInstall();
    write(join(dir, 'active-review-inbox'), '');
    write(join(dir, 'enabled-review-inbox'), '');

    const res = run();

    expect(res.status, res.stderr).toBe(0);
    for (const rel of [
      '.local/opt/review-inbox',
      '.local/share/applications/review-inbox.desktop',
      '.local/share/icons/hicolor/256x256/apps/review-inbox.png',
      '.local/share/icons/hicolor/512x512/apps/review-inbox.png',
      '.config/systemd/user/review-inbox.service',
    ]) {
      expect(exists(rel), rel).toBe(false);
      expect(res.stdout).toContain(`Removed ${at(rel)}`);
    }
    expect(res.stdout).toContain(`Removed ${at('.local/bin/review-inbox')}`);
    expect(readlinkSync(at('.local/bin/review-inbox'))).toBe('nod');
    expect(readFileSync(at('.config/systemd/user/nod.service'), 'utf8')).toContain('ExecStart=%h/.local/bin/nod serve');
    const calls = systemctlCalls();
    expect(calls).toContain('--user disable --now review-inbox');
    expect(calls).toContain('--user enable nod');
    expect(calls).toContain('--user start nod');
  });

  it('leaves files it did not write', () => {
    write(at('.local/bin/review-inbox'), '#!/bin/sh\necho mine\n', 0o755);
    write(at('.local/share/applications/review-inbox.desktop'), '[Desktop Entry]\nName=custom\n');
    write(at('.config/systemd/user/review-inbox.service'), '[Service]\nExecStart=/opt/custom\n');

    const res = run();

    expect(res.status, res.stderr).toBe(0);
    expect(readFileSync(at('.local/bin/review-inbox'), 'utf8')).toContain('echo mine');
    expect(exists('.local/share/applications/review-inbox.desktop')).toBe(true);
    expect(exists('.config/systemd/user/review-inbox.service')).toBe(true);
    expect(res.stdout).not.toContain('Removed');
  });

  it('restarts a running service with --install-service, so the relaunched window cannot take its port', () => {
    expect(run('--install-service').status).toBe(0);
    write(join(dir, 'active-nod'), '');
    const res = run('--install-service');
    expect(res.status, res.stderr).toBe(0);
    const calls = systemctlCalls().split('\n');
    const stop = calls.lastIndexOf('--user stop nod');
    expect(stop).toBeGreaterThan(-1);
    expect(calls.lastIndexOf('--user start nod')).toBeGreaterThan(stop);
  });

  it('is safe to re-run', () => {
    oldInstall();
    expect(run().status).toBe(0);
    const again = run();
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).not.toContain('Removed');
    expect(readlinkSync(at('.local/bin/review-inbox'))).toBe('nod');
  });

  it('--uninstall removes the new names and the legacy link, and keeps data', () => {
    write(at('.config/nod/app-settings.json'), '{}');
    expect(run('--install-service').status).toBe(0);

    const res = run('--uninstall');

    expect(res.status, res.stderr).toBe(0);
    for (const rel of [
      '.local/opt/nod',
      '.local/bin/nod',
      '.local/bin/review-inbox',
      '.local/share/applications/nod.desktop',
      '.local/share/icons/hicolor/512x512/apps/nod.png',
      '.config/systemd/user/nod.service',
    ]) {
      expect(exists(rel), rel).toBe(false);
      expect(res.stdout).toContain(`Removed ${at(rel)}`);
    }
    expect(systemctlCalls()).toContain('--user disable --now nod');
    expect(exists('.config/nod/app-settings.json')).toBe(true);
  });
});
