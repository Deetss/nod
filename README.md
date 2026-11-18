<p align="center">
  <img src="web/public/icons/icon.svg" alt="Nod" width="96">
</p>

<h1 align="center">Nod</h1>

<p align="center">A local pull request and issue queue for GitHub.</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="tsconfig.json"><img src="https://img.shields.io/badge/TypeScript-blue.svg" alt="TypeScript"></a>
  <a href="pnpm-workspace.yaml"><img src="https://img.shields.io/badge/pnpm-f69220.svg" alt="pnpm"></a>
</p>

<p align="center">
  <img src="docs/images/review.png" alt="The Nod review queue" width="720">
</p>

## Why

- One list of the PRs that need your review, your own, your org's open ones and Dependabot's.
- Issues grouped by who is on them, with inline review comments and a phone view.
- It runs on your machine and uses your own GitHub token.

## Install

### Desktop (Linux x64)

1. Install the GitHub CLI and sign in: `gh auth login`.
   - `repo` is required. It lets Nod read pull requests, issues and org projects.
   - `read:org` is optional. Without it, team review requests are missed; requests to you still match.
   - `project` is optional. Without it, issue Status and Move to In progress are hidden.
   - To get all three at once, sign in with `gh auth login -s project`. Settings > GitHub shows which scopes Nod sees.
2. Download `nod-<version>.AppImage` from [releases](https://github.com/Deetss/nod/releases/latest).
3. Make it executable and run it:

```bash
chmod +x nod-<version>.AppImage
./nod-<version>.AppImage
```

That is all. On the first start it asks which GitHub org to watch; you can skip that and see only your own repos. After the first run it checks for a new release once an hour and installs it itself. It saves settings and other data under `~/.config/nod` and `~/.cache/nod`.

AppImages need FUSE 2 (`fuse2` on Arch, `libfuse2` on Debian and Ubuntu).

### Phone

1. Install Tailscale on the desktop and on the phone.
2. Download `nod-<version>.apk` from the [same releases page](https://github.com/Deetss/nod/releases/latest) and open it on the phone. The app has a setup screen: pair with a QR code, a pair link, or an address. It finds your desktop over Tailscale Serve.
3. Or pair from the desktop: click the phone button in the top bar (or press `P`) to open Pair phone. The app asks you to approve the pairing once.

See [docs/phone.md](docs/phone.md) for pairing, updates and the service.

To keep the phone working while your desktop is off, run Nod on an always-on machine. See [docs/hub.md](docs/hub.md).

## Build from source

You need Node, pnpm, the GitHub CLI and a GitHub login (`gh auth login`).

```
pnpm install
pnpm start
```

Open the URL that `pnpm start` prints (default `http://127.0.0.1:4477`). Set `PORT` to change the port.

To try the app without GitHub calls, run `NOD_FIXTURES=1 pnpm start` or `pnpm start --fixtures`. It serves synthetic data.

The first time Nod starts it asks which GitHub org to watch. You can skip that and see only your own repos.

<p align="center">
  <img src="docs/images/first-run.png" alt="Nod on first run" width="560">
</p>

## Features

- **Review queue.** PRs that need your review, your own, your org's and Dependabot's, with a checks rollup and a "since my review" diff.
- **Inline comments.** Comment on a line, a range or a file. Keep drafts in a pending review, reply to threads and resolve them.
- **Issues.** Groups by who is on them, including a `With <bot>` group for the issues a bot is working on, plus a Check with the bot action.
- **Mentions.** Suggestions as you type `@` in a comment.
- **Closed items.** Look back at closed PRs and issues.
- **Phone.** The same queue on your phone over Tailscale. See [docs/phone.md](docs/phone.md).
- **Settings.** Change the app's options from inside the app.

<p align="center">
  <img src="docs/images/inline-comments.png" alt="A comment composer under a diff line" width="480">
</p>

<p align="center">
  <img src="docs/images/issues-bot.png" alt="The issues list with a With Helper group" width="720">
</p>

<p align="center">
  <img src="docs/images/mentions.png" alt="@mention suggestions above a comment box" width="560">
</p>

<p align="center">
  <img src="docs/images/closed.png" alt="The closed items section with a merged PR selected" width="720">
</p>

<p align="center">
  <img src="docs/images/settings.png" alt="The settings dialog" width="720">
</p>

## Desktop app

Install a desktop app from releases (see [Install](#install)), or release a new build with:

```
pnpm build
pnpm app:dist
scripts/install-desktop.sh
```

It lands as an AppImage in `release/nod-<version>.AppImage` and updates itself from GitHub releases. See [docs/desktop.md](docs/desktop.md) for updates, autostart and uninstall.

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
- [Development](docs/development.md): fixtures, scripts and contributing.

## Security

- The GitHub token stays in server memory and never reaches the browser, logs or disk.
- The server binds to loopback by default.
- Host and Origin guards reject requests from other hosts and origins.

See [docs/security.md](docs/security.md) for the rest.

## Contributing

Run `pnpm typecheck && pnpm test` before you open a pull request. `scripts/oss-gate.sh` runs the release gate. For a large change, open an issue first.

## License

MIT. Copyright Deetss Labs. See [LICENSE](LICENSE).
