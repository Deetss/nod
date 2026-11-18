# Phone access

Opens the inbox on your phone over Tailscale Serve. The laptop must be awake and the app running.

## Setup

1. Turn on Settings > Phone access in the desktop app (or set `NOD_PHONE=1` for `pnpm start`, or run the [service](#service)), then restart. The server uses fixed port 4477 and reads the tailnet name and your login from `tailscale status --json`. If tailscale is missing, phone access stays off and one line is logged.
2. Run once: `tailscale serve --bg --https=443 http://127.0.0.1:4477`. The Android app verifies the host on the default port, so links on any other port open in Chrome. To advertise another port, set `NOD_PHONE_HTTPS_PORT` (for example `8443`) and serve that port instead.
3. In the desktop app, click the phone button in the top bar (or press `P`) to open Pair phone. The dialog shows a QR code, the pairing link with a Copy button, a countdown, and the paired phones.
4. Scan the code with the phone camera. The phone is paired and opens the inbox. Add to Home screen from the browser menu.

See [Android](android.md) to install the app first, or download `nod-<version>.apk` from the [releases page](https://github.com/Deetss/nod/releases/latest).

## Pairing

Pairing works like `orca serve --mobile-pairing`. The link is `https://<tailnet host>/pair#code=<code>`.

- The code is single use and expires after 10 minutes. A new code replaces the old one.
- The phone page trades the code (`POST /api/pair`, 5 tries a minute) for a device key: 32 random bytes, kept on the phone in an `HttpOnly; Secure; SameSite=Lax` cookie. Chrome withholds Strict cookies when another app launches the phone app, so the cookie is not Strict.
- The server stores only a SHA-256 hash of each key, with a name (taken from the user agent; use Rename), the created time and the last-seen time, in `~/.local/state/nod/devices.json` (mode 600, written atomically).
- Revoke deletes the hash, so that phone's key stops working at once.
- Pairing, revoking and tailnet requests with no or an unknown device cookie are logged to the journal. Logs never hold keys or hashes.

## Access rules

- The server accepts the tailnet host only when phone access is on, and only when `Tailscale-User-Login` (added by Tailscale Serve) equals your login.
- Every tailnet request needs a valid device key. A phone without one gets a plain "Not paired" page (HTTP 401) with no data and no session token. Only `/pair`, `POST /api/pair`, the manifest and the icons answer without a key.
- Mutations also accept `Origin: https://<tailnet host>`, the same host on `:8443` (older bookmarks) or on `NOD_PHONE_HTTPS_PORT`. They still need the session token, which is injected into the HTML served after the device key checks out.
- Any request that carries `Tailscale-User-Login` must match your login, even with a loopback Host (Tailscale Serve may forward that way). It is rejected when phone access is off.
- Creating codes, listing, renaming and revoking devices, and Update phones are loopback only. Requests without the header on loopback are unchanged.

## Layout

The phone page is one scrolling list per tab, and each PR or issue opens as a full-screen sheet. While you scroll, the top header collapses into a narrow bar and expands again when you come back to the top. On PRs and Issues, a search pill and a filter button float above the tab bar. They hide while you scroll down and come back on any scroll up. The filter button opens a sheet of section checkboxes: a PR or issue shows if it is in any ticked section, and the button shows how many are on. Search opens a field on top of the keyboard with one flat list of matches. Actions open as bottom sheets: dispatch all findings under a PR shows the ticked findings, a session or a new worktree, and one editable prompt.

## Updates

Every `vite build` gets a build id: the git short sha plus the build time (for example `8152277-2026-11-11T17:12:03Z`). Vite injects it into the page and writes it to `dist/web/build.json`. The server reports the id of the build it serves in `/api/health` and as the first `build` event on `/api/events`.

- When a page sees a different id, it shows "Nod updated" and reloads, keeping the PR or issue it had open (`/?open=pr/<repo>/<number>`). The desktop window does the same.
- A tab reloads at most once per build id, tracked in sessionStorage, and never while a comment box holds unsent text. Then it shows "Update ready, tap to reload" instead.
- Settings > Pair phone has an Update phones button beside the paired phones. Phones with the page open reload. Paired phones with notifications on but no open page get a Web Push, "Nod updated", that opens `/`. A phone whose app is older than the published APK gets "App update available" instead. The button reports what happened, for example "Reloaded 1 phone, notified 1".
- Send test notification, below the paired phones, shows "Nod test" on this desktop (even while focused or muted) and pushes it to every subscribed phone through `POST /api/notifications/test` (loopback only, session token required). It lists one line per target, such as `Desktop: sent`, `Pixel: sent` or `Pixel: failed (HTTP 410, subscription removed)`. A 404 or 410 means the phone's subscription is gone. Open Nod on the phone, which sends its current subscription on load, or turn its notifications off and on.
- Every notification logs one line, `[notify] <kind> <target> -> 1 of 1 phone` or `-> desktop`. Every failed send logs one warn line with the device id and HTTP status. Lines never carry endpoints, keys or notification text. Read them with `journalctl --user -t nod`. `-u nod` misses most of them.

## Service

`nod serve` runs the server with no window, on port 4477 with phone access on. It prints the bound address, the advertised address and the pairing status. `pnpm serve` does the same for the browser build.

On a machine with only the service, `nod pair` prints a new pairing link and its QR code, and `nod settings` shows the watched orgs and the involved switch. `nod settings orgs <org>...` replaces the orgs (no names clears them) and `nod settings involved on|off` sets the switch. Both talk to the service over loopback with the session token, like `nod update`, and a settings change restarts the service.

```
scripts/install-desktop.sh --install-service
systemctl --user enable --now nod
```

The first line installs the app and copies `scripts/nod.service` (a systemd user unit, `Restart=always`, `RestartSec=10`, so a self-update comes back on the new build) to `~/.config/systemd/user/`. The second is printed for you to run. The unit needs `gh` and `tailscale` on its `PATH` and a GitHub login that works without a desktop keyring prompt. To run the service on an always-on machine for your phone, see [Hub and spokes](hub.md).

The service installs new releases itself (see [Desktop updates](desktop.md#updates)). After a local `pnpm app:dist`, `scripts/install-desktop.sh --restart` restarts a running service. The phones reload onto the new build when their event stream reconnects. Update phones reaches the ones that were not open.

When the desktop window opens, it checks `http://127.0.0.1:4477/api/health`. If the service answers, the window connects to it and starts no second server. Settings > Pair phone then manages the service's devices. Otherwise the app starts its own server. The service reads no desktop settings, and phone access is always on for it.

On the phone, a PR or issue opens as a full-screen sheet. Swipe down on the top strip, tap the round back arrow at top left, or use the Android back gesture to close one level at a time. While a sheet's request runs (Sending…), all three wait and the back arrow is dashed. Bottom sheets (actions, bot split, edit title, notifications, sub-issue rows) also close by dragging their handle and title down past 120px; centred confirm dialogs close with Cancel or Back only. Pulling a list down from the top past 72px refreshes it, shown by a disc under the header and a pill beside it that says what is happening. While GitHub's rate limit holds, the pull sends no request and says so. The lists carry no sync line. The ··· menu starts with a Connections row, marked like the desktop chip. It opens a bottom sheet that draws the path this phone uses (This phone, Tailscale, Hub, GitHub, Orca on the hub) as a rail of marks and links, then the hub's other devices with their last-seen time and push state. It is read only: Copy copies the hub URL, and rename, revoke and pairing stay on the desktop. Close, Check again, Back or a drag past 120px close it. A broken connection also lights the dot on ···. Below Connections the menu shows the sync status (when it synced, the API budget left, when it resets) and a Sync now button that keeps the menu open. A dot on ··· means a sync problem: no sync for 15 minutes, under 10% of the API budget left, a failed sync, or the rate limit. Approve, resolve and dispatch give a short vibration on Android after a success, as do the pull and swipe thresholds. Admin merge stays hidden until the app has a source for admin rights. On your own PR, when a ruleset lets you skip the required review, the Approve slot becomes a Merge (bypass) pill and the action sheet drops its Admin merge row. The pill opens a confirm strip over the bar with Cancel and Merge now (Android back cancels). While it runs the pill shows a spinner and Comment is disabled. A refusal shows GitHub's text in a strip above the pills; tap it to clear, or tap the pill to retry. A draft PR you authored lists Ready for review in its action sheet. Dispatch with Orca shows in an issue's action sheet when the server reports Orca and the issue's repo. It asks to confirm before it runs with the default agent and prompt.
