# Settings

Org-specific values live in one JSON file, `app-settings.json`.

- The desktop app reads it from Electron's userData folder.
- Browser and headless mode (`pnpm start`, the service) read `~/.config/nod/app-settings.json`, the same file Electron uses on Linux. `XDG_CONFIG_HOME` is honoured.
- Every key is optional. A missing file means the defaults below.
- An invalid file logs one line and falls back to the defaults.
- Restart to apply changes. The page gets the loaded values from `/api/settings`.

| Key | Default | Meaning |
| --- | --- | --- |
| `org` | `"acme-co"` | GitHub org login. Drives searches, API paths, links and UI text. |
| `includeInvolved` | `true` | Also show PRs and issues you are involved in, in any repo, beside the orgs. Searches become `(org:A OR org:B OR involves:@me)`. With no orgs it has no effect, since that search already is `involves:@me`. With it on, up to 4 orgs fit GitHub's five-operator search limit. |
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
| `bot.login` | `""` | The bot's GitHub login as GraphQL names it, without `[bot]` (for example `helper-bot`). Empty means no one is the bot, so its retry and split comments stay hidden. |
| `reviewer.login` | `""` | GitHub login of the review bot whose threads count as findings (case and `[bot]` ignored). Empty hides finding cards and actions. |
| `reviewer.threadMarker` | `""` | The string a finding thread's first comment starts with, before its `**Blocker**:` or `**Major**:` severity prefix. Empty hides finding cards and actions. |
| `bot.marker` | `"bot"` | The word in the bot's `<!-- {marker}:retry -->` and `<!-- {marker}:split ... -->` comments (for example `helper-bot`). |

Related: [Orca](orca.md) for the Orca settings, [Issues](issues.md) for the bot and status features.
