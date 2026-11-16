# GitHub token setup spec (round 2, layout B)

Mockup: `token-setup-mockup.svg` and `.png` (dark, frames B1 to B15). Wireframe: `token-setup-wireframe-B.svg` (picked).
Tokens come from `tokens.md` and `density-tokens.md`, comfortable density. Minimum font 12px (`constraints.md`). Sizes: desktop 1660x870, narrow 960x870, phone 412x915.
Sample data is synthetic (`acme-dev`, `acme-co`, `build-bot`, `dependabot[bot]`).

## Scope list, corrected from the code

The wireframe marked `read:org` as required. The code does not need it.

| Scope | Need | What calls it | Without it |
|---|---|---|---|
| `repo` | Required | Search, PR and issue queries, reviews, comments, reruns (`server/queries.ts`, `server/github-provider.ts`, `server/github-client.ts`) | Private repos drop out of search. A sweep would treat their PRs as gone, so sync pauses instead. |
| `read:org` | Optional | `TEAMS_QUERY` (`server/queries.ts:146`), called from `fetchTeams` (`server/github-provider.ts:409`) | `fetchTeams` already catches the error and matches user review requests only. Team requests are missed. |
| `project` | Optional | `projectItems` in issue fields (`server/issue-queries.ts:25`), `PROJECT_META_QUERY`, `addProjectV2ItemById` and `updateProjectV2ItemFieldValue` (`server/issue-queries.ts:200-216`) | Issue queries fail outright today. After this change they drop `projectItems` and Status is hidden. |

`read:project` would be enough to read Status. Nod asks for `project` because Move to In progress writes. Treat a token with `read:project` and no `project` as "project missing".

## Behaviour

### Token and scopes (server)

- The server starts without a token. `buildProvider` (`server/build-provider.ts`) no longer throws when `gh auth token` fails. It starts in the `none` state and serves the app.
- `readGhToken` (`server/token.ts`) stays the only token source. It runs `gh auth token` with the 15s timeout.
- Scopes come from the `X-OAuth-Scopes` response header. `GithubClient.send` (`server/github-client.ts:109`) reads it next to `noteRate` on every response and keeps the latest set. A cheap `GET /user` reads it on startup and on Check again, before any sync.
- `GET /user` also gives the login for the "acme-dev on github.com" line.
- `project` counts as present when `project` is in the list. `repo` counts when `repo` is in the list. `read:org` counts when `read:org`, `write:org` or `admin:org` is in the list.
- No `X-OAuth-Scopes` header at all (fine-grained token or app token): marks show the unknown ring, the pill says `Scopes unknown` (neutral), and Nod syncs and learns from errors. Status hides on the first `projectItems` error. No crosses are drawn from a guess.
- Token source line: `token from gh` normally. When `GH_TOKEN` or `GITHUB_TOKEN` is set in the server's environment, `gh auth token` prints that value, so the line says `token from GH_TOKEN` and the command changes (see Commands).

### States

| State | When | Sync | Pill |
|---|---|---|---|
| `none` | `gh auth token` fails or prints nothing | Off, nothing cached | Not connected |
| `required` | Token lacks `repo` | Paused, cache shown, writes off | Sync paused |
| `optional` | `repo` present, `project` or `read:org` missing | Runs, degraded | Partly on |
| `ok` | All three present | Runs | All on |
| `unknown` | No `X-OAuth-Scopes` header | Runs | Scopes unknown |

The state, scope set, login, source and `checkedAt` go to the web app as a new `connection` field on the inbox and issues payloads (beside `stale` in `shared/types.ts`). The token itself never leaves the server (`docs/security.md`).

### Check again

1. `POST /api/connection/check` (mutating route, session token and Origin checks as in `docs/security.md`).
2. Re-run `gh auth token`.
3. Swap the token in memory. `GithubClient.token` becomes a private mutable field with `setToken()`. In-flight requests finish on the old token. No restart.
4. `GET /user` to re-read scopes and login.
5. If the state improved, start a full sync (the existing refresh path) and clear the project cache so `refreshMeta` resolves the project again.
6. Respond with the new `connection`. `checkedAt` is the local HH:MM.

