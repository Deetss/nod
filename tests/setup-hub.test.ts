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
echo \"$*\" >> \"${'$'}STUB_DIR/systemctl.log\"
case \"$2\" in
  is-active) [[ -f \"${'$'}STUB_DIR/active-$4\" ]] ;;
  is-enabled) [[ -f \"${'$'}STUB_DIR/enabled-$4\" ]] ;;
  *) exit 0 ;;
esac
`;

function run(...args: string[]) {
  return spawnSync('bash', [join(repo, 'scripts/setup-hub.sh'), ...args], {
    encoding: 'utf8',
    env: { HOME: home, PATH: `${stubs}:/usr/bin:/bin`, STUB_DIR: dir },
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nod-install-'));
  repo = join(dir, 'repo');
  home = join(dir, 'home');
  stubs = join(dir, 'stubs');
  mkdirSync(home);
  copyFileSync('scripts/setup-hub.sh', join(repo, 'scripts/setup-hub.sh'));
  copyFileSync('scripts/install-desktop.sh', join(repo, 'scripts/install-desktop.sh'));
  copyFileSync('scripts/nod.service', join(repo, 'scripts/nod.service'));
  // Mock release directory and AppImage
  mkdirSync(join(repo, 'release'));
  write(join(repo, 'release/nod-9.9.9.AppImage'), 'mock appimage', 0o755);
  // Mock electron assets for icons
  mkdirSync(join(repo, 'electron', 'assets'));
  for (const size of [256, 512]) write(join(repo, `electron/assets/icon-${size}.png`), 'png');
  for (const tool of ['gh', 'tailscale', 'ldconfig', 'loginctl', 'systemctl', 'curl', 'sleep']) {
    write(join(stubs, tool), '#!/usr/bin/env bash\nexit 0\n', 0o755);
  }
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('setup-hub.sh', () => {
  it('`--check` with everything good exits 0, prints `Checks passed.`, and calls no `systemctl`', () => {
    // Mock successful gh auth status
    write(join(stubs, 'gh'), '#!/usr/bin/env bash\nif [[ "$1" == "auth" && "$2" == "status" && "$3" == "-h" && "$4" == "github.com" ]]; then echo "Token scopes: repo read:org project"; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "status" && "$2" == "--json" ]]; then echo '\''{"BackendState":"Running","Self":{"DNSName":"test.example.com"}}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'ldconfig'), '#!/usr/bin/env bash\nif [[ "$1" == "-p" ]]; then echo "libfuse.so.2"; exit 0; fi\n', 0o755);
    write(join(stubs, 'loginctl'), '#!/usr/bin/env bash\nif [[ "$1" == "show-user" && "$4" == "Linger" && "$5" == "--value" ]]; then echo "yes"; exit 0; fi\n', 0o755);
    write(join(stubs, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 0o755);

    const res = run('--check');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Checks passed.');
    expect(systemctlCalls()).not.toContain('systemctl');
  });

  it('`gh auth status` failing exits 1 and prints `fix: gh auth login -h github.com -s repo,read:org,project`', () => {
    // Mock failing gh auth status
    write(join(stubs, 'gh'), '#!/usr/bin/env bash\nif [[ "$1" == "auth" && "$2" == "status" && "$3" == "-h" && "$4" == "github.com" ]]; then exit 1; fi\n', 0o755);
    write(join(stubs, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 0o755);

    const res = run('--check');
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL GitHub login');
    expect(res.stdout).toContain('fix: gh auth login -h github.com -s repo,read:org,project');
  });

  it('Scopes `\'admin:org\', \'repo\'` (no project) exit 0 under `--check` and print `warn project missing`', () => {
    // Mock gh auth status with admin:org and repo but no project
    write(join(stubs, 'gh'), '#!/usr/bin/env bash\nif [[ "$1" == "auth" && "$2" == "status" && "$3" == "-h" && "$4" == "github.com" ]]; then echo "Token scopes: admin:org repo"; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "status" && "$2" == "--json" ]]; then echo '\''{"BackendState":"Running","Self":{"DNSName":"test.example.com"}}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'ldconfig'), '#!/usr/bin/env bash\nif [[ "$1" == "-p" ]]; then echo "libfuse.so.2"; exit 0; fi\n', 0o755);
    write(join(stubs, 'loginctl'), '#!/usr/bin/env bash\nif [[ "$1" == "show-user" && "$4" == "Linger" && "$5" == "--value" ]]; then echo "yes"; exit 0; fi\n', 0o755);
    write(join(stubs, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 0o755);

    const res = run('--check');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('warn project missing');
    expect(res.stdout).toContain('fix: gh auth refresh -h github.com -s read:org,project');
  });

  it('Linger `no` exits 1 and prints `fix: sudo loginctl enable-linger`', () => {
    // Mock successful prerequisites except linger
    write(join(stubs, 'gh'), '#!/usr/bin/env bash\nif [[ "$1" == "auth" && "$2" == "status" && "$3" == "-h" && "$4" == "github.com" ]]; then echo "Token scopes: repo read:org project"; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "status" && "$2" == "--json" ]]; then echo '\''{"BackendState":"Running","Self":{"DNSName":"test.example.com"}}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'ldconfig'), '#!/usr/bin/env bash\nif [[ "$1" == "-p" ]]; then echo "libfuse.so.2"; exit 0; fi\n', 0o755);
    write(join(stubs, 'loginctl'), '#!/usr/bin/env bash\nif [[ "$1" == "show-user" && "$4" == "Linger" && "$5" == "--value" ]]; then echo "no"; exit 0; fi\n', 0o755);
    write(join(stubs, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 0o755);

    const res = run('--check');
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL Linger');
    expect(res.stdout).toContain('fix: sudo loginctl enable-linger');
  });

  it('A full run where `tailscale serve status --json` already maps 443 to another proxy exits 1 with `port 443 already serves something else`', () => {
    // Mock all prerequisites passing
    write(join(stubs, 'gh'), '#!/usr/bin/env bash\nif [[ "$1" == "auth" && "$2" == "status" && "$3" == "-h" && "$4" == "github.com" ]]; then echo "Token scopes: repo read:org project"; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "status" && "$2" == "--json" ]]; then echo '\''{"BackendState":"Running","Self":{"DNSName":"test.example.com"}}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'ldconfig'), '#!/usr/bin/env bash\nif [[ "$1" == "-p" ]]; then echo "libfuse.so.2"; exit 0; fi\n', 0o755);
    write(join(stubs, 'loginctl'), '#!/usr/bin/env bash\nif [[ "$1" == "show-user" && "$4" == "Linger" && "$5" == "--value" ]]; then echo "yes"; exit 0; fi\n', 0o755);
    write(join(stubs, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    // Mock tailscale serve status showing proxy on 443
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "serve" && "$2" == "status" && "$3" == "--json" ]]; then echo '\''{"Handlers":[{"Port":443,"Mode":"HTTPS","Proxy":"http://127.0.0.1:80"}]}'\''; exit 0; fi\n' + 
                                        '#!/usr/bin/env bash\nif [[ "$1" == "serve" && "$2" == "--bg" && "$3" == "--https=443" && "$4" == "http://127.0.0.1:4477" ]]; then exit 1; fi\n', 0o755);
    write(join(stubs, 'curl'), '#!/usr/bin/env bash\nif [[ "$1" == "-fsS" && "$2" == "-m" && "$3" == "2" && "$4" == *"api/health"* ]]; then exit 1; fi\n', 0o755);

    const res = run();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('FAIL tailscale serve 443');
    expect(res.stdout).toContain('port 443 already serves something else');
    // Check that tailscale serve --bg was NOT called
    const tailscaleServeBgCalls = readFileSync(join(stubs, 'tailscale.log'), 'utf8');
    expect(tailscaleServeBgCalls).not.toContain('--bg');
  });

  it('A full run with no `DISPLAY` and no `WAYLAND_DISPLAY` writes the headless drop-in with the exact content above', () => {
    // Mock all prerequisites passing
    write(join(stubs, 'gh'), '#!/usr/bin/env bash\nif [[ "$1" == "auth" && "$2" == "status" && "$3" == "-h" && "$4" == "github.com" ]]; then echo "Token scopes: repo read:org project"; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "status" && "$2" == "--json" ]]; then echo '\''{"BackendState":"Running","Self":{"DNSName":"test.example.com"}}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'ldconfig'), '#!/usr/bin/env bash\nif [[ "$1" == "-p" ]]; then echo "libfuse.so.2"; exit 0; fi\n', 0o755);
    write(join(stubs, 'loginctl'), '#!/usr/bin/env bash\nif [[ "$1" == "show-user" && "$4" == "Linger" && "$5" == "--value" ]]; then echo "yes"; exit 0; fi\n', 0o755);
    write(join(stubs, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    // Mock tailscale serve status showing no handlers on 443 initially
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "serve" && "$2" == "status" && "$3" == "--json" ]]; then echo '\''{"Handlers":[]}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "serve" && "$2" == "--bg" && "$3" == "--https=443" && "$4" == "http://127.0.0.1:4477" ]]; then exit 0; fi\n', 0o755);
    write(join(stubs, 'curl'), '#!/usr/bin/env bash\nif [[ "$1" == "-fsS" && "$2" == "-m" && "$3" == "2" && "$4" == *"api/health"* ]]; then echo \'{"app":"nod"}\'; exit 0; fi\n', 0o755);
    // Mock systemctl
    write(join(stubs, 'systemctl'), SYSTEMCTL, 0o755);

    const res = run();
    expect(res.status).toBe(0);
    
    // Check that the drop-in file was created with correct content
    const dropinPath = join(home, '.config/systemd/user/nod.service.d/headless.conf');
    expect(exists(dropinPath)).toBe(true);
    const dropinContent = readFileSync(dropinPath, 'utf8');
    const expectedContent = `# No display on this machine; the in-app ozone switch is applied too late.
[Service]
ExecStart=
ExecStart=%h/.local/bin/nod serve --ozone-platform=headless
`;
    expect(dropinContent).toBe(expectedContent);
    
    // Check that systemctl daemon-reload was called
    expect(systemctlCalls()).toContain('--user daemon-reload');
  });

  it('`--settings` backs up an existing service settings file and copies the new one in.', () => {
    // Mock all prerequisites passing
    write(join(stubs, 'gh'), '#!/usr/bin/env bash\nif [[ "$1" == "auth" && "$2" == "status" && "$3" == "-h" && "$4" == "github.com" ]]; then echo "Token scopes: repo read:org project"; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "status" && "$2" == "--json" ]]; then echo '\''{"BackendState":"Running","Self":{"DNSName":"test.example.com"}}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'ldconfig'), '#!/usr/bin/env bash\nif [[ "$1" == "-p" ]]; then echo "libfuse.so.2"; exit 0; fi\n', 0o755);
    write(join(stubs, 'loginctl'), '#!/usr/bin/env bash\nif [[ "$1" == "show-user" && "$4" == "Linger" && "$5" == "--value" ]]; then echo "yes"; exit 0; fi\n', 0o755);
    write(join(stubs, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    // Mock tailscale serve status
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "serve" && "$2" == "status" && "$3" == "--json" ]]; then echo '\''{"Handlers":[]}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "serve" && "$2" == "--bg" && "$3" == "--https=443" && "$4" == "http://127.0.0.1:4477" ]]; then exit 0; fi\n', 0o755);
    write(join(stubs, 'curl'), '#!/usr/bin/env bash\nif [[ "$1" == "-fsS" && "$2" == "-m" && "$3" == "2" && "$4" == *"api/health"* ]]; then echo \'{"app":"nod"}\'; exit 0; fi\n', 0o755);
    
    // Create a fake settings file to back up
    const settingsDir = join(home, '.config/nod-service');
    mkdirSync(settingsDir, { recursive: true });
    const originalSettings = join(settingsDir, 'app-settings.json');
    write(originalSettings, '{"original": true}', 0o644);
    
    // Create test settings file
    const testSettings = join(dir, 'test-settings.json');
    write(testSettings, '{"test": true}', 0o644);

    const res = run('--settings', testSettings);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('settings from FILE');
    
    // Check backup was created
    const backupExists = existsSync(originalSettings + '.bak-');
    expect(backupExists).toBe(true);
    
    // Check new settings were copied
    const newSettings = readFileSync(originalSettings, 'utf8');
    expect(newSettings).toBe('{"test": true}');
  });

  it('`--pair` prints the pairing link and the output never contains the token value the stub served.', () => {
    // Mock all prerequisites passing
    write(join(stubs, 'gh'), '#!/usr/bin/env bash\nif [[ "$1" == "auth" && "$2" == "status" && "$3" == "-h" && "$4" == "github.com" ]]; then echo "Token scopes: repo read:org project"; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "status" && "$2" == "--json" ]]; then echo '\''{"BackendState":"Running","Self":{"DNSName":"test.example.com"}}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'ldconfig'), '#!/usr/bin/env bash\nif [[ "$1" == "-p" ]]; then echo "libfuse.so.2"; exit 0; fi\n', 0o755);
    write(join(stubs, 'loginctl'), '#!/usr/bin/env bash\nif [[ "$1" == "show-user" && "$4" == "Linger" && "$5" == "--value" ]]; then echo "yes"; exit 0; fi\n', 0o755);
    write(join(stubs, 'python3'), '#!/usr/bin/env bash\nexit 0\n', 0o755);
    // Mock tailscale serve status
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "serve" && "$2" == "status" && "$3" == "--json" ]]; then echo '\''{"Handlers":[]}'\''; exit 0; fi\n', 0o755);
    write(join(stubs, 'tailscale'), '#!/usr/bin/env bash\nif [[ "$1" == "serve" && "$2" == "--bg" && "$3" == "--https=443" && "$4" == "http://127.0.0.1:4477" ]]; then exit 0; fi\n', 0o755);
    write(join(stubs, 'curl'), '#!/usr/bin/env bash\nif [[ "$1" == "-fsS" && "$2" == "-m" && "$3" == "2" && "$4" == *"api/health"* ]]; then echo \'{"app":"nod"}\'; exit 0; fi\n', 0o755);
    // Mock the initial page curl for token
    write(join(stubs, 'curl'), '#!/usr/bin/env bash\nif [[ "$1" == "-fsS" && "$2" == "http://127.0.0.1:4477/" ]]; then echo \'<html><head><meta name="nod-token" content="fake-token-12345"></head></html>\'; exit 0; fi\n' +
                                        '#!/usr/bin/env bash\nif [[ "$1" == "-fsS" && "$2" == "-X" && "$3" == "POST" && "$4" == *"api/pair/code"* ]]; then echo \'{"link":"https://test.example.com/pair#code=abc123"}\'; exit 0; fi\n', 0o755);

    const res = run('--pair');
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Pairing link (one use, 10 minutes):');
    expect(res.stdout).toContain('https://test.example.com/pair#code=abc123');
    // Ensure token never appears in output
    expect(res.stdout).not.toContain('fake-token-12345');
  });
});