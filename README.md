# Nod

Nod is a local pull request queue for the GitHub org `acme-co`. It lists the pull requests that need your review, your own, the org's open ones and Dependabot's, with a checks rollup, a file tree with GitHub's viewed state, and a diff with a "since my review" mode. It reads from the free GitHub API and also makes write calls: merge, ready, review, comment, and re-run of a workflow run. Re-run needs the token's `workflow` scope.

## Start

```
pnpm install
pnpm start
```

`pnpm start` builds the front end on the first run, then prints the URL (default `http://127.0.0.1:4477`). Set `PORT` to change the port. If the port is taken the process exits with a message.

`scripts/oss-gate.sh` runs the release gate.

The server reads your token once at startup by running `gh auth token`. It stays in server memory and never reaches the browser, logs or disk. Run `gh auth login` first if needed.

## Desktop app

An Electron shell around the same server and front end. It starts the server in-process on a random free port of `127.0.0.1`, keeps every Host, Origin and token guard, and sends desktop notifications. `pnpm start` is unchanged.

```
pnpm app            # build and run in dev
pnpm app:dist       # unpacked build in release/linux-unpacked
scripts/install-desktop.sh --restart   # updates: quits and relaunches a running copy
nod                 # or launch "Nod" from the app launcher
```

The install script copies the build to `~/.local/opt/nod`, writes `~/.local/bin/nod`, a `.desktop` file (`StartupWMClass=nod`) and the icon under `~/.local/share/icons/hicolor/`. Re-run it after each `pnpm app:dist`. The window class is `nod`, so Hyprland window rules can match it. Fixtures work too: `NOD_FIXTURES=1 nod`.

- Closing the window hides it and polling continues. `Ctrl+Q` quits. A second launch shows the existing window.
- Window size and position persist in the Electron userData folder (`~/.config/nod`).
- Only `https://github.com/...` links open, in the default browser.
- `nod --smoke` loads the page in a hidden window, prints `SMOKE OK` and exits 0.

Autostart on Hyprland: add `exec-once = nod` to your Hyprland config.

Uninstall with `scripts/install-desktop.sh --uninstall`. It removes the app, the launcher, the `.desktop` file, the icons and the service unit, and keeps the data folders.

### Renamed from review-inbox

The app was called review-inbox. For one release:

- On first start, Nod copies `~/.local/state/review-inbox`, `~/.config/review-inbox` (with the Android keystore at mode 600) and `~/.cache/review-inbox` to the `nod` folders, and leaves a `MOVED-TO-nod` note in each old folder. It never deletes the old data. A folder that already exists under the new name is left alone.
- The install script removes the old install it wrote (`~/.local/opt/review-inbox`, the `.desktop` file, the icons and the launcher), stops and disables `review-inbox.service`, installs `nod.service`, and prints each path it removed. `~/.local/bin/review-inbox` becomes a symlink to `nod`.
- `REVIEW_INBOX_*` environment variables still work, with one deprecation line each. Use `NOD_*`.
- The Android package changed, so install the new app and pair the phone again. `assetlinks.json` lists both packages.

### Notifications

The front end compares each poll with the one before (`shared/notify-rules.ts`) and asks the shell to notify for:

1. a PR newly entering Needs my review (user or team request),
2. one of your PRs getting a new review (approved, changes requested, first comment),
3. CI on one of your PRs turning to failing (while your PR's CI runs, each poll re-reads your open PRs, because a check finishing does not move a PR's updated time),
4. a PR you authored or are assigned to merging or closing, once per PR, auto-merge and bot PRs included (only when it closed within the last hour, so a comment on an old PR is not news),
5. an issue newly assigned to you,
6. an issue that newly mentions you.

The first sync after start never notifies. More than 3 in one poll become one summary. Nothing shows while the window is focused. Clicking a notification focuses the window and selects the PR or issue. The bell menu also has Send test notification, which fires a notification after 5 seconds so you can switch to another window first. A trigger added after your settings were saved starts with its default, and your other choices stay. The bell in the top bar (desktop app only) toggles each trigger or mutes all; settings persist in the userData folder. The preload exposes only `window.nod` with `notify`, `onOpen`, `getSettings` and `setSettings`, and the main process validates every payload (`shared/notify-payload.ts`).

## Fixture mode

```
pnpm start --fixtures        # or NOD_FIXTURES=1
```

Serves synthetic data, makes no GitHub calls, and turns every action (review, merge, viewed) into a logged no-op. It logs each call it would make (`[fixtures] would call InboxSync:full`, `Detail`, `Diff`). Add `?state=<empty|loading|error|ratelimit|allviewed|interdiff|error422|ci-live>` to the URL to reach each PR state, or `issues-empty|issues-loading|issues-error|issues-bulk|issues-new|issues-close|issues-labels|issues-sub-create|issues-sub-add|issues-sub-remove` for the Issues view. Fixture acme-banner #12 is a parent with five children (open, completed and not planned, one in acme-api), #17 is one of its children, acme-banner #23 has long titles and a parent, and acme-api #412 has no sub-issues; `?open=issue/acme-banner/17` opens one directly. Add `?view=issues` to open the Issues view and `?theme=light` (or `dark`) to force a theme. `?state=ci-live` makes acme-web #1343's checks run to completion over about 30 s. Issue writes in fixture mode log what they would do and change an in-memory copy only.

