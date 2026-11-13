# Security

## Token

The server reads your GitHub token once at startup by running `gh auth token`. The token stays in server memory and never reaches the browser, logs or disk. Run `gh auth login` first if needed.

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
- Android keystore files stay in `~/.config/nod/` and are never printed. See [Android](android.md).
- Desktop links open only `https://github.com/...` in the default browser. See [Desktop](desktop.md).
