# Desktop app

An Electron shell around the same server and front end. It starts the server in-process on a random free port of `127.0.0.1`. It keeps every Host, Origin and token guard and sends desktop notifications. `pnpm start` is unchanged.

## Commands

```
pnpm app            # build and run in dev
pnpm app:dist       # AppImage in release/nod-<version>.AppImage
scripts/install-desktop.sh --restart   # installs it; quits and relaunches a running copy
nod                 # or launch "Nod" from the app launcher
```

The install script copies the newest AppImage to `~/.local/opt/nod/nod.AppImage`, writes `~/.local/bin/nod`, a `.desktop` file (`StartupWMClass=nod`) and the icon under `~/.local/share/icons/hicolor/`. AppImages need FUSE 2 (`fuse2` on Arch, `libfuse2` on Debian and Ubuntu).

## Updates

After the first install, Nod updates itself from [GitHub releases](https://github.com/Deetss/nod/releases). Only the process that owns the server checks, at start and every 6 hours.

- The service installs a new release as soon as it downloads and exits. systemd restarts it on the new build, and open windows and phones reload onto it.
- A window running its own server installs on quit (`Ctrl+Q`).
- A window attached to the service never updates the file itself. It picks up the new page when the service restarts, and the new shell at its next launch.
- `[update]` lines in the log show each check and download. `pnpm app` and other builds outside an AppImage never check.

To cut a release, bump `version` in `package.json` in a PR. After it merges, tag `main` (`git tag v0.2.1 && git push origin v0.2.1`). The tag must match the version. It runs `.github/workflows/release.yml`, which tests, builds and publishes the AppImage and `latest-linux.yml`.

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