## Issues

The PRs / Issues switch in the top bar (or `g p` / `g i`) changes the view. The inactive side shows its unseen count, and the choice is remembered. The Issues view is a list, a thread and a metadata sidebar.

- Groups are In progress (Status In progress and assigned to you), With bot (open issues carrying the bot's label; only when `bot.enabled` is on and `bot.label` is set, titled `With <bot.name>`), Assigned to me, Created by me, Mentioned, Untriaged (no labels and no assignees) and All open. An issue sits in the first of the groups that fits it, so their counts add up, and All open lists every issue. Repo, label, Status, text and sort run in the browser only.
- Project Status: the acme-co project "Dev" Status field (Backlog, Ready, In progress, In review, Done) shows as a chip on each row that is not Backlog and as a Status row in the sidebar. `s` opens the five-option dropdown. `S` toggles Start work (assign you if needed, add the issue to the project if missing, set In progress) and Stop work (set Ready, keep the assignee), with no confirm and a toast. A Status filter sits next to Repo and Label. The project, field and option ids are resolved by name at start, cached in `~/.cache/nod/project.json` and refreshed on the 15-minute sweep. If the project, field or any option name is missing, the feature hides and one line is logged. Fixture mode gives issues statuses and changes the in-memory copy. The phone action sheet has the same Status control.
- Data: one paginated search of open org issues, one search of open issues that mention you, and one GraphQL query per opened issue (body, comments, label and assign events, linked PRs). Detail is cached by issue id and `updatedAt`, so reopening an unchanged issue costs no request. Repo labels, milestones and assignable users load when a picker first opens for that repo and are cached on disk for 1 hour.
- Issue HTML comes from GitHub already rendered. It goes through DOMPurify before insertion, and links open in a new tab. The same applies to PR descriptions and thread comments.
- Images in that HTML load through `GET /api/image?u=<url>`, because the browser has no GitHub session for private repos. The sanitizer rewrites `img` sources on an allowlist (https `github.com` blob/raw links for the configured org, `raw.githubusercontent.com`, `user-images` and `private-user-images.githubusercontent.com`, `github.com/user-attachments/assets/`). The server rejects anything else with 400, reads repo files through the contents API with its own token, follows redirects only to GitHub image hosts, and sends the token to no host but GitHub. Responses must sniff as png, jpeg, gif or webp (never svg), are capped at 10 MB, and carry `nosniff`. Fixture mode serves a synthetic image.
- Writes (comment, close as completed or not planned, reopen, labels, assignees, milestone, title, new issue) are GraphQL mutations behind the same token and Origin guard as PR writes. Bulk labels, assign and close send one mutation per issue, three at a time. Failures are listed and successes stay applied.
- Picker order: in the multi-select pickers (labels and assignees, desktop and phone), values checked when the picker opens come first, then mixed values in bulk mode (on some selected issues), then the rest. Each group keeps the list order. The order is fixed when the picker opens, so toggling does not move a row. Milestone and repository pickers keep the list order.
- Create a label: in the Labels picker, a last row `Create label '<filter>'` shows when the filter matches no label name exactly (case-blind). Enter on it creates the label grey (`ededed`), checks it and clears the filter. The server refuses an existing name, trims the name to 1 to 50 characters and drops the repo's cached meta. Not offered in bulk mode, in the assignee picker or in the milestone picker.
- Check with Helper (`K`, or the Helper check card in the issue sidebar; at 960 wide, a strip above the thread that expands with Show card): posts `/helper check`, one comment, and changes nothing. Helper's verdict comment (marker `<!-- helper-bot:check <verdict> -->`) sets the card's chip: Still needed, Partly done, Already done, No longer applies, or Cannot tell from the code. Its newest comment counts only when Helper authored it. The card shows the first line and next step; Close as completed, Not planned or Hand to Helper take the primary style on the action row for done, obsolete or valid. Partly done with met criteria offers `Trim met criteria (N)`, which posts `/helper trim` and moves the met criteria into an Already done section of the issue body. Nod never trims, closes or hands off on its own. The card and `K` show only while the bot is enabled in settings.
- Phone bot check: the issue header shows the verdict as a chip beside the state pill (`Checking...` while pending), and the action sheet lists `Check with Helper`, or `Check again` once a verdict exists, at the top. `Trim met criteria (N)` sits beside it when offered, and the verdict's follow-up row is emphasised. Nothing closes automatically.
- Hand to Helper (`L`, or the sidebar button): confirms, then adds the `helper-bot` label to the issue, creating it in the repo first (`1f6feb`, description `Hand this issue to Helper`) if it is missing. GitHub cannot assign an issue to a GitHub App, so the label is what starts Helper. An issue that already has the label shows a disabled `With Helper`.
- Retry Helper (`T`, beside Comment; the phone action sheet lists it under Start work): shows only when Helper's newest comment (author `helper-bot[bot]`) carries `<!-- helper-bot:retry -->`. Other people's comments never hide or show it. One tap posts `/helper retry` through the comment write path with no confirm. The comment appears in the thread at once and the button reads `Retry requested` until Helper comments again; a failed post rolls back with a toast. Fixture acme-api #441 offers it, #442 hides it (a later Helper comment has no marker) and #443 offers it after human comments.
- Split (`B`, beside Retry Helper; on the phone an action-sheet row under Start work): shows only when Helper's newest comment carries `<!-- helper-bot:split <base64 JSON> -->`, so Retry and Split never show together. The payload is capped at 64 KB and 20 parts, each part must have a title and a list of acceptance criteria, and a marker that fails to decode shows no Split and logs one warning. Split opens a preview (`Helper will open N issues as sub-issues of #n`, criteria collapsed, all as plain text); its Split button posts `/helper split` through the comment write path. The button reads `Split requested` until Helper comments again, then the issue and list reload so the new sub-issues show; a failed post rolls back with a toast. An issue that already has sub-issues shows `Helper won't split an issue that already has sub-issues.` instead, since Helper refuses. Helper opens the issues; Nod never does, and they start unlabelled. Fixture acme-api #444 offers a three-part split, #445 has a malformed marker and #446 has a marker and a sub-issue.
- Dispatch with Orca (`D`, or the sidebar button): opens a dialog with the agent (`claude`, `codex`, `gemini` or `opencode`), a worktree name (`issue-<number>-<slug>`), a base branch (empty uses Orca's default) and an editable prompt. Dispatch creates the worktree with `orca-ide worktree create --issue <number> --agent <id> --prompt <text>`, then runs Start work (assign you, set In progress). Model and Effort sit under Agent: claude offers the aliases from `claude --help`, codex the listed models of `codex debug models` with each model's effort levels, opencode the ids of `opencode models`, and every agent offers Harness default (no `--model`) and a typed id. The server reads those CLIs at most once an hour. A successful dispatch remembers the agent, model and effort per agent in `orca-prefs.json`; the next dialog starts there, and the phone's one-tap dispatch uses the last agent with its remembered model and says so in its confirm. Spec: `docs/design/dispatch-model-spec.md`. The prompt tells the agent to read the issue itself with `gh` and to treat its text as untrusted; the issue body is never pasted in. A dispatched row shows an Orca chip until its comment count changes. The server appends a wrap-up section to every dispatched prompt (`WRAP_UP` in `server/orca.ts`). When the work is done and needs nothing from you, the agent compacts its session and files the workspace as `in-review` or `completed`, marked read. When it has a question, it leaves the workspace unread with the question as the Orca comment. It never removes the worktree.
- An issue that a live Orca session works on (Orca links the worktree to the issue) shows the session's state chip on its row and a strip pinned under the issue header: state, session name, output age, Send message (`g s`) and Open in Orca (`g o`). Waiting is tinted, several sessions offer Choose, and a fresh dispatch shows as pending for up to 2 minutes until Orca reports it. Dispatch with Orca turns dashed while a session is live. Spec: `docs/design/issue-orca-spec.md`.
- Sub-issues: a card under the description lists the issue's children in GitHub's rank order with a progress bar, `Create sub-issue` (`N`, one `createIssue` with the parent set, in any tracked repo) and `Add existing` (`E`, filter tracked issues by title or look one up by `#421` or `acme-api#421`; an issue with another parent says so and moves). Rows take `↑`/`↓`, `Enter` to open, `Alt+↑`/`Alt+↓` or drag to reorder (one `reprioritizeSubIssue` per move, sent on drop), `Del` to remove and `Shift+F10` for the row menu. Remove only unlinks; the child keeps its state. Changes show at once, the issue reloads when GitHub answers, and a failed write restores the list with a toast. A sub-issue has a parent strip above its title (`u` opens the parent). List rows show `3 of 5` for parents and `sub-issue of #12` for children; the list query asks only for the summary, and children load with the issue. The phone has the section in Details, the parent row, `Create sub-issue` in the action sheet and a long-press row sheet with Remove; no reorder or add existing. Spec: `docs/design/sub-issues-spec.md`.
  - The server finds `orca-ide` at `~/.local/bin/orca-ide` or on PATH, rechecking at most once a minute. If it is missing the button is hidden. `GET /api/orca` reports `{available, agents, repos}`.
  - Issue repos map to Orca repos through `orca-ide repo list --json` and each repo's `origin` remote (`github.com[:/]acme-co/<name>`, case-insensitive), cached for 10 minutes. An unmapped repo shows the button disabled with "repo not in Orca".
  - `POST /api/orca/dispatch` sits behind the token and Origin guard, validates every field, and spawns with an argument array (no shell, 60 s timeout, prompt up to 12000 characters). Errors come back trimmed to 300 characters. Fixture mode never spawns and logs the argument array.
- Fix review comments (PR detail Thread): each unresolved, current inline review comment (root of its thread, with a file and line, not minimized, not from your own pending review) has a `Fix` button, and the Thread header has `Fix N comments` while the PR is open and has inline threads (disabled at 0). Its menu has `Ask Helper`, which posts one `/helper` comment straight away naming the file, line, author, a quoted first sentence of the comment (capped at 200 characters, at most 20 comments listed) and its link, and `Dispatch with Orca`, which starts a PR-mode worktree on `origin/<head branch>` (`pr-<number>-fix-comment` or `-comments`) with a prompt that marks the comment text as untrusted, asks for a fix of only that issue, a test run, and a commit pushed to the PR head. The menu opens with one row when Orca is absent. Spec: `docs/design/comment-fix-spec.md`.
- Layout: three panes from 1100px, two panes (list and thread, with the sidebar as a Metadata sheet on `i`) from 700px, one pane below that.

## Orca sessions

When Orca and `orca-ide` are present, a PR row shows a chip for the agent session related to it, the detail pane shows an Orca session card under the description, and your actions notify that session. The feature is absent when `orca-ide` is missing or Orca is not running (also for phones and other browsers that reach the service). Phone layout has none of it.

- Sessions: the server reads `orca-ide worktree ps --json` and `terminal list --json` at most once every 20 seconds, shared by every row (stale value served while one refresh runs). It reads state, names, branch, link numbers and live flags only, never prompts or assistant text. State is `working`, `waiting`, `done` or `unknown`. `GET /api/orca/sessions` returns related and possible sessions per PR.
- Related means a worktree linked to the PR (same repo) or on the PR head branch in the same repo. Only these get automatic messages and draw a chip. A linked issue the PR closes, or the PR number in a branch name, is only "possible": the picker lists it and you can send to it yourself. A chip shows one session, or `2 sessions` when several match (nothing is notified until you choose one in the picker; the choice is kept per PR in `~/.local/state/nod/orca-prefs.json`, mode 600).
- Automatic messages (approve, request changes, comment, auto-merge on, admin merge, ready for review, issue close, issue reopen; a PR merge made later by GitHub is not an app action, so none is sent): one fixed line `[nod] FYI, no action needed: ...` plus the link (a merge or admin merge instead says `[nod] <repo> #<n> was merged by <actor>. Finish any follow-up for it, then run /compress to wrap up.`), never PR body or comment text, tokens or buyer data, with control characters stripped. Sent to working and waiting sessions, and to done sessions only for request changes, merge, admin merge and issue close. Unknown state is never notified. The GitHub action finishes and answers first; the send runs afterwards, once, with a 5 second limit, and its failure never changes the action's result. The action response carries a `noticeId`; `GET /api/orca/notice/:id` (long poll, 6 s) gives the outcome for the toast and an Activity entry.
- Switch: Settings, Orca messages: one global box (default on) and a per-repo Default, On or Off. Stored in `orca-prefs.json`.
- Send message (`s`, or the card button) opens a dialog with the text prefilled from counts and links (Review comment, CI failed, Conflicts, Blank). Nothing is sent until you press Send (Ctrl+Enter). Capped at 600 characters, one line, `--enter` always passed. `POST /api/orca/send` resolves the terminal handle at send time and maps Orca's results: sent, not confirmed (never resent on silence), not writable (Dispatch with Orca fallback), blocked by a prompt, Orca not reachable. When Orca cannot confirm delivery (`provider: unsupported`), the server watches the session's terminal for up to 4 s and counts the send as sent if the message appears there or the idle agent starts working. The card says which proof it used, or names the receipt when there was none. Check again (`POST /api/orca/confirm`) looks once more without resending. All Orca writes sit behind the token and Origin guard.
- `POST /api/orca/open` switches to the session's terminal. `POST /api/orca/choose` and `POST /api/orca/prefs` store the choice and the switch.
- Fixture mode uses an in-memory Orca stand-in with synthetic sessions and records sends in memory (`GET /api/orca/fixture-sends`). Put `fixture-down`, `fixture-exited`, `fixture-blocked`, `fixture-unconfirmed` or `fixture-echo` (unconfirmed by Orca, confirmed from the terminal) in a message to see each result.

In the diff, a deleted line and the added line that replaces it highlight the words that changed, when most of the line stays the same. Each file header ends in a `…` menu: View file, Edit file and Delete file open GitHub on the PR's branch (a deleted file opens on the base branch). GitHub's own commit screen confirms an edit or a delete. Edit and Delete are off for a merged, closed or fork PR, and Edit is off for a binary file. Spec: `docs/design/file-actions-spec.md`.

## Keys

| Key | Action |
|---|---|
| `j` / `k` | next / previous PR |
| `Enter` | open the PR (marks it seen, focuses the diff) |
| `]` / `[` | next / previous file |
| `v` | mark the current file viewed |
| `d` | toggle All changes / Since my review |
| `w` | wrap long diff lines (remembered) |
| `h` | hide viewed files and folders (remembered) |
| `a` / `r` / `c` | approve / request changes / comment (asks to confirm) |
| `m` | enable auto-merge (asks to confirm) |
| `M` | admin merge (a PR you authored or last pushed to, with admin rights, every check passed; asks you to type the PR number) |
| `y` | ready for review (your own draft PR; asks to confirm) |
| `O` | open the PR on GitHub |
| `s` | send a message to the PR's Orca session (in Issues, `s` is status) |
| `o` | open the PR's Orca session (in Issues, `o` is reopen) |
| `f` / `/` | filter the inbox / search |
| `e` | expand the description |
| `t` | Details drawer (below 1400px) |
| `g` then `o` | show Org open |
| `R` | refresh |
| `?` | help |
| `Esc` | close / back |

Every action also has a visible button.

## Behaviour

- The inbox is one GraphQL search of every open org PR (100 per page). The front end derives the sections (Needs my review, Mine, Org open, Dependabot) from it, and the filter box, search, sort and NEW / UPDATED markers never trigger a request. The PR and Issues lists end in a collapsed `Closed · last 30 days` section. It runs its own read-only search (merged, closed unmerged, completed and not planned items, 100 per page) once when it first opens and again when `W` switches the window to 90 days, never on the poll loop. Rows live in memory only, and the server logs the rate-limit cost of each page. The routes are `GET /api/closed/prs` and `GET /api/closed/issues`, with `window` (30 or 90) and an optional `after` cursor.
- The server owns the polling, so the cost does not grow with the number of open windows, tabs or phones. Every 15 seconds at first, stepping up to 30, 60 and then 120 seconds while nothing changes and back to 15 on any change to a PR, issue or mention (a low GitHub API budget stretches the wait 2x under 50% remaining and 4x under 20%), it runs one query for PRs, issues and mentions updated since the last sync (minus 1 minute), so closed and merged PRs arrive and drop out. A search with more hits than its first 10 continues from its cursor, so a bulk change pages the delta and never triggers a sweep.
- After a review, auto-merge, mark ready or admin merge, the server re-reads that one PR directly (never through search, which lags) at 3, 10, 30, 60 and 120 seconds. While the PR stays open with auto-merge set it keeps checking every 60 seconds, up to 30 minutes after the action. A new action on the same PR restarts the schedule. Each check updates the saved list without moving the last sync time and sends a `sync` event only when the PR changed.
- Clients never poll GitHub. `GET /api/inbox` and `GET /api/issues` serve the server's saved lists from memory. `GET /api/events` is a Server-Sent Events stream that sends a `sync` event (`{prs, issues}` with each list's sync time) after every sync, and the client then refetches those two routes. The same event carries `syncing: true` when a sync starts, which the top bar shows as `Syncing...`. `GET /api/inbox` also returns `follows`, the state of PRs acted on (`auto-merge`, `merging`, `merged`, `approved`) that drives the status chips; `approved` lasts 6 s and `merged` 10 s on the server. Refresh (`R`) calls `POST /api/refresh`, which runs a full sweep now.
- A full sweep runs when nothing is saved, when the last one is an hour old (a restart with a saved list under an hour old runs a delta instead), and on Refresh. Teams and project ids refresh on the first sync and then hourly.
- After a rate limit the server reads nothing from GitHub until `resetAt`, keeps serving the saved lists and shows the rate-limit state. Identical concurrent requests share one call in the server's GitHub client (same query and variables, or same REST path).
- Needs my review also includes PRs that request a review from one of your teams in `acme-co`. The server reads your team slugs (`organization.teams(userLogins:)`) and saves them with the inbox. If the token cannot read teams it logs one line and matches your user requests only.
- A quiet poll is one GraphQL request that carries three searches (changed PRs, changed issues, changed mentions) and costs about 1 point on the org. Re-opening a PR whose head and `updatedAt` have not moved costs no request.
- The cache lives in `~/.cache/nod/` (JSON, written atomically, PR metadata and patches only, never the token). It holds the inbox list and last sync time (rendered before the first poll returns), PR detail keyed by `owner/repo#n@headRefOid`, and diff and compare patches keyed by commit SHAs, which are never refetched. Entries for PRs closed over 7 days ago are pruned. REST reads send `If-None-Match`, and a 304 reuses the stored body at no cost.
- The top bar shows the real GraphQL budget from `rateLimit { cost remaining resetAt }`.
- The server logs one line per GitHub call: `[gh] <method> <endpoint or query name> cost=<points> cache=<hit|miss>`. It never logs the token or a response body.
- The issue list, issue detail and repo metadata are cached in the same folder (`issues.json`, `issue-detail/`, `repo-meta/`). `GET /api/mentionable/:owner/:name` serves one page (100) of `repository.mentionableUsers` for the `@` suggestions. The client keeps each repo's pages in memory for the session, and a page is fetched only when the person types past the loaded set.
- NEW / UPDATED / unseen state for PRs and issues lives in `~/.local/state/nod/seen.json`.
- Auto-merge runs `gh pr merge --auto`, with `--merge` when the title contains "release staging to main" and `--squash --delete-branch` otherwise.
- Admin merge runs `gh pr merge --admin` with the same method rule. It shows only on a PR you authored or whose head commit you authored or committed (your approval no longer counts after your push) when GitHub reports `viewerCanMergeAsAdmin` or your repository permission is `ADMIN` (the field ignores ruleset bypass lists, so the permission covers that case; GitHub still decides the merge and its message is shown on refusal), and enables once GitHub's check rollup is SUCCESS. The dialog says "Bypasses required review" and needs the PR number typed. The server re-fetches the PR and refuses unless you authored it or pushed its head commit (`only the PR author or the latest pusher can admin merge`), GitHub reports `viewerCanMergeAsAdmin` or your repository permission is `ADMIN`, the PR is open and the rollup is SUCCESS. It also rejects a request whose `confirm` differs from `number`. Checks and merge state are fetched fresh each time a PR is opened, never from the detail cache.
- GitHub blocks merging a draft. A draft PR shows a "Draft" chip in its header, on inbox rows and on the phone. Auto-merge and Admin merge read "Draft: mark ready first" and stay disabled, and the server refuses both with the same text. **Ready for review** (`y`, or the phone action sheet) asks to confirm, then calls GraphQL `markPullRequestReadyForReview` through the mutation guard and refreshes the PR.
- The PR detail pane reads top to bottom as header, status summary, description, Orca session, Thread, Commits and Files, with the review bar (Approve, Request changes, Comment, Auto-merge, Admin merge) pinned below the scroll. While the viewer has pending draft comments, the bar also shows their count, Discard (a second click confirms) and Finish review, which submits the pending review as Comment, Approve or Request changes with an optional body (required for Request changes). The status summary gives one verdict line over Checks, Threads and Approvals bars (Conflicts replaces Approvals on a conflicting branch). Failing checks and conflicts open their detail on first view. The description starts open and caps a long body at 400px until `e` shows it all. A merged or closed PR has no review bar. Spec: `docs/design/pr-detail-spec.md`.
- PR descriptions render GitHub's `bodyHTML`, sanitized with DOMPurify like issue bodies, in a reading column of 80ch. A detail cached before `bodyHtml` existed falls back to the raw text until it refreshes.
- GitHub refuses approvals and change requests on your own PR (422), so Approve and Request changes are disabled there with "Your PR: GitHub only allows comments". Comment and Auto-merge stay on.
- Action errors show GitHub's own text from the response body (`errors[].message`, else `message`), prefixed with the status and cut at 200 characters, for example `422: Can not approve your own pull request`.
- On a rate limit or API error, reads fall back to the last cached response and a banner explains.
- Layout: three panes at 1400px and up, two panes (300 + review) from 700px, one pane below that.
- Pane widths: drag the handles between panes (double-click or `Home` resets, arrow keys move 16px). Minimums are Inbox 280, Detail 360, Diff or Review 480. Widths persist in `localStorage` per layout.

