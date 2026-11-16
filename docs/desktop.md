# Desktop app

An Electron shell around the same server and front end. It starts the server in-process on a random free port of `127.0.0.1`. It keeps every Host, Origin and token guard and sends desktop notifications. `pnpm start` is unchanged.

## Install and updates

Install from the [releases page](https://github.com/Deetss/nod/releases/latest): download `nod-<version>.AppImage`, make it executable and run it. It installs itself under `~/.local/opt/nod` and puts `nod` on your path. It checks once a day and installs the next release itself, so the copy you downloaded stops being the one you run.

```bash
chmod +x nod-<version>.AppImage
./nod-<version>.AppImage
```

`scripts/install-desktop.sh` does the same: it copies the newest AppImage to `~/.local/opt/nod/nod.AppImage`, writes `~/.local/bin/nod`, a `.desktop` file (`StartupWMClass=nod`) and the icon under `~/.local/share/icons/hicolor/`. AppImages need FUSE 2 (`fuse2` on Arch, `libfuse2` on Debian and Ubuntu). Use `--install-service` for the service (see [Phone](phone.md#service)) and `--restart` to relaunch a running copy.

Only the process that owns the server checks for updates, at start and every hour. Settings > Updates > Check for updates checks now.

- The service installs a new release as soon as it downloads and exits. systemd restarts it on the new build, and open windows and phones reload onto it.
- A window running its own server installs on quit (`Ctrl+Q`).
- A window attached to the service never updates the file itself. It reloads onto the new page, then offers Relaunch to move its own shell onto the new build.
- `[update]` lines in the log show each check and download. For the service, read them with `journalctl --user -t nod`. `-u nod` misses most of them, because Chromium moves the process into its own `app-nod-<pid>.scope`. `pnpm app` and other builds outside an AppImage never check.

The unit's `ExecStop` stops Nod before the AppImage's FUSE daemon. Stopping both at once crashes Nod with SIGBUS and leaves a dead `/tmp/.mount_nod.*` mount. Rerunning the install script refreshes an installed unit. Dead mounts from older units clear with `fusermount -u` or a reboot.

To cut a release, bump `version` in `package.json` in a PR. After it merges, tag `main` (`git tag v0.2.1 && git push origin v0.2.1`). The tag must match the version. It runs `.github/workflows/release.yml`, which tests, builds and publishes `nod-<version>.AppImage` and `nod-<version>.apk`.

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