The button shows the existing `.spinner` and `aria-busy` while it runs (as Save does). It works whether or not the Settings form is dirty. It never saves the form.
If the token is unchanged and the state is unchanged, the result box appears (B6, B14). If the token changed but scopes are still missing, the box says the new token is still missing the scope.

### Commands

| State | Command |
|---|---|
| `none` | `gh auth login -s project` |
| `required`, `optional` | `gh auth refresh -h github.com -s <missing>` with every missing scope, comma separated, in table order. B1: `-s repo,project`. B4: `-s project`. |
| Token from `GH_TOKEN` or `GITHUB_TOKEN` | No command block. One line instead: `Nod reads GH_TOKEN. Give that token the missing scopes, or unset it and run gh auth login -s project.` |

`gh auth login` and `gh auth refresh` always add `repo`, `read:org` and `gist`, so `-s project` is enough on login.
Copy copies the command text only, no trailing newline. It reuses `copyLink` (`web/phone/link-actions.ts`) and the copy toast from `web/copy-link.tsx` (`Copied`, `Could not copy`). The button shows its check glyph for `COPIED_MS`.

### Degraded sync when `project` is missing

- `ISSUE_FIELDS` (`server/issue-queries.ts:25`) builds without the `projectItems` block. The `$statusField` variable goes too.
- `ProjectConfig.refresh` is skipped and `resolved` stays undefined, so `enabled` is false. The project log line is not written.
- Issue rows show no Status chip. The issue sidebar hides the Status field. Move to In progress is hidden in the sidebar, the action menu and the phone issue sheet. The Orca dispatch flow skips its status move.
- Settings > Project board shows `Status off` (muted) in the section list.

### Degraded sync when `read:org` is missing

No change from today: `fetchTeams` returns `[]` and logs once. The Connection block now says so.

### Generic sync error card

`Banner` (`web/Banner.tsx`) error branch:

- Title is `Sync failed`, not `stale.message`.
- `stale.message` shows once, at 14/20, clamped to 3 lines. The full text is the element's `title` and shows in Details.
- Details shows the HTTP status, the operation name and the time (from `formatCall` in `server/request-log.ts`). It no longer repeats the message.
- A token state (`none`, `required`) replaces this card. The two never stack.

## Reused components and classes

| Element | Reuse | Source | Extend |
|---|---|---|---|
| Settings dialog, section list, pane, footer | `SettingsDialog`, `.settings-dialog`, `.settings-nav-item`, `.settings-pane`, `.settings-foot` | `web/settings/SettingsDialog.tsx`, `web/settings.css` | `GithubPane` gains the Connection block above its fields |
| Nav item mark | `.settings-nav-alert` | `web/settings.css` | Add `.is-attention`. Show it on the active item too (today it hides there) |
| Buttons, key caps | `Btn`, `.btn`, `.btn-primary`, `.kbd`, `.spinner` | `web/ui.tsx`, `web/base.css` | None |
| Copy | `copyLink`, `COPIED_MS`, toast | `web/phone/link-actions.ts`, `web/copy-link.tsx` | New `CopyCommandButton` beside `CopyLinkButton`; same toast path |
| Command box | `.settings-query` look | `web/settings.css` | New `.conn-cmd`: same font, `bgColor-inset`, 1px border, no ellipsis |
| Icons | `AlertIcon`, `InfoIcon`, `CheckIcon`, `XIcon`, `CopyIcon` | `web/ui.tsx` | None |
| List banner | `Banner`, `.banner`, `.banner-error`, `.banner-title`, `.banner-detail`, `.banner-actions` | `web/Banner.tsx`, `web/base.css`, `web/inbox.css` | Add `.banner-setup` (accent) and `TokenBanner`; fix the error branch |
| Quiet notice | none today | | New `.quiet-note` in `web/inbox.css` |
| Topbar gear | `SettingsButton`, `.icon-btn` | `web/Topbar.tsx`, `web/inbox.css` | Optional `mark` prop renders `.top-mark` |
| Phone banner | `ErrorBanner`, `.ph-error` | `web/phone/PhoneStates.tsx`, `web/phone/phone-states.css` | Title and body become props; add `.ph-error.is-setup` (accent) |
| Phone sheet | `.ph-scrim`, `.ph-asheet`, `.ph-asheet-title`, `.ph-asheet-body`, `.ph-actionbar`, `.ph-btn` | `web/phone/phone-actions.css`, `web/phone/phone-sheets.css`, `web/phone/phone-states.css` | New `PhoneConnectionSheet` |

