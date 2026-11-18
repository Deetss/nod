# Desktop app

An Electron shell around the same server and front end. It starts the server in-process on a random free port of `127.0.0.1`, or shows a [hub](hub.md) when a Hub URL is set. It keeps every Host, Origin and token guard and sends desktop notifications. `pnpm start` is unchanged.

## Install and updates

Install from the [releases page](https://github.com/Deetss/nod/releases/latest): download `nod-<version>.AppImage`, make it executable and run it. It installs itself under `~/.local/opt/nod` and puts `nod` on your path. It installs each new release itself, so the copy you downloaded stops being the one you run.

```bash
chmod +x nod-<version>.AppImage
./nod-<version>.AppImage
```

`scripts/install-desktop.sh` does the same: it copies the newest AppImage to `~/.local/opt/nod/nod.AppImage`, writes `~/.local/bin/nod`, a `.desktop` file (`StartupWMClass=nod`) and the icon under `~/.local/share/icons/hicolor/`. AppImages need FUSE 2 (`fuse2` on Arch, `libfuse2` on Debian and Ubuntu). Use `--install-service` for the service (see [Phone](phone.md#service)) and `--restart` to relaunch a running copy.

Only the process that owns the server checks for updates, at start, every hour, and when a window or phone opens Nod (at most once every 10 minutes). Settings > Updates > Check for updates checks now, and so does `nod update` in a terminal, which asks the server on port 4477 and prints the answer.

- The service installs a new release as soon as it downloads and exits. systemd restarts it on the new build, and open windows and phones reload onto it.
- A window running its own server installs on quit (`Ctrl+Q`).
- A window attached to the service never updates the file itself. It reloads onto the new page, then offers Relaunch to move its own shell onto the new build.
- `[update]` lines in the log show each check and download. For the service, read them with `journalctl --user -t nod`. `-u nod` misses most of them, because Chromium moves the process into its own `app-nod-<pid>.scope`. `pnpm app` and other builds outside an AppImage never check.

The unit's `ExecStop` stops Nod before the AppImage's FUSE daemon. Stopping both at once crashes Nod with SIGBUS and leaves a dead `/tmp/.mount_nod.*` mount. Rerunning the install script refreshes an installed unit. Dead mounts from older units clear with `fusermount -u` or a reboot.

Every merge to `main` that changes more than docs and Markdown ships a release. `.github/workflows/release.yml` bumps the patch of the newest `v*` tag, tests, tags, then publishes `nod-<version>.AppImage`, `latest-linux.yml` and `nod-<version>.apk`. For a minor or major release, raise `version` in `package.json` in the PR; the workflow uses it when it is higher. Actions > Release > Run workflow releases by hand.

The window class is `nod`, so Hyprland window rules can match it. Fixtures work too: `NOD_FIXTURES=1 nod`.

## Window behaviour

- Closing the window hides it, and polling continues. `Ctrl+Q` quits. A second launch shows the existing window.
- Window size and position persist in the Electron userData folder (`~/.config/nod`).
- The window stays on its own origin: this machine's server, or the hub. Redirects elsewhere and webviews are blocked, and only that origin may be granted permissions such as clipboard writes. Only `https://github.com/...` links open, in the default browser.
- `nod --smoke` loads the page in a hidden window, prints `SMOKE OK` and exits 0.

## Hub URL

Settings > Hub holds the Hub URL, an `https://` address with no path, saved in `hub.json` in the userData folder. Empty, the default, changes nothing.

- At start, the window asks the hub for `GET /api/devices/me` with the device cookie from its persistent session. When the hub answers with a role, the window loads the hub and starts no server. Otherwise it starts its own server as today and logs one `[hub]` line.
- Saving a new Hub URL, and opening the hub after pairing, each ask in a dialog that names the URL.
- Pair this desktop takes the link or code from `nod pair --admin` on the hub. It opens the hub's `/pair` page in a small window on the same session, so the device cookie lands where the main window reads it. Pairing counts only when the hub then reports this desktop's role.
- A page from the hub may call only the notification, notification switch, build and relaunch channels of the preload. Only this machine's own server page may check, save or pair a hub. To change or clear the Hub URL while the window shows the hub, start once with `nod --local`.
- On the hub there is no local server, so the window updates its own AppImage on quit.

`nod pair` prints a pairing link and its QR code from the server on port 4477: a phone link by default, `--admin` or `--desktop` for a desktop. It never prints the session token.


## Autostart and uninstall


Autostart on Hyprland: add `exec-once = nod` to your Hyprland config.

Uninstall with `scripts/install-desktop.sh --uninstall`. It removes the app, the launcher, the `.desktop` file, the icons and the service unit, and keeps the data folders.

Notifications are described in [Notifications](notifications.md). The service and phone access are in [Phone](phone.md).
