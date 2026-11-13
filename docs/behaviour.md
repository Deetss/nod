# Behaviour

## Inbox and closed items

- The inbox is one GraphQL search of every open org PR (100 per page). The front end derives the sections (Needs my review, Mine, Org open, Dependabot) from it. The filter box, search, sort and NEW / UPDATED markers never trigger a request.
- The PR and Issues lists end in a collapsed `Closed · last 30 days` section. It runs its own read-only search (merged, closed unmerged, completed and not planned items, 100 per page) once when it first opens. It runs again when `W` switches the window to 90 days, and never on the poll loop.
- Rows live in memory only. The server logs the rate-limit cost of each page.
- The routes are `GET /api/closed/prs` and `GET /api/closed/issues`, with `window` (30 or 90) and an optional `after` cursor.

## Polling

- The server owns the polling, so the cost does not grow with the number of open windows, tabs or phones.
- Every 15 seconds at first, stepping up to 30, 60 and then 120 seconds while nothing changes. It returns to 15 on any change to a PR, issue or mention. A low GitHub API budget stretches the wait 2x under 50% remaining and 4x under 20%.
- Each poll runs one query for PRs, issues and mentions updated since the last sync (minus 1 minute), so closed and merged PRs arrive and drop out.
- A search with more hits than its first 10 continues from its cursor. A bulk change pages the delta and never triggers a sweep.
- A full sweep runs when nothing is saved, when the last one is an hour old, and on Refresh. A restart with a saved list under an hour old runs a delta instead. Teams and project ids refresh on the first sync and then hourly.
- A quiet poll is one GraphQL request that carries three searches (changed PRs, changed issues, changed mentions) and costs about 1 point on the org.

## After an action

- After a review, auto-merge, mark ready or admin merge, the server re-reads that one PR directly. It does this at 3, 10, 30, 60 and 120 seconds. Direct reads never go through search, which lags.
- While the PR stays open with auto-merge set, it keeps checking every 60 seconds, up to 30 minutes after the action.
- A new action on the same PR restarts the schedule.
- Each check updates the saved list without moving the last sync time. It sends a `sync` event only when the PR changed.
- Re-opening a PR whose head and `updatedAt` have not moved costs no request.

## Clients and events

