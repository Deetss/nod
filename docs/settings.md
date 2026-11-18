# Settings

Org-specific values live in one JSON file, `app-settings.json`.

- The desktop app reads it from Electron's userData folder.
- Browser and headless mode (`pnpm start`, the service) read `~/.config/nod/app-settings.json`, the same file Electron uses on Linux. `XDG_CONFIG_HOME` is honoured.
- Every key is optional. A missing file means the defaults below.
- An invalid file logs one line and falls back to the defaults.
- Changes are written from the app and the server restarts. The page reloads onto the new values. Over the tailnet only an admin device may write them.


| Key | Default | Meaning |
| --- | --- | --- |
| `orgs` | `[]` | GitHub owners (org or user) to watch, as logins. An empty list means only your own repos. An older file that used `org` loads as one entry here. |
| `includeInvolved` | `true` | Also show PRs and issues you are involved in, in any repo, beside the orgs. Searches become `(org:A OR org:B OR involves:@me)`. With no orgs it has no effect, since that search already is `involves:@me`. With it on, up to 4 orgs fit GitHub's five-operator search limit; without it, 5 fit. More than that is invalid. |
| `releaseMerge.base` | `"main"` | Base branch of the release PR. |
| `releaseMerge.head` | `"staging"` | Head branch of the release PR. |
| `releaseMerge.titleContains` | `"release staging to main"` | Case-insensitive title marker. A PR matching base, head and title merges with a merge commit. Every other PR squashes and deletes its branch. |
| `project.number` | `1` | Org project number holding the Status field. A top-level `projectNumber` from older files still applies when this is unset. |
| `project.statusField` | `"Status"` | Name of the single-select field. |
| `project.options.backlog` | `"Backlog"` | Option names, matched by name. The five names must differ from each other (otherwise the file is invalid) and all exist in the project, or the status feature stays hidden. |
| `project.options.ready` | `"Ready"` | Where Stop work puts an issue. |
| `project.options.inProgress` | `"In progress"` | Where Start work puts an issue. |
| `project.options.inReview` | `"In review"` | Option name for In review. |
| `project.options.done` | `"Done"` | Option name for Done. |
| `orcaAgents` | `["claude", "codex", "gemini", "opencode"]` | Agent ids the Orca dispatch accepts. |
| `bot.enabled` | `false` | On when a comment-driven bot fixes checks and review comments, and picks up issues that carry its label. |
| `bot.name` | `"Bot"` | The bot's display name. |
| `bot.command` | `"/bot"` | The comment the bot acts on (a slash and one lowercase word). |
| `bot.label` | `"bot"` | The label the bot picks up. It is created on first use. |
| `bot.labelColor` | `"1f6feb"` | The bot label's colour, as six hex digits. |
| `bot.login` | `""` | The bot's GitHub login as GraphQL names it, without `[bot]` (for example `helper-bot`). Empty means no one is the bot, so its retry and split comments stay hidden. |
| `bot.marker` | `"bot"` | The word in the bot's `<!-- {marker}:retry -->` and `<!-- {marker}:split ... -->` comments. |
| `reviewer.login` | `""` | GitHub login of the review bot whose threads count as findings (case and `[bot]` ignored). Empty hides finding cards and actions. |
| `reviewer.threadMarker` | `""` | The string a finding thread's first comment starts with, before its `**Blocker**:` or `**Major**:` severity prefix. Empty hides finding cards and actions. |
| `push.contact` | `"mailto:admin@example.com"` | The Web Push contact used as the VAPID subject. A `mailto:` or `https:` URL push services can reach. |
| `android.packageId` | `"io.github.reviewinbox"` | The Android app's package id: the APK's application id and the Digital Asset Links target. |

## Hub

Settings > Hub is the second section.

- Hub URL is a desktop setting, kept in `hub.json` in the userData folder, not in `app-settings.json`. It must be an `https://` address with no path, user name or password. Check validates it, asks once to confirm a new hub, saves it and shows `Reachable · paired as <role> · v<version>`, `Reachable · not paired` or `Unreachable`. See [Desktop](desktop.md#hub-url).
- Pair this desktop shows only while the hub answers and this desktop is not paired.
- Orca hosts sets the default host and a host per repo seen in the inbox. Each change saves at once through `POST /api/orca/prefs`; the pane reads `GET /api/orca/hosts` and `GET /api/orca/host-prefs`. On the hub they are saved on the hub. A desktop-role device sees them read only. Without a Hub URL the section shows only when this machine's Orca has paired environments.
- Only an admin device may save settings on the hub. A page from the hub cannot change the Hub URL.

Related: [Orca](orca.md) for the Orca settings, [Issues](issues.md) for the bot and status features, [Phone](phone.md) for the Android package id.