One `ConnectionBlock` component draws the desktop card and the phone sheet body, with a `phone` prop for the row layout and command label. State logic (marks, pill, command) lives in `shared/connection.ts` so the server and both UIs agree.

## Elements, desktop

Boxes are x, y, w, h. Colour names are `tokens.md` tokens. "muted" is `fgColor-muted`, "default" is `fgColor-default`.

### Settings dialog (880x640, centred, B1 at 390, 115)

Unchanged: head 59 + 1 border, nav 200 wide, footer 56, pane `overflow-y: auto` (scroll owner), pane padding 15 24 24, content width 632.

| Element | Box (in the dialog) | Font | Colour | Notes |
|---|---|---|---|---|
| Nav mark on GitHub | 168, 79, 16, 16 | `!` 12/16, 700 | `borderColor-danger-emphasis` fill (`bgColor-attention-emphasis` for `optional`), white glyph, 2px ring in the item fill | Shown on the active item too. `sr-only`: `needs attention` |
| `Status off` on Project board | right edge 178, baseline 171 | `text-caption` 12/18 | muted | Only when `project` is missing |
| Pane title | 224, 75, 632, 24 | `text-title-small` 16/24, 600 | default | `GitHub` |
| Pane caption | 224, 103, 632, 18 | `text-caption` | muted | Invented copy |
| Connection card | 224, 137, 632, h | | `bgColor-default`, 1px `borderColor-default`, radius 6, padding 16 | h: none 424, required 392, optional 392, still 472, ok 312 |

The fields below the card are unchanged (help line, switch, Orgs rows, Add org, Searching), 20px under the card.

### Connection card (offsets from the card's top-left)

| Element | Box | Font | Colour | Truncation |
|---|---|---|---|---|
| `Connection` | 16, 16, auto, 22 | `text-body-medium-semibold` 14/20 | default | none |
| Status pill | right 616, 16, auto, 22 | 12/18, 600, 12px icon, padding 0 10, radius full | see Pill table | none |
| Who line | 16, 42, 600, 18 | `text-caption` | muted | ellipsis |
| Divider | 16, 72, 600, 1 | | `borderColor-muted` | |
| Column heads | 44 / 176 / 276, 84, 18 | `text-caption-semibold` | muted | `Scope`, `Need`, `Turns on` |
| Scope row (x3) | 16, 108 + 32n, 600, 32 | | | |
| Mark | 16, row + 8, 16, 16 | | see Marks | |
| Scope name | 44, baseline row + 20 | `text-codeBlock` 13, mono | default | none |
| Need | 176, baseline row + 20 | `text-caption` | muted | none |
| Turns on | 276, baseline row + 21 | `text-body-medium` 14/20 | default when granted, muted otherwise | ellipsis at 340 |
| Divider | 16, 212, 600, 1 | | `borderColor-muted` | |
| Result box (still) | 16, 228, 600, auto (64 for 2 lines) | 14/20 | `bgColor-danger-muted`, 1px `borderColor-danger-emphasis`, radius 6, padding 12 12 12 40, 16px `AlertIcon` at 14, 13 in `fgColor-danger` | wraps |
| Install line (none) | 16, 228, 600, 20 | 14/20 | default | wraps |
| Command label | 16, baseline + 19 | `text-caption-semibold` | muted | none |
| Copy | right 616, 28 tall, 80 wide | `.btn` at 12px, `CopyIcon` 16 | default button | none |
| Command box | 16, +36, 600, 38 | `text-codeBlock` 13/22 mono, padding 8 12 | `bgColor-inset`, 1px `borderColor-default`, radius 6 | `white-space: pre-wrap; overflow-wrap: anywhere`. Selectable text |
| Hint | 16, +8, 600, 18 | `text-caption` | muted | wraps |
| Check again | 16, +16, auto, 32 | `.btn-primary` 14/20, 600 | primary. In `ok` it is a default `.btn` | none |
| Last checked | right 616, baseline +20 | `text-caption` | muted | none |
| OK line (ok) | 16, 228; 16px `CheckIcon` in `fgColor-success`, text at 40 | 14/20 | default | wraps |

