#!/usr/bin/env bash
set -euo pipefail

# Parse arguments
check=0
settings_file=""
pair=0
help=0

for arg in "$@"; do
  case "$arg" in
    --check) check=1 ;;
    --settings)
      # Get next argument
      shift
      settings_file="$1"
      ;;
    --pair) pair=1 ;;
    --help) help=1 ;;
    *) echo "Usage: $0 [--check] [--settings FILE] [--pair] [--help]" >&2; exit 2 ;;
  esac
  shift
done

# Check for conflicting arguments
if [[ $pair -eq 1 && ($check -eq 1 || -n "$settings_file") ]]; then
  echo "Usage: $0 [--check] [--settings FILE] [--pair] [--help]" >&2
  exit 2
fi

# Help
if [[ $help -eq 1 ]]; then
  echo "Usage: $0 [--check] [--settings FILE] [--pair] [--help]"
  echo "  --check          Check prerequisites without making changes"
  echo "  --settings FILE  Copy settings from FILE"
  echo "  --pair           Print a pairing link and exit"
  echo "  --help           Show this help and exit"
  exit 0
fi

# Constants
port=4477
repo_slug="github.com/Deetss/nod"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
svc_settings="$HOME/.config/nod-service/app-settings.json"
dropin="$HOME/.config/systemd/user/nod.service.d/headless.conf"

# Function to print step status
print_step() {
  if [[ $1 -eq 0 ]]; then
    printf "ok   %s\n" "$2"
  else
    printf "FAIL %s\n" "$2"
    if [[ -n "$3" ]]; then
      printf "  fix: %s\n" "$3"
    fi
    exit 1
  fi
}

# Pair function
pair_function() {
  # Get session token from meta tag
  token=$(curl -fsS "http://127.0.0.1:$port/" | grep -o '<meta name="nod-token" content="[^"]*' | cut -d'"' -f4)
  
  # Request pairing code
  response=$(curl -fsS -X POST -H "Origin: http://127.0.0.1:$port" \
    -H "x-nod-token: $token" -H 'content-type: application/json' -d '{}' \
    "http://127.0.0.1:$port/api/pair/code")
  
  # Extract link from JSON
  link=$(echo "$response" | grep -o '"link":"[^"]*"' | cut -d'"' -f4)
  
  echo "Pairing link (one use, 10 minutes): $link"
}

# Main logic
if [[ $pair -eq 1 ]]; then
  pair_function
  exit 0
fi

# Step 1: python3 exists
if command -v python3 >/dev/null 2>&1; then
  print_step 0 "python3 exists"
else
  print_step 1 "python3 exists" "install python3"
fi

# Step 2: GitHub login
if gh auth status -h github.com >/dev/null 2>&1; then
  print_step 0 "GitHub login"
else
  print_step 1 "GitHub login" "gh auth login -h github.com -s repo,read:org,project"
fi

# Step 3: No keyring prompt
if env -u DISPLAY -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS gh auth token -h github.com >/dev/null 2>&1; then
  print_step 0 "No keyring prompt"
else
  print_step 1 "No keyring prompt" "gh auth login -h github.com --insecure-storage -s repo,read:org,project"
fi

# Step 4: Scopes
scopes_line=$(gh auth status -h github.com 2>&1 | grep "Token scopes:" || true)
if [[ -n "$scopes_line" ]]; then
  # Extract scopes
  scopes=${scopes_line#*Token scopes: }
  scopes=$(echo "$scopes" | xargs)  # Trim whitespace
  
  # Check required repo scope
  if [[ "$scopes" != *repo* ]]; then
    print_step 1 "Scopes" "gh auth login -h github.com -s repo,read:org,project"
  fi
  
  # Check optional read:org scope (satisfied by read:org, write:org, or admin:org)
  if [[ ! "$scopes" =~ (read:org|write:org|admin:org) ]]; then
    echo "warn read:org missing"
    echo "  fix: gh auth refresh -h github.com -s read:org,project"
  fi
  
  # Check optional project scope (satisfied by project or read:project)
  if [[ ! "$scopes" =~ (project|read:project) ]]; then
    echo "warn project missing"
    echo "  fix: gh auth refresh -h github.com -s read:org,project"
  fi
else
  echo "warn scopes unknown"
fi

# Step 5: Tailscale
if tailscale status --json >/dev/null 2>&1; then
  backend_state=$(tailscale status --json | python3 -c "import sys, json; print(json.load(sys.stdin)['BackendState'])")
  if [[ "$backend_state" == "Running" ]]; then
    host=$(tailscale status --json | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))")
    print_step 0 "Tailscale"
  else
    print_step 1 "Tailscale" "tailscale up"
  fi
