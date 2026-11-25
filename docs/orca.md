# Orca sessions

When Orca and `orca-ide` are present, a PR row shows a chip for the agent session related to it. The detail pane shows an Orca session card under the description, and your actions notify that session. The feature is absent when `orca-ide` is missing or Orca is not running. It works the same on a phone that reaches the service, where sessions show the same chip and can be sent to from the bottom sheet. A phone does not show the diff's file actions, which stay desktop only.

## Hosts

The hub runs Orca actions on its own Orca and on every Orca host paired with it through `orca-ide environment add`.

- The host list is `local` plus each entry of `orca-ide environment list --json`, named by `name`, else by `id`. It is cached for 20 seconds.
- `local` is the hub's own Orca and never gets a flag. Every other host gets `--environment <name>` on every `orca-ide` call. All calls go through `Orca.cli(args, timeoutMs, host)`, and a host is always its own array entry, never part of a shell string.
- A paired host is online when `worktree ps` and `terminal list` answer within 6 seconds (the CLI itself takes about 3). The hub keeps the last time it saw each host online.
- `GET /api/orca/hosts` returns `[{name, online, lastSeen}]`, with `lastSeen` in ms or null when never seen. It has the same guards as `GET /api/orca`.
- Repos map per host. A paired host reports each repo's remote in `repo list`, since its paths are not on the hub's disk.

### Host selection

Dispatch, Send, Open, Check again and Choose take an optional `host`. Without one, the server uses the repo's host preference, then the default host, then `local`.

- A host that is not in the live list returns 400 before any `orca-ide` call.
- An offline host returns 503 with `Orca host <name> is offline`, and nothing is sent or created.
- The web sends back the host of the session it acts on, so a send reaches the Orca that owns the terminal. A terminal handle is valid only on the host that issued it.

### Hosts in the app

With only `local` in the host list, nothing below shows and every surface looks as it did before hosts.

- Session lists (Send to in Dispatch all, the session picker, the phone sheets) tag each row whose host is not `local` with a pill naming the host. Rows keep their order.
- Sessions on an offline host are not listed. One muted line per offline host says so, `desktop is offline (seen 2h ago), so its sessions are not listed.`, at most two, then `and N more`.
- Dispatch all ends its Send to list with a `New worktree on <host>` row, and the issue and PR Dispatch dialogs show the same row above their fields. The host starts on the repo's host, then the default host, then `local`, which reads `local (hub)`.
- The host menu lists online hosts first, then offline ones greyed with `offline · <ago>`, which cannot be picked. Arrows move, Enter picks and Esc closes the menu only. A pick is saved as the repo's host through `POST /api/orca/prefs`.
- When the repo's host is offline the row falls back to `local (hub)` and an attention line says `This repo usually runs on <host>, which is offline (seen <ago>).` Nothing is queued for later.
- On a phone, Dispatch all lists the sessions itself as cards, and the New worktree card has a full-width `Run on` select that opens the picker sheet with the same grouping.
- A row chip for a session on another host reads `<host> · <state>`. The issue strip and the detail card add `on <host>` after the worktree name.
- When a host stops answering, its sessions keep their last state in this window, drawn with a dashed ring and border as `<host> · offline <ago>`. The card's Send message is disabled with the title `Orca host <host> is offline`. They clear once the host answers again. A reload forgets them.
- `GET /api/orca/sessions` and `POST /api/orca/prefs` return `defaultHost` and the per-repo `hosts` beside the message prefs, so the dialogs know the repo's host.

## Sessions

- The server reads `orca-ide worktree ps --json` and `terminal list --json` on every host at most once every 20 seconds, and merges the results. Every row shares them, and a stale value is served while one refresh runs.
- Every session carries its `host`. Session ids are unique on one host only, so the hub matches a session by host and id together.
- It reads state, names, branch, link numbers and live flags only. It never reads prompts or assistant text.
- State is `working`, `waiting`, `done` or `unknown`.
- `GET /api/orca/sessions` returns related and possible sessions per PR, across every online host. Each entry has `host`.
- Related means a worktree linked to the PR (same repo) or on the PR head branch in the same repo. Only these get automatic messages and draw a chip.
- A linked issue the PR closes, or the PR number in a branch name, is only "possible". The picker lists it, and you can send to it yourself.
- A chip shows one session, or `2 sessions` when several match. Nothing is notified until you choose one in the picker. The choice is kept per PR in `~/.local/state/nod/orca-prefs.json` (mode 600, written atomically).

### Preferences file