Key: `R` runs Check again while the dialog is open and focus is not in a text field. The cap follows the `keycaps` rule (hover, focus, Alt).
After Check again the pane scrolls the card's bottom edge into view (`scrollIntoView({ block: 'nearest' })` on the card), then focus returns to the button. B6 shows the result at scrollTop 41.

### Pill

| State | Label | Fill | Border | Text and icon |
|---|---|---|---|---|
| none, unknown | `Not connected`, `Scopes unknown` | `bgColor-neutral-muted` | 1px dashed `borderColor-emphasis` | muted, no icon |
| required | `Sync paused` | `bgColor-danger-muted` | `borderColor-danger-emphasis` | `fgColor-danger`, `AlertIcon` |
| optional | `Partly on` | `bgColor-attention-muted` | `borderColor-attention-emphasis` | `fgColor-attention`, no icon |
| ok | `All on` | `bgColor-success-muted` | `borderColor-success-emphasis` | `fgColor-success`, `CheckIcon` |

### Marks (16px desktop, 18px phone)

| Mark | Drawing | `aria-label` |
|---|---|---|
| Granted | `bgColor-success-emphasis` disc, white tick | `granted` |
| Required, missing | `borderColor-danger-emphasis` disc, white cross | `missing, required` |
| Optional, missing | 1.5px `fgColor-attention` ring, cross in the same colour | `missing, optional` |
| Unknown | 1.5px dashed `borderColor-emphasis` ring, `?` 12px 700 muted | `unknown` |

Fill versus ring versus dashed ring carries the state without colour.

### Topbar gear mark (B1, B2)

16px disc centred on the gear button's top-right corner (right edge minus 3, top plus 1). `!` 12/16, 700, white. Fill `borderColor-danger-emphasis` (`#da3633`; Primer's `bgColor-danger-emphasis` is not in `tokens.md` yet) for none and required, `bgColor-attention-emphasis` for optional. 2px ring in `bgColor-inset`. None for ok. The button's `aria-label` becomes `Settings, GitHub needs attention`. At 960 the gear stays (B2).

### List banners (list pane, 420 at 1660, 380 at 960)

Position: first child of the list body, under the filter row. `.banner` margin 12, padding 12, gap 12, radius 6. Main column 44 from the banner's left edge.

| Banner | Tone | Content | Height at 420 |
|---|---|---|---|
| None (B7) | `.banner-setup`: `bgColor-accent-muted`, `borderColor-accent-emphasis`, `InfoIcon` 20 in `fgColor-accent` | Title, one detail line, `Set up GitHub` primary | 102 |
| Required (B1, B8) | `.banner-error` | Title, one detail line, `Fix in Settings` primary, `Details` | 102 |
| Generic (B9) | `.banner-error` | `Sync failed`, message (3-line clamp), cached line, `Retry` `R`, `Details`, cache line | 184 with a 3-line message |
| Project off (B2) | `.quiet-note`: `bgColor-muted`, 1px `borderColor-muted`, radius 6, padding 8 12, `InfoIcon` 16 muted | Two `text-caption` lines, first 600; `Turn on` `.btn` 28 tall, 12px, right | 52 |