## Settings

Org-specific values live in one JSON file, `app-settings.json`. The desktop app reads it from Electron's userData folder; browser and headless mode (`pnpm start`, the service) read `~/.config/nod/app-settings.json`, the same file Electron uses on Linux (`XDG_CONFIG_HOME` is honoured). Every key is optional. A missing file means the defaults below. An invalid file logs one line and falls back to the defaults. Restart to apply changes. The page gets the loaded values from `/api/settings`.

| Key | Default | Meaning |
| --- | --- | --- |
| `org` | `"acme-co"` | GitHub org login. Drives searches, API paths, links and UI text. |
| `releaseMerge.base` | `"main"` | Base branch of the release PR. |
| `releaseMerge.head` | `"staging"` | Head branch of the release PR. |
| `releaseMerge.titleContains` | `"release staging to main"` | Case-insensitive title marker. A PR matching base, head and title merges with a merge commit. Every other PR squashes and deletes its branch. |
| `project.number` | `1` | Org project number holding the Status field. A top-level `projectNumber` from older files still applies when this is unset. |
| `project.statusField` | `"Status"` | Name of the single-select field. |
| `project.options.backlog` | `"Backlog"` | Option names, matched by name. The five names must differ from each other (otherwise the file is invalid) and all exist in the project, or the status feature stays hidden. |
| `project.options.ready` | `"Ready"` | Where Stop work puts an issue. |
| `project.options.inProgress` | `"In progress"` | Where Start work puts an issue. |
| `project.options.inReview` | `"In review"` | |
| `project.options.done` | `"Done"` | |
| `orcaAgents` | `["claude", "codex", "gemini", "opencode"]` | Agent ids the Orca dispatch accepts. |
| `bot.login` | `""` | The bot's GitHub login as GraphQL names it, without `[bot]` (for example `helper-bot`). Empty means no one is the bot, so its retry and split comments stay hidden. |
| `bot.marker` | `"bot"` | The word in the bot's `<!-- {marker}:retry -->` and `<!-- {marker}:split ... -->` comments (for example `helper-bot`). |