else
  print_step 1 "Tailscale" "tailscale up"
fi

# Step 6: FUSE 2
if ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
  print_step 0 "FUSE 2"
else
  print_step 1 "FUSE 2" "sudo apt install libfuse2   # or: sudo pacman -S fuse2"
fi

# Step 7: Linger
if [[ $(loginctl show-user "$USER" -p Linger --value) == "yes" ]]; then
  print_step 0 "Linger"
else
  print_step 1 "Linger" "sudo loginctl enable-linger $USER"
fi

# --check exits here
if [[ $check -eq 1 ]]; then
  echo "Checks passed."
  exit 0
fi

# Step 8: Install
mkdir -p "$root/release"
gh release download -R "$repo_slug" --pattern 'nod-*.AppImage' --dir "$root/release" --clobber
bash "$root/scripts/install-desktop.sh" --install-service --restart
print_step 0 "install latest release"

# Step 9: Headless
if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  mkdir -p "$(dirname "$dropin")"
  cat > "$dropin" <<'EOF'
# No display on this machine; the in-app ozone switch is applied too late.
[Service]
ExecStart=
ExecStart=%h/.local/bin/nod serve --ozone-platform=headless
EOF
  systemctl --user daemon-reload
  # No output for this step when executed
fi

# Step 10: Settings
if [[ -n "$settings_file" ]]; then
  if [[ ! -f "$settings_file" ]]; then
    echo "FAIL settings from FILE"
    echo "  fix: File $settings_file does not exist"
    exit 1
  fi
  
  if ! python3 -m json.tool "$settings_file" >/dev/null 2>&1; then
    echo "FAIL settings from FILE"
    # No fix line per spec
    exit 1
  fi
  
  if [[ -f "$svc_settings" ]]; then
    cp "$svc_settings" "$svc_settings.bak-$(date +%s)"
  fi
  
  mkdir -p "$(dirname "$svc_settings")"
  cp "$settings_file" "$svc_settings"
  print_step 0 "settings from FILE"
fi

# Step 11: Service
systemctl --user enable nod
systemctl --user restart nod

# Poll for service readiness
for i in {1..30}; do
  if curl -fsS -m 2 "http://127.0.0.1:$port/api/health" | grep -q '"app":"nod"'; then
    print_step 0 "service answers on $port"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "FAIL service answers on $port"
    echo "  fix: journalctl --user -t nod -n 50"
    exit 1
  fi
  sleep 1
done

# Step 12: Serve
tailscale_json=$(tailscale serve status --json)
if python3 -m json.tool <<<"$tailscale_json" >/dev/null 2>&1; then
  # Parse with Python to check if port 443 is configured correctly
  handler_count=$(python3 <<'EOF'
import sys, json
data = json.load(sys.stdin)
count = 0
for handler in data.get('Handlers', []):
    if handler.get('Port') == 443:
        count += 1
print(count)
EOF
)
  
  if [[ $handler_count -eq 0 ]]; then
    # No handler on port 443, set it up
    tailscale serve --bg --https=443 "http://127.0.0.1:$port"
    print_step 0 "tailscale serve 443"
  elif [[ $handler_count -eq 1 ]]; then
    # Check if it's exactly the right handler
    is_correct=$(python3 <<'EOF'
import sys, json
data = json.load(sys.stdin)
for handler in data.get('Handlers', []):
    if handler.get('Port') == 443:
        if handler.get('Mode') == 'HTTPS':
            proxy = handler.get('Proxy', '')
            if proxy == 'http://127.0.0.1:4477':
                print('yes')
                sys.exit(0)
        break
print('no')
EOF
)
    if [[ "$is_correct" == "yes" ]]; then
      print_step 0 "tailscale serve 443"
    else
      echo "FAIL port 443 already serves something else"
      # No fix line per spec
      exit 1
    fi
  else
    echo "FAIL port 443 already serves something else"
    # No fix line per spec
    exit 1
  fi
else
  # Failed to parse JSON, treat as no handler
  tailscale serve --bg --https=443 "http://127.0.0.1:$port"
  print_step 0 "tailscale serve 443"
fi

# Final output
echo "Hub URL: https://$host"
echo "Pair a phone: scripts/setup-hub.sh --pair"