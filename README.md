# Nod

A local pull request and issue queue for GitHub.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue.svg)](tsconfig.json)
[![pnpm](https://img.shields.io/badge/pnpm-f69220.svg)](pnpm-workspace.yaml)

<p align="center">
  <img src="docs/images/review.png" alt="The Nod review queue" width="720">
</p>

## Why

- One list of the PRs that need your review, your own, your org's open ones and Dependabot's.
- Issues grouped by who is on them, with inline review comments and a phone view.
- It runs on your machine and uses your own GitHub token.

## Features

Review queue and diff. A checks rollup per PR and a diff with a "since my review" mode. The hero image above shows it.

Inline comments. Line, range and file comments, drafts and a pending review, and threads with reply and resolve.

<img src="docs/images/inline-comments.png" alt="Inline review comments in a thread" width="720">

Issues. Issues in groups, including a "With <bot>" group, and a Check with the bot action.

<img src="docs/images/issues-bot.png" alt="The issues list with a bot group" width="720">

Mentions. Suggestions as you type @ in a comment.

<img src="docs/images/mentions.png" alt="@mention suggestions" width="720">

Closed. Look back at closed PRs and issues.

<img src="docs/images/closed.png" alt="Closed PRs and issues" width="720">

Phone. The same queue on your phone over Tailscale. See [docs/phone.md](docs/phone.md).

Settings. Change the app's options from inside the app.

<img src="docs/images/settings.png" alt="The Nod settings panel" width="720">

First run. What you see the first time Nod starts.

<img src="docs/images/first-run.png" alt="Nod on first run" width="720">

## Quick start

You need Node, pnpm, and a GitHub login (`gh auth login`).

```
pnpm install
pnpm start
```

Open the URL that `pnpm start` prints (default `http://127.0.0.1:4477`). Set `PORT` to change the port.

To try the app without GitHub calls, run `NOD_FIXTURES=1 pnpm start` or `pnpm start --fixtures`. It serves synthetic data.

## Desktop app

```
pnpm app:dist
scripts/install-desktop.sh
nod
```

See [docs/desktop.md](docs/desktop.md) for updates, autostart and uninstall.

## Settings

Org-specific values live in `app-settings.json`. Every key is optional, and a missing file means the defaults.

See [docs/settings.md](docs/settings.md) for the keys and the file location.

## More

- [Keys](docs/keys.md): keyboard shortcuts.
- [Phone](docs/phone.md): phone access, pairing, updates and the service.
- [Android](docs/android.md): the Android app.
- [Orca](docs/orca.md): Orca agent sessions.
- [Security](docs/security.md): tokens, binding and request guards.
- [API comments](docs/api-comments.md): the comments API.
- [Notifications](docs/notifications.md): desktop and phone notifications.
- [Desktop](docs/desktop.md): the desktop app.
- [Issues](docs/issues.md): the Issues view.
- [Behaviour](docs/behaviour.md): polling, caching and rate limits.
- [Development](docs/development.md): fixtures, scripts and the design docs.

## Security

- The GitHub token stays in server memory and never reaches the browser, logs or disk.
- The server binds to loopback by default.
- Host and Origin guards reject requests from other hosts and origins.

See [docs/security.md](docs/security.md) for the rest.

## Contributing

Run `pnpm typecheck && pnpm test` before you open a pull request. `scripts/oss-gate.sh` runs the release gate. For a large change, open an issue first.

## License

MIT. Copyright Deetss Labs. See [LICENSE](LICENSE).
