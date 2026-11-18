import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The script runs from a temp repo layout against a temp HOME. Every outside tool is a stub on PATH
// that logs its call and answers from scenario files in STUB_DIR; the real python3 parses the JSON.

let dir: string;
let repo: string;
let home: string;
let stubs: string;

const write = (path: string, text: string, mode = 0o644) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  chmodSync(path, mode);
};
const scenario = (name: string, text: string) => write(join(dir, name), text);
const calls = () => (existsSync(join(dir, 'calls.log')) ? readFileSync(join(dir, 'calls.log'), 'utf8') : '');

const LOG = 'echo "$(basename "$0") $*" >> "$STUB_DIR/calls.log"';
const or = (file: string, fallback: string) => `$(cat "$STUB_DIR/${file}" 2>/dev/null || echo "${fallback}")`;

const STUBS: Record<string, string> = {
  gh: `case "$1 $2" in
  "auth status") echo "  - Token scopes: ${or('gh-scopes', "'admin:org', 'project', 'repo'")}" >&2; exit ${or('gh-status-exit', '0')} ;;
  "auth token") echo tok ;;
  "release download")
    while [[ $# -gt 0 ]]; do [[ "$1" == --dir ]] && { mkdir -p "$2"; touch "$2/nod-9.9.9.AppImage"; }; shift; done ;;
esac`,
  tailscale: `case "$1 $2" in
  "status --json") echo '{"BackendState":"Running","Self":{"DNSName":"hub.example.ts.net."}}' ;;
  "serve status") cat "$STUB_DIR/serve.json" 2>/dev/null || echo '{}' ;;
esac`,
  ldconfig: `echo "libfuse.so.2 (libc6,x86-64) => /usr/lib/libfuse.so.2"`,
  loginctl: `echo "${or('linger', 'yes')}"`,
  systemctl: 'exit 0',
  sleep: 'exit 0',
  curl: `for a in "$@"; do
  case "$a" in
    */api/health) echo '{"app":"nod","build":"x"}'; exit 0 ;;
    */api/pair/code) echo '{"code":"abc","link":"https://hub.example.ts.net/pair#code=abc"}'; exit 0 ;;
  esac
done
echo '<html><head><meta name="nod-token" content="SECRET-TOKEN-123"></head></html>'`,
};

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync('bash', [join(repo, 'scripts/setup-hub.sh'), ...args], {
    encoding: 'utf8',
    env: { HOME: home, USER: 'tester', PATH: `${stubs}:/usr/bin:/bin`, STUB_DIR: dir, ...env },
  });
}

const OURS = '{"TCP":{"443":{"HTTPS":true}},"Web":{"hub.example.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:4477"}}}}}';
const OTHER = OURS.replace('4477', '8080');
const DROPIN = '.config/systemd/user/nod.service.d/headless.conf';
const SETTINGS = '.config/nod-service/app-settings.json';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nod-hub-'));
  repo = join(dir, 'repo');
  home = join(dir, 'home');
  stubs = join(dir, 'stubs');
  mkdirSync(home);
  write(join(repo, 'scripts/setup-hub.sh'), readFileSync('scripts/setup-hub.sh', 'utf8'), 0o755);
  write(join(repo, 'scripts/install-desktop.sh'), `#!/usr/bin/env bash\necho "install-desktop $*" >> "$STUB_DIR/calls.log"\n`, 0o755);
  for (const [tool, body] of Object.entries(STUBS)) write(join(stubs, tool), `#!/usr/bin/env bash\n${LOG}\n${body}\n`, 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('setup-hub.sh checks', () => {
  it('passes --check without touching the service', () => {
    const res = run(['--check']);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('Checks passed.');
    expect(calls()).not.toMatch(/^(systemctl|install-desktop)/m);
  });

  it('stops on a missing GitHub login with the login command', () => {
    scenario('gh-status-exit', '1');
    const res = run(['--check']);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL GitHub login');
    expect(res.stdout).toContain('fix: gh auth login -h github.com -s repo,read:org,project');
  });

  it('warns on a missing optional scope and accepts admin:org for read:org', () => {
    scenario('gh-scopes', "'admin:org', 'repo'");
    const res = run(['--check']);
    expect(res.status, res.stdout).toBe(0);
    expect(res.stdout).toContain('warn project missing');
    expect(res.stdout).not.toContain('warn read:org missing');
  });

  it('stops when the repo scope is missing', () => {
    scenario('gh-scopes', "'gist'");
    const res = run(['--check']);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL GitHub scope repo');
  });

  it('prints the linger command instead of running sudo', () => {
    scenario('linger', 'no');
    const res = run(['--check']);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('fix: sudo loginctl enable-linger tester');
    expect(calls()).not.toMatch(/^sudo/m);
  });
});

describe('setup-hub.sh full run', () => {
  it('stops rather than replace another site on 443', () => {
    scenario('serve.json', OTHER);
    const res = run([]);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL port 443 already serves something else');
    expect(calls()).not.toContain('serve --bg');
  });

  it('keeps an existing Nod serve and prints the hub URL', () => {
    scenario('serve.json', OURS);
    const res = run([]);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('ok   tailscale serve 443');
    expect(res.stdout).toContain('Hub URL: https://hub.example.ts.net');
    expect(calls()).not.toContain('serve --bg');
    expect(calls()).toContain('install-desktop --install-service --restart');
  });

  it('serves 443 when it is free', () => {
    const res = run([]);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(calls()).toContain('tailscale serve --bg --https=443 http://127.0.0.1:4477');
  });

  it('writes the headless drop-in only without a display', () => {
    expect(run([]).status).toBe(0);
    expect(readFileSync(join(home, DROPIN), 'utf8')).toBe(
      '# No display on this machine; the in-app ozone switch is applied too late.\n' +
        '[Service]\nExecStart=\nExecStart=%h/.local/bin/nod serve --ozone-platform=headless\n',
    );
    rmSync(join(home, DROPIN));
    expect(run([], { DISPLAY: ':0' }).status).toBe(0);
    expect(existsSync(join(home, DROPIN))).toBe(false);
  });

  it('backs up the service settings before copying new ones in', () => {
    write(join(home, SETTINGS), '{"orgs":["old"]}');
    write(join(dir, 'new.json'), '{"orgs":["acme"]}');
    const res = run(['--settings', join(dir, 'new.json')]);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(readFileSync(join(home, SETTINGS), 'utf8')).toBe('{"orgs":["acme"]}');
    const folder = join(home, '.config/nod-service');
    const backups = readdirSync(folder).filter((f) => f.startsWith('app-settings.json.bak-'));
    const [backup] = backups;
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(folder, backup ?? ''), 'utf8')).toBe('{"orgs":["old"]}');
  });

  it('refuses settings that are not JSON', () => {
    write(join(dir, 'bad.json'), 'not json');
    const res = run(['--settings', join(dir, 'bad.json')]);
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL settings from');
  });
});

describe('setup-hub.sh pairing and arguments', () => {
  it('prints a pairing link and never the session token', () => {
    const res = run(['--pair']);
    expect(res.status, res.stdout + res.stderr).toBe(0);
    expect(res.stdout).toContain('Pairing link (one use, 10 minutes): https://hub.example.ts.net/pair#code=abc');
    expect(res.stdout + res.stderr).not.toContain('SECRET-TOKEN-123');
  });

  it('rejects --pair with --check', () => {
    expect(run(['--pair', '--check']).status).toBe(2);
  });

  it('rejects --settings without a file', () => {
    expect(run(['--settings']).status).toBe(2);
  });
});