- Clients never poll GitHub. `GET /api/inbox` and `GET /api/issues` serve the server's saved lists from memory.
- `GET /api/events` is a Server-Sent Events stream. It sends a `sync` event (`{prs, issues}` with each list's sync time) after every sync, and the client then refetches those two routes.
- The same event carries `syncing: true` when a sync starts. The top bar shows this as `Syncing...`.
- `GET /api/inbox` also returns `follows`, the state of PRs acted on (`auto-merge`, `merging`, `merged`, `approved`). It drives the status chips. `approved` lasts 6 s and `merged` 10 s on the server.
- Refresh (`R`) calls `POST /api/refresh`, which runs a full sweep now.

## Rate limits and errors

- After a rate limit the server reads nothing from GitHub until `resetAt`. It keeps serving the saved lists and shows the rate-limit state.
- Identical concurrent requests share one call in the server's GitHub client (same query and variables, or same REST path).
- On a rate limit or API error, reads fall back to the last cached response, and a banner explains.
- Action errors show GitHub's own text from the response body (`errors[].message`, else `message`). The text is prefixed with the status and cut at 200 characters, for example `422: Can not approve your own pull request`.
- The top bar shows the real GraphQL budget from `rateLimit { cost remaining resetAt }`.
- The server logs one line per GitHub call: `[gh] <method> <endpoint or query name> cost=<points> cache=<hit|miss>`. It never logs the token or a response body.

## Teams

Needs my review also includes PRs that request a review from one of your teams in `acme-co`. The server reads your team slugs (`organization.teams(userLogins:)`) and saves them with the inbox. If the token cannot read teams, it logs one line and matches your user requests only.

## Cache

- The cache lives in `~/.cache/nod/` (JSON, written atomically). It holds PR metadata and patches only, never the token.
- It holds the inbox list and last sync time (rendered before the first poll returns), PR detail keyed by `owner/repo#n@headRefOid`, and diff and compare patches keyed by commit SHAs. Patches are never refetched.
- Entries for PRs closed over 7 days ago are pruned.
- REST reads send `If-None-Match`. A 304 reuses the stored body at no cost.
- The issue list, issue detail and repo metadata are cached in the same folder (`issues.json`, `issue-detail/`, `repo-meta/`).
- `GET /api/mentionable/:owner/:name` serves one page (100) of `repository.mentionableUsers` for the `@` suggestions. The client keeps each repo's pages in memory for the session. A page is fetched only when the person types past the loaded set.
- NEW / UPDATED / unseen state for PRs and issues lives in `~/.local/state/nod/seen.json`.

## Merging

- Auto-merge runs `gh pr merge --auto`, with `--merge` when the title contains "release staging to main". Otherwise it runs `--squash --delete-branch`.
- Admin merge runs `gh pr merge --admin` with the same method rule. It shows only on a PR you authored, or whose head commit you authored or committed. Your approval no longer counts after your push. It shows when GitHub reports `viewerCanMergeAsAdmin` or your repository permission is `ADMIN`. The permission check covers ruleset bypass lists, which the field ignores. GitHub still decides the merge, and its message is shown on refusal. It enables once GitHub's check rollup is SUCCESS.
- The dialog says "Bypasses required review" and needs the PR number typed.
- The server re-fetches the PR and refuses unless you authored it or pushed its head commit (`only the PR author or the latest pusher can admin merge`). It also refuses unless GitHub reports `viewerCanMergeAsAdmin` or your repository permission is `ADMIN`, the PR is open and the rollup is SUCCESS. It rejects a request whose `confirm` differs from `number`.
- Checks and merge state are fetched fresh each time a PR is opened, never from the detail cache.

## Drafts and reviews

- GitHub blocks merging a draft. A draft PR shows a "Draft" chip in its header, on inbox rows and on the phone.
- Auto-merge and Admin merge read "Draft: mark ready first" and stay disabled. The server refuses both with the same text.
- **Ready for review** (`y`, or the phone action sheet) asks to confirm. It then calls GraphQL `markPullRequestReadyForReview` through the mutation guard and refreshes the PR.
- GitHub refuses approvals and change requests on your own PR (422). Approve and Request changes are disabled there with "Your PR: GitHub only allows comments". Comment and Auto-merge stay on.
- The PR detail pane reads top to bottom as header, status summary, description, Orca session, Thread, Commits and Files. The review bar (Approve, Request changes, Comment, Auto-merge, Admin merge) is pinned below the scroll.
- While the viewer has pending draft comments, the bar also shows their count, Discard (a second click confirms) and Finish review. Finish review submits the pending review as Comment, Approve or Request changes, with an optional body. The body is required for Request changes.
- The status summary gives one verdict line over Checks, Threads and Approvals bars. Conflicts replaces Approvals on a conflicting branch. Failing checks and conflicts open their detail on first view.
- The description starts open and caps a long body at 400px until `e` shows it all.
- A merged or closed PR has no review bar.
- Spec: `docs/design/pr-detail-spec.md`.
- PR descriptions render GitHub's `bodyHTML`, sanitized with DOMPurify like issue bodies, in a reading column of 80ch. A detail cached before `bodyHtml` existed falls back to the raw text until it refreshes.

## Needs my review and layout

- Layout: three panes at 1400px and up, two panes (300 + review) from 700px, one pane below that.
- Pane widths: drag the handles between panes (double-click or `Home` resets, arrow keys move 16px). Minimums are Inbox 280, Detail 360 and Diff or Review 480. Widths persist in `localStorage` per layout.
- In the diff, a deleted line and the added line that replaces it highlight the changed words. See [Orca](orca.md) for file actions.