- Banner title `text-body-medium-semibold`, one line, ellipsis. Detail lines `text-caption`, muted, wrap.
- `Fix in Settings`, `Set up GitHub` and `Turn on` open Settings on GitHub (`initialSection: 'github'`), focus on Check again.
- Required `Details` toggles one `text-caption` line: `Token scopes: read:org, gist. Nod needs repo.`
- Below a paused or failed banner, one `text-caption` muted line `Cached 10:26 · actions off`, 26 tall, 16 left.
- None: the list shows `Nothing synced yet.` (14/20 muted, centred, 48 below the banner) instead of skeletons.

## Elements, phone (412x915)

### List banner (B10, B11, B15 under the sheet; B12, B15 in the list)

Slot: after the chip row, before the sync line, margin 8 12. Reuses `.ph-error` (padding 16, radius 12, 1.5px border, icon 32, gap 12). Main column x 72, width 312.

| Element | Font | Notes |
|---|---|---|
| Title | 16/24, 600 | one line, ellipsis |
| Body | 14/20 | 3-line clamp (existing `.ph-error-body`) |
| Cached line (generic) | 13/18 muted | |
| Actions | `.ph-btn`, 48 tall, 15px | None and required: `How to fix` primary. Generic: `Retry`, `Details` |

Project off is a `.quiet-note` row: x 12, w 388, h 72, radius 12, `bgColor-muted`, `InfoIcon` 16 at 28, 16; title 14/20 600 and body 13/18 muted at x 52; `Turn on` `.ph-btn` 92x44 right, 14 from the top.
Sync line under a paused or failed banner reads `Cached 10:26 · actions off` (existing `cachedLine` in `PhoneApp.tsx`).

### Connection sheet (B10, B11, B13, B14)

`.ph-scrim` over the list, `.ph-asheet` at the bottom. Height fits the content up to the 116px top limit; past it the body scrolls (scroll owner `.ph-asheet-body`).

| Element | Box | Font | Colour |
|---|---|---|---|
| Sheet | 0, top, 412, to the bottom; radius 20 20 0 0 | | `bgColor-default` |
| Title | 16, top + 12, auto, 24 | 16/24, 600 | default, ellipsis |
| Pill | right 396, top + 13 | as desktop | |
| Who line | 16, body + 0, 380, 18 | 13/18 | muted |
| Scope row (x3) | 16, 60 tall | mark 18 at 16, row + 12; name 14 mono at 48, baseline +26; Need 13 muted right at 396; Turns on 13/18 at 48, baseline +46 (default when granted, else muted) | |
| Result box (still) | 16, w 380 | 14/20 | as desktop |
| Command label | 16, 44 tall row | 13/18, 600, muted: `Run on the computer running Nod` | |
| Copy | right 396, 92x44 | `.ph-btn` 15px with `CopyIcon` | |
| Command box | 16, w 380, h 40 | 13 mono, padding 10 12 | as desktop; wraps anywhere when wider |
| Hint, Last checked | 16, w 380 | 13/18 muted | wraps |
| Action bar | 0, bottom 76, 412, 76 | | `.ph-actionbar`: `bgColor-inset`, top border |
| Close, Check again | 16 and 212, w 184, h 48 | `.ph-btn` 15px | Check again primary; default in `ok` |

Sheet tops in the mockup: B10 345, B11 397, B13 511, B14 297.
Close and the scrim tap close the sheet. After a successful Check again the sheet stays open showing all ticks (B13) until Close.

## Default and other states, per surface

| Surface | Default | Other states |
|---|---|---|
| Connection card | Shown on every Settings open, whatever the state | Busy (spinner on Check again), copied (check on Copy, 1.5s), result box after an unchanged check |
| Gear mark | Hidden | Danger `!`, attention `!` |
| Nav mark | Hidden | As the gear mark |
| List banner | Hidden | None, required, generic, quiet note |
| Phone sheet | Closed | Open per state; body scrolls when taller than 799 |

## Strings

Desktop and shared:

- `GitHub`
- `The account Nod signs in as, and the orgs it watches.`
- `Connection`
- `Not connected`, `Sync paused`, `Partly on`, `All on`, `Scopes unknown`
- `No token. gh is not installed, or not logged in.`
- `acme-dev on github.com · token from gh` (`<login> on github.com · token from gh` or `· token from GH_TOKEN`)
- `Scope`, `Need`, `Turns on`
- `repo`, `read:org`, `project`
- `Required`, `Optional`
- `PRs, issues, checks, replies`
- `Team review requests`
- `Issue Status, Move to In progress`
- `Install gh from cli.github.com if it is missing, then log in with the scopes Nod uses.`
- `Run in a terminal on this computer`
- `Copy`
- `gh auth login -s project`
- `gh auth refresh -h github.com -s <missing scopes>`
- `gh opens github.com in your browser to approve. No restart needed.`
- `Check again`
- `Last checked 10:26`
- `Checked 10:42. Still missing repo. gh gave Nod the same token, so finish the command and approve in the browser.`
- `Checked 10:42. The new token is still missing repo.`
- `Checked 10:41. Nod picked up the new token. Issue Status is on.`
- `Nod reads GH_TOKEN. Give that token the missing scopes, or unset it and run gh auth login -s project.`
- `Status off`
- `Nod is not connected to GitHub`
- `No GitHub token, so nothing can sync yet.`
- `Set up GitHub`
- `GitHub token is missing repo` (`GitHub token is missing <first missing required scope>`)
- `Sync is paused. Showing cached data from 10:26.`
- `Fix in Settings`
- `Details`
- `Token scopes: read:org, gist. Nod needs repo.`
- `Project Status is off.`
- `Token has no project scope.`
- `Turn on`
- `Cached 10:26 · actions off`
- `Nothing synced yet.`
- `Sync failed`
- `Showing cached data from 10:26. Nothing was lost.`
- `Retry`
- `Reads work from cache. Actions retry once the API answers.`
- `Settings, GitHub needs attention` (gear `aria-label`)
- `needs attention` (nav mark, `sr-only`)
- `granted`, `missing, required`, `missing, optional`, `unknown` (mark labels)

Phone only:

- `GitHub connection`
- `The computer running Nod has no GitHub token.`
- `How to fix`
- `Run on the computer running Nod`
- `Close`

Sample GitHub message (B9, B15), quoted from GitHub's GraphQL error: `Something went wrong while executing your query. This may be the result of a timeout, or it could be a GitHub bug.`

## Invented copy

- `The account Nod signs in as, and the orgs it watches.` (replaces the pane caption; the old caption moves under the card unchanged)
- `Scopes unknown`
- `Team review requests`
- `Install gh from cli.github.com if it is missing, then log in with the scopes Nod uses.`
- `gh opens github.com in your browser to approve. No restart needed.`
- `Checked 10:42. Still missing repo. gh gave Nod the same token, so finish the command and approve in the browser.`
- `Checked 10:42. The new token is still missing repo.`
- `Checked 10:41. Nod picked up the new token. Issue Status is on.`
- `Nod reads GH_TOKEN. Give that token the missing scopes, or unset it and run gh auth login -s project.`
- `Token scopes: read:org, gist. Nod needs repo.`
- `Nothing synced yet.`
- `The computer running Nod has no GitHub token.`
- `How to fix`
- `Settings, GitHub needs attention`, `needs attention`, and the four mark labels

## Judgement calls

- `read:org` moved to Optional (see the scope table). The required-missing example is now `repo`, so B1, B8, B11 and B14 say `repo`.
- Missing `repo` pauses sync instead of syncing public repos only, so private PRs are not marked gone.
- The Settings dialog stays 880x640. The Connection card is taller than the wireframe allowed for, so the pane scrolls and the fields sit below the fold. Check again scrolls into view after a check.
- The phone uses the existing bottom sheet (`.ph-asheet`) with a pinned action bar so Check again never scrolls away.
- First run uses the accent tone, not danger. Nothing failed yet.
- Key caps on Check again and Retry follow the comfortable `keycaps` rule, so the mockup draws them hidden.
