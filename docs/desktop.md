# Desktop app

An Electron shell around the same server and front end. It starts the server in-process on a random free port of `127.0.0.1`. It keeps every Host, Origin and token guard and sends desktop notifications. `pnpm start` is unchanged.

## Commands

```
pnpm app            # build and run in dev
pnpm app:dist       # unpacked build in release/linux-unpacked
scripts/install-desktop.sh --restart   # updates: quits and relaunches a running copy
nod                 # or launch "Nod" from the app launcher
```

The install script copies the build to `~/.local/opt/nod`, writes `~/.local/bin/nod`, a `.desktop` file (`StartupWMClass=nod`) and the icon under `~/.local/share/icons/hicolor/`. Re-run it after each `pnpm app:dist`.

The window class is `nod`, so Hyprland window rules can match it. Fixtures work too: `NOD_FIXTURES=1 nod`.

## Window behaviour

- Closing the window hides it, and polling continues. `Ctrl+Q` quits. A second launch shows the existing window.
- Window size and position persist in the Electron userData folder (`~/.config/nod`).
- Only `https://github.com/...` links open, in the default browser.
- `nod --smoke` loads the page in a hidden window, prints `SMOKE OK` and exits 0.

## Autostart and uninstall

Autostart on Hyprland: add `exec-once = nod` to your Hyprland config.

Uninstall with `scripts/install-desktop.sh --uninstall`. It removes the app, the launcher, the `.desktop` file, the icons and the service unit, and keeps the data folders.

Notifications are described in [Notifications](notifications.md). The service and phone access are in [Phone](phone.md).
