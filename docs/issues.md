# Issues

The PRs / Issues switch in the top bar (or `g p` / `g i`) changes the view. The inactive side shows its unseen count, and the choice is remembered. The Issues view is a list, a thread and a metadata sidebar.

## Groups

- In progress: Status In progress and assigned to you.
- With bot: open issues carrying the bot's label. Only when `bot.enabled` is on and `bot.label` is set. Titled `With <bot.name>`.
- Assigned to me, Created by me, Mentioned, Untriaged (no labels and no assignees) and All open.

An issue sits in the first group that fits it, so the counts add up. All open lists every issue. Repo, label, Status, text and sort run in the browser only.

## Project status

The acme-co project "Dev" Status field (Backlog, Ready, In progress, In review, Done) shows as a chip on each row that is not Backlog. It also shows as a Status row in the sidebar.

- `s` opens the five-option dropdown.
- `S` toggles Start work (assign you if needed, add the issue to the project if missing, set In progress) and Stop work (set Ready, keep the assignee). There is no confirm, and a toast shows.
- A Status filter sits next to Repo and Label.
- The project, field and option ids are resolved by name at start, cached in `~/.cache/nod/project.json` and refreshed on the 15-minute sweep.
- If the project, field or any option name is missing, the feature hides and one line is logged.
- Fixture mode gives issues statuses and changes the in-memory copy. The phone action sheet has the same Status control.

## Data

- One paginated search of open org issues.
- One search of open issues that mention you.
- One GraphQL query per opened issue (body, comments, label and assign events, linked PRs). Detail is cached by issue id and `updatedAt`, so reopening an unchanged issue costs no request.
- Repo labels, milestones and assignable users load when a picker first opens for that repo. They are cached on disk for 1 hour.

## Rendering and images

Issue HTML comes from GitHub already rendered. It goes through DOMPurify before insertion, and links open in a new tab. The same applies to PR descriptions and thread comments.

Images in that HTML load through `GET /api/image?u=<url>`, because the browser has no GitHub session for private repos.

- The sanitizer rewrites `img` sources on an allowlist: https `github.com` blob and raw links for the configured org, `raw.githubusercontent.com`, `user-images` and `private-user-images.githubusercontent.com`, and `github.com/user-attachments/assets/`.
- The server rejects anything else with 400. It reads repo files through the contents API with its own token. It follows redirects only to GitHub image hosts, and sends the token to no host but GitHub.
- Responses must sniff as png, jpeg, gif or webp (never svg). They are capped at 10 MB and carry `nosniff`.
- Fixture mode serves a synthetic image.

## Writes

Comment, close as completed or not planned, reopen, labels, assignees, milestone, title and new issue are GraphQL mutations behind the same token and Origin guard as PR writes.

- Bulk labels, assign and close send one mutation per issue, three at a time.
- Failures are listed. Successes stay applied.
- Issue writes in fixture mode log what they would do and change an in-memory copy only.

## Pickers

In the multi-select pickers (labels and assignees, desktop and phone), values checked when the picker opens come first. Mixed values in bulk mode (on some selected issues) come next, then the rest. Each group keeps the list order.

The order is fixed when the picker opens, so toggling does not move a row. Milestone and repository pickers keep the list order.

Create a label: in the Labels picker, a last row `Create label '<filter>'` shows when the filter matches no label name exactly (case-blind). Enter on it creates the label grey (`ededed`), checks it and clears the filter. The server refuses an existing name, trims the name to 1 to 50 characters and drops the repo's cached meta. It is not offered in bulk mode, in the assignee picker or in the milestone picker.

## Helper

The bot is referred to as Helper in the examples below. Its login and marker come from `bot.login` and `bot.marker` in [Settings](settings.md).

- Check with Helper (`K`, or the Helper check card in the issue sidebar; at 960 wide, a strip above the thread that expands with Show card) posts `/helper check`, one comment, and changes nothing.
- Helper's verdict comment (marker `<!-- helper-bot:check <verdict> -->`) sets the card's chip: Still needed, Partly done, Already done, No longer applies, or Cannot tell from the code. Its newest comment counts only when Helper authored it.
- The card shows the first line and next step. Close as completed, Not planned or Hand to Helper take the primary style on the action row for done, obsolete or valid.
- Partly done with met criteria offers `Trim met criteria (N)`. It posts `/helper trim` and moves the met criteria into an Already done section of the issue body.
- Nod never trims, closes or hands off on its own.
- The card and `K` show only while the bot is enabled in settings.
- Phone: the issue header shows the verdict as a chip beside the state pill (`Checking...` while pending). The action sheet lists `Check with Helper`, or `Check again` once a verdict exists, at the top. `Trim met criteria (N)` sits beside it when offered.
- Hand to Helper (`L`, or the sidebar button) confirms, then adds the `helper-bot` label to the issue. It creates the label in the repo first (`1f6feb`, description `Hand this issue to Helper`) if it is missing. GitHub cannot assign an issue to a GitHub App, so the label is what starts Helper. An issue that already has the label shows a disabled `With Helper`.
- Retry Helper (`T`, beside Comment; the phone action sheet lists it under Start work) shows only when Helper's newest comment (author `helper-bot[bot]`) carries `<!-- helper-bot:retry -->`. One tap posts `/helper retry` with no confirm. The button reads `Retry requested` until Helper comments again. A failed post rolls back with a toast.
- Split (`B`, beside Retry Helper; on the phone an action-sheet row under Start work) shows only when Helper's newest comment carries `<!-- helper-bot:split <base64 JSON> -->`, so Retry and Split never show together.
  - The payload is capped at 64 KB and 20 parts. Each part must have a title and a list of acceptance criteria.
  - A marker that fails to decode shows no Split and logs one warning.
  - Split opens a preview (`Helper will open N issues as sub-issues of #n`). Its Split button posts `/helper split`.
  - The button reads `Split requested` until Helper comments again. Then the issue and list reload.
  - An issue that already has sub-issues shows `Helper won't split an issue that already has sub-issues.` Helper refuses in that case.
  - Helper opens the issues. Nod never does, and they start unlabelled.
