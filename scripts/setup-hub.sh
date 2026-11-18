#!/usr/bin/env bash
# Sets up this machine as a Nod hub: the service, Tailscale Serve on 443, and pairing links. Safe to re-run.
# Never runs sudo; it prints the command instead.
set -euo pipefail

usage="Usage: $0 [--check] [--settings FILE] [--pair] [--help]"
check=0
pair=0
settings=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) check=1 ;;
    --pair) pair=1 ;;
    --settings)
      [[ $# -ge 2 ]] || { echo "$usage" >&2; exit 2; }
      settings="$2"
      shift
      ;;
    --help) echo "$usage"; exit 0 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
  shift
done
if [[ "$pair" -eq 1 && ( "$check" -eq 1 || -n "$settings" ) ]]; then
  echo "$usage" >&2
  exit 2
fi

port=4477
origin="http://127.0.0.1:$port"
repo_slug=github.com/Deetss/nod
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
svc_settings="$HOME/.config/nod-service/app-settings.json"
dropin="$HOME/.config/systemd/user/nod.service.d/headless.conf"
scopes_wanted=repo,read:org,project

ok() { printf 'ok   %s\n' "$1"; }
warn() {
  printf 'warn %s\n' "$1"
  if [[ -n "${2:-}" ]]; then printf '  fix: %s\n' "$2"; fi
}
fail() {
  printf 'FAIL %s\n' "$1"
  if [[ -n "${2:-}" ]]; then printf '  fix: %s\n' "$2"; fi
  exit 1
}

# Prints one JSON field from stdin, or nothing when it is missing.
json_get() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
for key in sys.argv[1:]:
    d = d.get(key) if isinstance(d, dict) else None
print("" if d is None else d)' "$@"
}

# The session token stays in variables; it is never printed.
pair() {
  local page token body link
  page="$(curl -fsS -m 5 "$origin/" 2>/dev/null)" || fail "pairing code" "systemctl --user status nod"
  token="$(sed -n 's/.*name="nod-token" content="\([^"]*\)".*/\1/p' <<<"$page" | head -n 1)"
  [[ -n "$token" ]] || fail "pairing code" "systemctl --user status nod"
  body="$(curl -fsS -m 5 -X POST -H "Origin: $origin" -H "x-nod-token: $token" \
    -H 'content-type: application/json' -d '{}' "$origin/api/pair/code" 2>/dev/null)" \
    || fail "pairing code" "systemctl --user status nod"
  link="$(json_get link <<<"$body" 2>/dev/null || true)"
  [[ -n "$link" ]] || fail "pairing code" "systemctl --user status nod"
  echo "Pairing link (one use, 10 minutes): $link"
}

if [[ "$pair" -eq 1 ]]; then
  pair
  exit 0
fi

command -v python3 >/dev/null || fail "python3" "install python3"
ok "python3"

gh auth status -h github.com >/dev/null 2>&1 || fail "GitHub login" "gh auth login -h github.com -s $scopes_wanted"
ok "GitHub login"

# The service has no desktop session, so gh must answer without a keyring prompt.
env -u DISPLAY -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS gh auth token -h github.com >/dev/null 2>&1 \
  || fail "GitHub login without a keyring" "gh auth login -h github.com --insecure-storage -s $scopes_wanted"
ok "GitHub login without a keyring"

scopes="$(gh auth status -h github.com 2>&1 | sed -n 's/.*Token scopes: //p' | tr -d "',")"
has_scope() {
  local s
  for s in "$@"; do
    [[ " $scopes " == *" $s "* ]] && return 0
  done
  return 1
}
if [[ -z "$scopes" ]]; then
  warn "scopes unknown"
else
  has_scope repo || fail "GitHub scope repo" "gh auth login -h github.com -s $scopes_wanted"
  ok "GitHub scope repo"
  refresh="gh auth refresh -h github.com -s read:org,project"
  has_scope read:org write:org admin:org || warn "read:org missing" "$refresh"
  has_scope project read:project || warn "project missing" "$refresh"
fi

ts="$(tailscale status --json 2>/dev/null)" || fail "Tailscale" "tailscale up"
[[ "$(json_get BackendState <<<"$ts")" == Running ]] || fail "Tailscale" "tailscale up"
host="$(json_get Self DNSName <<<"$ts")"
host="${host%.}"
ok "Tailscale"

ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2' || fail "FUSE 2" "sudo apt install libfuse2   # or: sudo pacman -S fuse2"
ok "FUSE 2"

[[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null || true)" == yes ]] \
  || fail "linger" "sudo loginctl enable-linger $USER"
ok "linger"

if [[ "$check" -eq 1 ]]; then
  echo "Checks passed."
  exit 0
fi

mkdir -p "$root/release"
gh release download -R "$repo_slug" --pattern 'nod-*.AppImage' --dir "$root/release" --clobber >/dev/null \
  || fail "download latest release" "gh release view -R $repo_slug"
bash "$root/scripts/install-desktop.sh" --install-service --restart || fail "install latest release"
ok "install latest release"

if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  mkdir -p "$(dirname "$dropin")"
  cat > "$dropin" <<'EOF'
# No display on this machine; the in-app ozone switch is applied too late.
[Service]
ExecStart=
ExecStart=%h/.local/bin/nod serve --ozone-platform=headless
EOF
  systemctl --user daemon-reload
  ok "headless drop-in"
fi

if [[ -n "$settings" ]]; then
  python3 -m json.tool "$settings" >/dev/null 2>&1 || fail "settings from $settings"
  mkdir -p "$(dirname "$svc_settings")"
  if [[ -f "$svc_settings" ]]; then
    cp "$svc_settings" "$svc_settings.bak-$(date +%s)"
  fi
  cp "$settings" "$svc_settings"
  ok "settings from $settings"
fi

systemctl --user enable nod >/dev/null 2>&1
systemctl --user restart nod
up=0
for _ in $(seq 30); do
  if curl -fsS -m 2 "$origin/api/health" 2>/dev/null | grep -q '"app":"nod"'; then
    up=1
    break
  fi
  sleep 1
done
[[ "$up" -eq 1 ]] || fail "service answers on $port" "journalctl --user -t nod -n 50"
ok "service answers on $port"

# free: nothing on 443. ours: only "/" proxied to Nod. taken: anything else, which is never replaced.
serve_state="$(tailscale serve status --json 2>/dev/null | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin) or {}
except ValueError:
    d = {}
handlers = [
    (path, h)
    for site, cfg in (d.get("Web") or {}).items()
    if site.endswith(":443")
    for path, h in ((cfg or {}).get("Handlers") or {}).items()
]
if not handlers and "443" not in (d.get("TCP") or {}):
    print("free")
elif len(handlers) == 1 and handlers[0][0] == "/" and (handlers[0][1] or {}).get("Proxy") == sys.argv[1]:
    print("ours")
else:
    print("taken")' "$origin")"
case "$serve_state" in
  ours) ok "tailscale serve 443" ;;
  free)
    tailscale serve --bg --https=443 "$origin" >/dev/null 2>&1 \
      || fail "tailscale serve 443" "sudo tailscale set --operator=$USER"
    ok "tailscale serve 443"
    ;;
  *) fail "port 443 already serves something else" ;;
esac

echo
echo "Hub URL: https://$host"
echo "Pair a phone: scripts/setup-hub.sh --pair"
