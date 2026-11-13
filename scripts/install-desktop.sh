#!/usr/bin/env bash
# Installs the AppImage (pnpm app:dist) for the current user. Safe to re-run.
# Later releases install themselves through the in-app updater.
# Also replaces what the pre-rename installer (review-inbox) wrote, and nothing else.
set -euo pipefail

restart=0
install_service=0
uninstall=0
for arg in "$@"; do
  case "$arg" in
    --restart) restart=1 ;;
    --install-service) install_service=1 ;;
    --uninstall) uninstall=1 ;;
    *) echo "Usage: $0 [--restart] [--install-service] | --uninstall" >&2; exit 2 ;;
  esac
done

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The newest build, by version.
src="$(ls -1 "$root"/release/nod-*.AppImage 2>/dev/null | sort -V | tail -n 1 || true)"
opt="$HOME/.local/opt/nod"
appimage="$opt/nod.AppImage"
bin="$HOME/.local/bin/nod"
desktop="$HOME/.local/share/applications/nod.desktop"
icons="$HOME/.local/share/icons/hicolor"
unit_dir="$HOME/.config/systemd/user"
unit="$unit_dir/nod.service"
sizes=(256 512)

# Pre-rename paths. Kept for one release: the old command becomes a symlink to the new one.
old_opt="$HOME/.local/opt/review-inbox"
old_bin="$HOME/.local/bin/review-inbox"
old_desktop="$HOME/.local/share/applications/review-inbox.desktop"
old_unit="$unit_dir/review-inbox.service"

have_systemctl() { command -v systemctl >/dev/null; }

removed() { echo "Removed $1"; }

refresh_caches() {
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$icons" || true
  command -v update-desktop-database >/dev/null && update-desktop-database "$HOME/.local/share/applications" || true
}

# Main process of the desktop app only: no --serve (the service) and no --type= (Chromium helpers).
# An AppImage runs from its mount, /tmp/.mount_<name><random>; $opt/nod is the old unpacked install.
desktop_pids() {
  local pid
  for pid in $(pgrep -f "^($opt/nod|/tmp/\.mount_nod[^/]*/nod|$old_opt/review-inbox)( |$)" || true); do
    if ! tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -qE -- '--serve|--type='; then
      echo "$pid"
    fi
  done
}

# The old installer's files, recognised by what it wrote into them.
old_bin_is_ours() { [[ -f "$old_bin" && ! -L "$old_bin" ]] && grep -qF "$old_opt/review-inbox" "$old_bin"; }
old_desktop_is_ours() { [[ -f "$old_desktop" ]] && grep -qx 'StartupWMClass=review-inbox' "$old_desktop"; }
old_unit_is_ours() { [[ -f "$old_unit" ]] && grep -qF '/.local/bin/review-inbox serve' "$old_unit"; }
legacy_link_is_ours() { [[ -L "$old_bin" && "$(readlink "$old_bin")" == nod ]]; }

if [[ "$uninstall" -eq 1 ]]; then
  if [[ -f "$unit" ]]; then
    if have_systemctl; then
      systemctl --user disable --now nod 2>/dev/null || true
    fi
    rm -f "$unit"
    removed "$unit"
    have_systemctl && systemctl --user daemon-reload 2>/dev/null || true
  fi
  for path in "$opt" "$bin" "$desktop"; do
    if [[ -e "$path" || -L "$path" ]]; then
      rm -rf "$path"
      removed "$path"
    fi
  done
  if legacy_link_is_ours; then
    rm -f "$old_bin"
    removed "$old_bin"
  fi
  for size in "${sizes[@]}"; do
    icon="$icons/${size}x${size}/apps/nod.png"
    if [[ -f "$icon" ]]; then
      rm -f "$icon"
      removed "$icon"
    fi
  done
  refresh_caches
  echo "Uninstalled Nod. Data in ~/.config/nod, ~/.local/state/nod and ~/.cache/nod is kept."
  exit 0
fi

if [[ -z "$src" ]]; then
  echo "No AppImage in $root/release. Run: pnpm app:dist" >&2
  exit 1
fi

# The running service holds the install dir open, so note it now and say how to start it again.
service_was_active=0
old_unit_was_enabled=0
replaced_unit=0
if have_systemctl; then
  for name in nod review-inbox; do
    if systemctl --user is-active --quiet "$name" 2>/dev/null; then
      service_was_active=1
    fi
  done
  if old_unit_is_ours && systemctl --user is-enabled --quiet review-inbox 2>/dev/null; then
    old_unit_was_enabled=1
  fi