- Fixture acme-api #441 offers Retry, #442 hides it and #443 offers it after human comments. Fixture acme-api #444 offers a three-part split, #445 has a malformed marker and #446 has a marker and a sub-issue.

## Dispatch with Orca

Dispatch with Orca (`D`, or the sidebar button) opens a dialog. It sets the agent (`claude`, `codex`, `gemini` or `opencode`), a worktree name (`issue-<number>-<slug>`), a base branch (empty uses Orca's default) and an editable prompt.

- Dispatch creates the worktree with `orca-ide worktree create --issue <number> --agent <id> --prompt <text>`, then runs Start work (assign you, set In progress).
- Model and Effort sit under Agent. claude offers the aliases from `claude --help`. codex offers the listed models of `codex debug models` with each model's effort levels. opencode offers the ids of `opencode models`. Every agent offers Harness default (no `--model`) and a typed id.
- The server reads those CLIs at most once an hour.
- A successful dispatch remembers the agent, model and effort per agent in `orca-prefs.json`. The next dialog starts there. The phone's one-tap dispatch uses the last agent with its remembered model, and says so in its confirm.
- The prompt tells the agent to read the issue itself with `gh` and to treat its text as untrusted. The issue body is never pasted in.
- A dispatched row shows an Orca chip until its comment count changes.
- The server appends a wrap-up section to every dispatched prompt (`WRAP_UP` in `server/orca.ts`). When the work is done and needs nothing from you, the agent compacts its session and files the workspace as `in-review` or `completed`, marked read. When it has a question, it leaves the workspace unread with the question as the Orca comment. It never removes the worktree.

## Live Orca sessions

An issue that a live Orca session works on (Orca links the worktree to the issue) shows the session's state chip on its row. A strip pinned under the issue header shows state, session name, output age, Send message (`g s`) and Open in Orca (`g o`).

- Waiting is tinted. Several sessions offer Choose.
- A fresh dispatch shows as pending for up to 2 minutes, until Orca reports it.
- Dispatch with Orca turns dashed while a session is live.
- The server finds `orca-ide` at `~/.local/bin/orca-ide` or on PATH, rechecking at most once a minute. If it is missing, the button is hidden. `GET /api/orca` reports `{available, agents, repos}`.
- Issue repos map to Orca repos through `orca-ide repo list --json` and each repo's `origin` remote (`github.com[:/]acme-co/<name>`, case-insensitive). The mapping is cached for 10 minutes. An unmapped repo shows the button disabled with "repo not in Orca".
- `POST /api/orca/dispatch` sits behind the token and Origin guard. It validates every field and spawns with an argument array (no shell, 60 s timeout, prompt up to 12000 characters). Errors come back trimmed to 300 characters. Fixture mode never spawns and logs the argument array.

## Fix review comments

On the PR detail Thread, each unresolved, current inline review comment has a `Fix` button. A comment qualifies when it is the root of its thread, has a file and line, is not minimized, and is not from your own pending review. The Thread header has `Fix N comments` while the PR is open and has inline threads (disabled at 0).

- Its menu has `Ask Helper`. It posts one `/helper` comment straight away, naming the file, line, author, a quoted first sentence of the comment (capped at 200 characters, at most 20 comments listed) and its link.
- The menu also has `Dispatch with Orca`. It starts a PR-mode worktree on `origin/<head branch>` (`pr-<number>-fix-comment` or `-comments`). The prompt marks the comment text as untrusted, and asks for a fix of only that issue, a test run, and a commit pushed to the PR head.
- The menu opens with one row when Orca is absent.

## Sub-issues

A card under the description lists the issue's children in GitHub's rank order, with a progress bar.

- `Create sub-issue` (`N`) makes one `createIssue` with the parent set, in any tracked repo.
- `Add existing` (`E`) filters tracked issues by title, or looks one up by `#421` or `acme-api#421`. An issue with another parent says so and moves.
- Rows take `↑`/`↓`, and `Enter` opens. `Alt+↑`/`Alt+↓` or drag reorders (one `reprioritizeSubIssue` per move, sent on drop). `Del` removes and `Shift+F10` opens the row menu.
- Remove only unlinks. The child keeps its state.
- Changes show at once. The issue reloads when GitHub answers. A failed write restores the list with a toast.
- A sub-issue has a parent strip above its title (`u` opens the parent).
- List rows show `3 of 5` for parents and `sub-issue of #12` for children. The list query asks only for the summary, and children load with the issue.
- The phone has the section in Details, the parent row, `Create sub-issue` in the action sheet and a long-press row sheet with Remove. It has no reorder and no add existing.

## Layout

Three panes from 1100px, two panes (list and thread, with the sidebar as a Metadata sheet on `i`) from 700px, and one pane below that.
