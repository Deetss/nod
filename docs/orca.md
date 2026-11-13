# Orca sessions

When Orca and `orca-ide` are present, a PR row shows a chip for the agent session related to it. The detail pane shows an Orca session card under the description, and your actions notify that session. The feature is absent when `orca-ide` is missing or Orca is not running. It is also absent for phones and other browsers that reach the service. The phone layout has none of it.

## Sessions

- The server reads `orca-ide worktree ps --json` and `terminal list --json` at most once every 20 seconds. Every row shares the result, and a stale value is served while one refresh runs.
- It reads state, names, branch, link numbers and live flags only. It never reads prompts or assistant text.
- State is `working`, `waiting`, `done` or `unknown`.
- `GET /api/orca/sessions` returns related and possible sessions per PR.
- Related means a worktree linked to the PR (same repo) or on the PR head branch in the same repo. Only these get automatic messages and draw a chip.
- A linked issue the PR closes, or the PR number in a branch name, is only "possible". The picker lists it, and you can send to it yourself.
- A chip shows one session, or `2 sessions` when several match. Nothing is notified until you choose one in the picker. The choice is kept per PR in `~/.local/state/nod/orca-prefs.json` (mode 600).

## Automatic messages

Nod sends a message for these actions: approve, request changes, comment, auto-merge on, admin merge, ready for review, issue close and issue reopen. A PR merge made later by GitHub is not an app action, so none is sent.

- The message is one fixed line, `[nod] FYI, no action needed: ...`, plus the link.
- A merge or admin merge says `[nod] <repo> #<n> was merged by <actor>. Finish any follow-up for it, then run /compress to wrap up.`
- Messages never include PR body or comment text, tokens or buyer data. Control characters are stripped.
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

Fixture mode uses an in-memory Orca stand-in with synthetic sessions and records sends in memory (`GET /api/orca/fixture-sends`). Put `fixture-down`, `fixture-exited`, `fixture-blocked`, `fixture-unconfirmed` or `fixture-echo` (unconfirmed by Orca, confirmed from the terminal) in a message to see each result.

## File actions in the diff

In the diff, a deleted line and the added line that replaces it highlight the words that changed, when most of the line stays the same.

Each file header ends in a `…` menu: View file, Edit file and Delete file. They open GitHub on the PR's branch (a deleted file opens on the base branch). GitHub's own commit screen confirms an edit or a delete. Edit and Delete are off for a merged, closed or fork PR, and Edit is off for a binary file.

Dispatch details are in [Issues](issues.md).
