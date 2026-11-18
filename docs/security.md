# Security

## Token

The server reads your GitHub token by running `gh auth token`, at startup and again on Check again (Settings > GitHub, `POST /api/connection/check`, a mutating route). Check again swaps the token in memory without a restart; requests in flight finish on the old one. The token stays in server memory and never reaches the browser, logs or disk. The web app only gets the connection state, the login, the scope list and the check time.

Without a token (gh missing or not logged in) the server still starts, syncs nothing, and Settings > GitHub shows how to connect. When `GH_TOKEN` or `GITHUB_TOKEN` is set, `gh auth token` prints that value, and Settings says so.

Scopes come from GitHub's `X-OAuth-Scopes` response header:

| Scope | Need | Without it |
|---|---|---|
| `repo` | Required | Sync pauses and actions are off; the saved lists stay. |
| `read:org` | Optional | Team review requests are missed; user requests still match. |
| `project` | Optional | Issue queries leave out `projectItems`; Status and Move to In progress are hidden. |

Fine-grained and app tokens send no scope header. Nod then syncs and turns Status off on the first refused `projectItems`. Log in with `gh auth login -s project`; `gh` adds `repo`, `read:org` and `gist` itself.

## Binding and host guard

The server binds `127.0.0.1` and rejects any request whose Host is not `127.0.0.1`, `localhost` or `*.localhost`. Any port is allowed, so Orca's port proxy works. Browsers resolve `*.localhost` to loopback.

## Session token and Origin

Mutating routes need two things:

- A session token, injected into the served HTML and sent as `x-nod-token`. This is the main CSRF guard.
- An `Origin` header on one of the allowed names.

The token persists in `~/.local/state/nod/session-token` (mode 600, written atomically), so a page left open survives a restart. Fixture mode uses a fresh in-memory token. If the token still changes, the page re-fetches `/`, reads the new token and retries the write once.

Each 403 from the host, origin and token checks logs one line (reason and path only) at most once a minute.

## Other rules

- Issue images load through `GET /api/image?u=<url>`. The server rejects other hosts and accepts only png, jpeg, gif or webp responses, capped at 10 MB. See [Issues](issues.md).
- Issue and PR HTML goes through DOMPurify before insertion.
- Phone access adds device keys and a Tailscale user check. See [Phone](phone.md).
- `GET /api/connections` sits behind the same guards. Loopback gets every device with its id. A tailnet device gets its own row plus every device's name, role, last-seen time and push state, with no ids; an admin device reads ids from the admin-only device list. No answer carries a key, key hash, push subscription or the session token. Tailscale Serve state comes from `tailscale serve status --json` (2 s timeout, cached 20 s); a missing `tailscale` reads as off.
- Each device has a role. Device admin routes and the settings write accept loopback and `admin` devices only, after the session token and Origin checks. Phone and desktop keys get 403. Responses never carry a key or a hash. See [Device roles](hub.md#device-roles).
- A desktop with a Hub URL keeps its device cookie in its persistent Electron session, loads only the hub's origin, and gives hub pages no way to change or pair the hub. See [Desktop](desktop.md#hub-url).
- `nod pair` prints the pairing link, its QR code and its expiry, never the session token.
- Every HTML answer carries `Content-Security-Policy: frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`, so no other site can frame Nod. Same origin stays allowed for the design capture harness.
- Android keystore files stay in `~/.config/nod/` and are never printed. See [Android](android.md).
- Desktop links open only `https://github.com/...` in the default browser. See [Desktop](desktop.md).