## Security

The server binds `127.0.0.1` and rejects any request whose Host is not `127.0.0.1`, `localhost` or `*.localhost` (any port, so Orca's port proxy works; browsers resolve `*.localhost` to loopback). Mutating routes need a session token (injected into the served HTML, sent as `x-nod-token`, the main CSRF guard) and an `Origin` header on one of those names. The token persists in `~/.local/state/nod/session-token` (mode 600, written atomically) so a page left open survives a restart; fixture mode uses a fresh in-memory token. If the token still changes, the page re-fetches `/`, reads the new token and retries the write once. Each 403 from the host, origin and token checks logs one line (reason and path only) at most once a minute.

## Phone access

Opens the inbox on your phone over Tailscale Serve. The laptop must be awake and the app running.

1. Turn on Settings > Phone access in the desktop app (or set `NOD_PHONE=1` for `pnpm start`, or run the [service](#service)), then restart. The server uses fixed port 4477 and reads the tailnet name and your login from `tailscale status --json`. If tailscale is missing, phone access stays off and one line is logged.
2. Run once: `tailscale serve --bg --https=443 http://127.0.0.1:4477`. The Android app verifies the host on the default port, so links on any other port open in Chrome. To advertise another port, set `NOD_PHONE_HTTPS_PORT` (for example `8443`) and serve that port instead.
3. In the desktop app, open Settings (the bell) > Pair phone. The dialog shows a QR code, the pairing link with a Copy button, a countdown, and the paired phones.
4. Scan the code with the phone camera. The phone is paired and opens the inbox. Add to Home screen from the browser menu.

Pairing works like `orca serve --mobile-pairing`. The link is `https://<tailnet host>/pair#code=<code>`. The code is single use and expires after 10 minutes, and a new code replaces the old one. The phone page trades the code (`POST /api/pair`, 5 tries a minute) for a device key: 32 random bytes, kept on the phone in an `HttpOnly; Secure; SameSite=Lax` cookie (Chrome withholds Strict cookies when another app launches the phone app). Pairing, revoking, and tailnet requests with no or an unknown device cookie are logged to the journal, never with keys or hashes. The server stores only a SHA-256 hash of each key, with a name (taken from the user agent; use Rename), the created time and the last-seen time, in `~/.local/state/nod/devices.json` (mode 600, written atomically). Revoke deletes the hash, so that phone's key stops working at once.

The server accepts the tailnet host only when phone access is on, and only when `Tailscale-User-Login` (added by Tailscale Serve) equals your login. Every tailnet request also needs a valid device key. A phone without one gets a plain "Not paired" page (HTTP 401) with no data and no session token; only `/pair`, `POST /api/pair`, the manifest and the icons answer without a key. Mutations also accept `Origin: https://<tailnet host>`, the same host on `:8443` (older bookmarks) or on `NOD_PHONE_HTTPS_PORT`, and still need the session token, which is injected into the HTML that is served only after the device key checks out. Any request that carries `Tailscale-User-Login` must match your login, even with a loopback Host (Tailscale Serve may forward that way), and is rejected when phone access is off. Creating codes, listing, renaming and revoking devices, and Update phones are loopback only. Requests without the header on loopback are unchanged.

### Updates

Every `vite build` gets a build id, the git short sha plus the build time (`8152277-2026-11-11T17:12:03Z`). Vite injects it into the page and writes it to `dist/web/build.json`, and the server reports the id of the build it serves in `/api/health` and as the first `build` event on `/api/events`. When a page sees a different id, it shows "Nod updated" and reloads, keeping the PR or issue it had open (`/?open=pr/<repo>/<number>`). The desktop window does the same. A tab reloads at most once per build id, tracked in sessionStorage, and never while a comment box holds unsent text; then it shows "Update ready, tap to reload" instead.

Settings > Pair phone has an Update phones button beside the paired phones. Phones with the page open reload. Paired phones with notifications on but no open page get a Web Push, "Nod updated", that opens `/`. A phone whose app is older than the published APK gets "App update available" instead. The button reports what happened, for example "Reloaded 1 phone, notified 1".

Below the paired phones, Send test notification shows "Nod test" on this desktop (even while focused or muted) and pushes it to every subscribed phone through `POST /api/notifications/test` (loopback only, session token required). It lists one line per target, such as `Desktop: sent`, `Pixel: sent` or `Pixel: failed (HTTP 410, subscription removed)`. A 404 or 410 means the phone's subscription is gone; open Nod on the phone, which sends its current subscription on load, or turn its notifications off and on.

Every notification logs one line, `[notify] <kind> <target> -> 1 of 1 phone` or `-> desktop`, and every failed send one warn line with the device id and HTTP status. Lines never carry endpoints, keys or notification text. Read the service's lines with `journalctl --user -t nod`; `-u nod` misses most of them.

### Service

`nod serve` runs the server with no window, on port 4477 with phone access on. It prints the bound address, the advertised address and the pairing status. `pnpm serve` does the same for the browser build.

```
scripts/install-desktop.sh --install-service
systemctl --user enable --now nod
```

The first line installs the app and copies `scripts/nod.service` (a systemd user unit, `Restart=on-failure`, `RestartSec=10`) to `~/.config/systemd/user/`. The second is printed for you to run. The unit needs `gh` and `tailscale` on its `PATH` and a GitHub login that works without a desktop keyring prompt.

After `pnpm app:dist`, `scripts/install-desktop.sh --restart` restarts a running service, and the phones reload onto the new build when their event stream reconnects. Update phones reaches the ones that were not open.

When the desktop window opens, it checks `http://127.0.0.1:4477/api/health`. If the service answers, the window connects to it and starts no second server, and Settings > Pair phone manages the service's devices. Otherwise the app starts its own server as before. The service reads no desktop settings; phone access is always on for it.

On the phone, a PR or issue opens as a full-screen sheet. Swipe down on the top strip, tap Close, or use the Android back gesture to close one level at a time. Admin merge stays hidden until the app has a source for admin rights. A draft PR you authored lists Ready for review in its action sheet. Dispatch with Orca shows in an issue's action sheet when the server reports Orca and the issue's repo, and asks to confirm before it runs with the default agent and prompt.

## Android

A Trusted Web Activity wraps the phone page (package `dev.example.nod`, launcher name "Nod") and shows Web Push notifications.

**Build.** `pnpm android:build` needs JDK 17 (`.mise.toml` pins it; run `mise install`), the Android SDK and a running tailnet. It reads the tailnet host from `tailscale status --json` and writes a gitignored `android/twa-manifest.json`. It creates the signing key `~/.config/nod/android.keystore` on first use, with a random password in `~/.config/nod/android-keystore.pass` (mode 600). Neither file is committed or printed. Bubblewrap then generates the project in `android/` and builds a signed APK to `release/android/nod.apk`. Each build bumps the version code, counted in `~/.config/nod/android-version.txt`, and bakes it into the start URL as `/?apk=<versionCode>`. The build also publishes the APK and `latest.json` (`{versionCode, versionName, sha256, builtAt}`) to `~/.local/state/nod/android/`, which is where the server reads them; it never serves from the repo. The certificate fingerprint goes to `~/.config/nod/android-fingerprint.txt`; the server reads it at start and serves `/.well-known/assetlinks.json`, so restart the service after the first build.

**Install.** Turn on USB debugging on the phone and run `pnpm android:install` (`adb install -r`). Or copy `release/android/nod.apk` to the phone and open it.

**Updates without USB.** The phone page remembers the version from its start URL (localStorage, with a `nod_apk` cookie as fallback) and checks `GET /api/android/latest` on launch. When the published version is newer, it shows "App update available" with an Install button that downloads `GET /api/android/nod.apk`; Android then asks to install it. The first time, Android asks to allow installs from Nod or Chrome. Dismissing hides the banner until the next version. Both endpoints need a device key, like every tailnet request. An app built before this change opens `/` without the version, so install the first new APK over USB. The query does not affect Digital Asset Links (it verifies the origin) or the pairing links, which open their own URL.

**First launch.** The app opens the phone page without a browser bar once Digital Asset Links verifies. It starts unpaired. Open Settings > Pair phone in the desktop app and scan the QR code with the phone camera. The link opens in the app and pairs it. The generated manifest claims every `https://<tailnet host>` URL with `android:autoVerify="true"`. Android checks `/.well-known/assetlinks.json` on port 443 when the app is installed or updated, so the APK must be installed after Tailscale Serve answers on 443; a failed check is not retried until the next install.

**Notifications.** In the app, open the menu (three dots) and turn on "Notifications on this phone". The phone asks for permission, subscribes, and sends the subscription to the server, which stores it with the device. The server sends Web Push for the same triggers as the desktop (review requested, new review, CI failing, your PR merged or closed, issue assigned or mentioning you), after the first sync. The payload holds only the title, body and target; tapping it opens that PR or issue. VAPID keys are generated once into `~/.local/state/nod/vapid.json` (mode 600). Revoking a phone deletes its subscription.

## Scripts

```
pnpm typecheck
pnpm test
pnpm build
pnpm android:build
pnpm android:install
```

Design contract and mockups are in `docs/design`. The fidelity deltas are in `docs/design/nod-delta.md`.