- `chosen` maps a PR id to `{host, worktreeId, sessionId}`.
- `defaultHost` names the host for a new worktree when the repo names none. Absent means `local`.
- `hosts` maps a lower-case `owner/name` repo to its host.
- `POST /api/orca/prefs` takes `{defaultHost}` or `{repo, host}`, where `null` clears the choice and a host must be in the live list.
- An entry saved before hosts existed, as `{worktreeId, sessionId}` or a bare worktree id, reads as host `local` and is written back in the new shape on the next save.

### Reusing a PR's worktree

- A PR dispatch first looks for a worktree already linked to the PR on any online host, with or without a live agent.
- A live match returns 409 naming the worktree and host, so send to that session instead.
- An idle match, where the agent has exited, gets the new agent. This is the default.
- `newWorktree: true` skips the search. The Fix dialog and Dispatch all send it only when you pick New worktree.
- `GET /api/orca/sessions` lists idle worktrees per PR as `idle`, and the dialogs offer the first one as the default row.
- The phone reuses the idle worktree without a choice. Start a second worktree from the desktop.

## Automatic messages

Nod sends a message for these actions: approve, request changes, comment, auto-merge on, admin merge, ready for review, issue close and issue reopen. A PR merge made later by GitHub is not an app action, so none is sent.

- The message is one fixed line, `[nod] FYI, no action needed: ...`, plus the link.
- A merge or admin merge says `[nod] <repo> #<n> was merged by <actor>. Finish any follow-up for it, then run /compress to wrap up.`
- Messages never include PR body or comment text, tokens or buyer data. Control characters are stripped.
- Related sessions on every online host get the message. An offline host is skipped with one log line, `[orca] skipped <host>: offline`.
- Working and waiting sessions get the message. Done sessions get it only for request changes, merge, admin merge and issue close. Unknown state is never notified.
- The GitHub action finishes and answers first. The send runs afterwards, once, with a 5 second limit. Its failure never changes the action's result.
- The action response carries a `noticeId`. `GET /api/orca/notice/:id` (long poll, 6 s) gives the outcome for the toast and an Activity entry.

## Settings

Settings, Orca messages has one global box (default on) and a per-repo Default, On or Off. Both are stored in `orca-prefs.json`.

## Send message

`s`, or the card button, opens a dialog with the text prefilled from counts and links (Review comment, CI failed, Conflicts, Blank). Nothing is sent until you press Send (Ctrl+Enter). The message is capped at 600 characters, is one line, and always passes `--enter`.

- `POST /api/orca/send` resolves the terminal handle at send time and maps Orca's results: sent, not confirmed (never resent on silence), not writable (Dispatch with Orca fallback), blocked by a prompt, or Orca not reachable.
- When Orca cannot confirm delivery (`provider: unsupported`), the server watches the session's terminal for up to 4 s. It counts the send as sent if the message appears there or the idle agent starts working. The card says which proof it used, or names the receipt when there was none.
- Check again (`POST /api/orca/confirm`) looks once more without resending.
- `POST /api/orca/open` switches to the session's terminal. `POST /api/orca/choose` and `POST /api/orca/prefs` store the choice and the switch.
- All Orca writes sit behind the token and Origin guard.

## Fixture mode

Fixture mode uses an in-memory Orca stand-in with synthetic sessions and records sends in memory (`GET /api/orca/fixture-sends`, each with its host). It has two paired hosts: `laptop`, online with sessions of its own, and `desktop`, offline. `NOD_FIXTURE_SESSIONS=hosts` adds `review-365` and `crew-310` on `laptop`, so #365's Send to list spans two hosts. `NOD_FIXTURE_SESSIONS=idle` leaves #365's worktree with no agent, so its dispatch offers reuse. `NOD_FIXTURE_DESKTOP_UP_S=<seconds>` keeps `desktop` online for that long after start with `webhooks-373` on #373, so its chip can be seen going offline. Put `fixture-down`, `fixture-exited`, `fixture-blocked`, `fixture-unconfirmed` or `fixture-echo` (unconfirmed by Orca, confirmed from the terminal) in a message to see each result.

## Dispatch from a phone

Findings get a dispatch action on a phone too, as a bottom sheet: the ticked findings, a session or a new worktree on the PR head, and one editable prompt. It sends through the same Orca flow and needs the token and Origin guard, so it asks to confirm before it runs.

## File actions in the diff

In the diff, a deleted line and the added line that replaces it highlight the words that changed, when most of the line stays the same.

Each file header ends in a `…` menu: View file, Edit file and Delete file. They open GitHub on the PR's branch (a deleted file opens on the base branch). GitHub's own commit screen confirms an edit or a delete. Edit and Delete are off for a merged, closed or fork PR, and Edit is off for a binary file.

Dispatch details are in [Issues](issues.md).