fi

pids="$(desktop_pids)"
if [[ -n "$pids" ]]; then
  if [[ "$restart" -eq 0 ]]; then
    echo "Nod is running; quit it (Ctrl+Q) or rerun with --restart" >&2
    exit 1
  fi
  # SIGTERM goes through the app's quit path, so Chromium tears down cleanly.
  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null || true
  for _ in $(seq 20); do
    alive=0
    for pid in $pids; do
      [[ -e "/proc/$pid" ]] && alive=1
    done
    [[ "$alive" -eq 0 ]] && break
    sleep 0.5
  done
  if [[ "$alive" -eq 1 ]]; then
    echo "Nod did not quit within 10s; quit it and rerun" >&2
    exit 1
  fi
fi

if [[ "$service_was_active" -eq 1 ]]; then
  systemctl --user stop nod 2>/dev/null || true
fi

# Replace the pre-rename install.
if old_unit_is_ours; then
  if have_systemctl; then
    systemctl --user disable --now review-inbox 2>/dev/null || true
  fi
  rm -f "$old_unit"
  removed "$old_unit (stopped and disabled)"
  replaced_unit=1
fi
if [[ -x "$old_opt/review-inbox" ]]; then
  rm -rf "$old_opt"
  removed "$old_opt"
fi
if old_desktop_is_ours; then
  rm -f "$old_desktop"
  removed "$old_desktop"
  for size in "${sizes[@]}"; do
    icon="$icons/${size}x${size}/apps/review-inbox.png"
    if [[ -f "$icon" ]]; then
      rm -f "$icon"
      removed "$icon"
    fi
  done
fi
if old_bin_is_ours; then
  rm -f "$old_bin"
  removed "$old_bin"
fi

rm -rf "$opt"
mkdir -p "$opt" "$(dirname "$bin")" "$(dirname "$desktop")"
cp "$src" "$appimage"
chmod +x "$appimage"

# `nod serve` runs the headless service; anything else opens the app.
cat > "$bin" <<EOF
#!/usr/bin/env bash
if [[ "\${1:-}" == serve ]]; then
  shift
  set -- --serve "\$@"
fi
exec "$appimage" "\$@"
EOF
chmod +x "$bin"

# The old command keeps working for one release. A file of the user's own at that path is left alone.
if [[ ! -e "$old_bin" && ! -L "$old_bin" ]]; then
  ln -s nod "$old_bin"
  echo "Linked $old_bin to nod for one release"
fi

for size in "${sizes[@]}"; do
  mkdir -p "$icons/${size}x${size}/apps"
  cp "$root/electron/assets/icon-$size.png" "$icons/${size}x${size}/apps/nod.png"
done

cat > "$desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Nod
Comment=Pull request review
Exec=$bin
Icon=nod
StartupWMClass=nod
Categories=Development;
Terminal=false
EOF

refresh_caches

echo "Installed to $opt. Launch with: nod"

if [[ "$install_service" -eq 1 || "$replaced_unit" -eq 1 ]]; then
  mkdir -p "$unit_dir"
  cp "$root/scripts/nod.service" "$unit"
  have_systemctl && systemctl --user daemon-reload 2>/dev/null || true
  echo "Installed the service unit to $unit."
  if [[ "$old_unit_was_enabled" -eq 1 ]]; then
    systemctl --user enable nod
    echo "Enabled nod.service, as review-inbox.service was."
  else
    echo "To start it now and at every login, run:"
    echo "  systemctl --user enable --now nod"
  fi
fi

if [[ "$service_was_active" -eq 1 && -f "$unit" ]]; then
  systemctl --user start nod
  echo "Restarted the Nod service"
  # The desktop app attaches to the service, so give it a moment to listen before relaunching.
  for _ in $(seq 20); do
    curl -fsS -o /dev/null http://127.0.0.1:4477/api/health 2>/dev/null && break
    sleep 0.5
  done
fi

if [[ "$restart" -eq 1 ]]; then
  # Wait for the old instance to release Chromium's single-instance lock. A dead pid means a stale lock.
  for lock in "$HOME/.config/nod/SingletonLock" "$HOME/.config/review-inbox/SingletonLock"; do
    for _ in $(seq 10); do
      [[ -L "$lock" ]] || break
      lock_pid="$(readlink "$lock" | sed 's/.*-//')"
      [[ -e "/proc/$lock_pid" ]] || break
      sleep 0.5
    done
  done
  setsid -f "$bin" >/dev/null 2>&1
  echo "Relaunched Nod"
fi
