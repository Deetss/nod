# Dispatch all spec (round 2, layout A)

Mockup: `dispatch-all-mockup.svg` and `.png` (dark, frames A1 to A18). Wireframe: `dispatch-all-wireframe-A.svg` (picked).
Tokens: `tokens.md`, `density-tokens.md`. Minimum font 12px (`constraints.md`). Desktop boxes are x, y, w, h in the crop of the 1660x870 window (crop x 379 to 1179) unless marked window. Narrow is the 1122x870 window (crop x 259 to 899). Phone boxes are at 412x915.

## Behaviour

- `Dispatch all` sits in the merge banner beside `Hand all to <bot>`. Desktop key `S`.
- It opens one confirm: the ticked findings, the target, one editable prompt. Desktop: dialog. Phone: bottom sheet.
- The target follows `findingSender`'s three paths. One linked session: send to it. Several candidates: choose one. None: a new worktree on the PR head.
- One send or one dispatch carries every ticked finding. It succeeds or fails as a whole.
- Success closes the confirm. Every ticked card gets the same spent `Dispatched` button and status line that single Dispatch gives today.
- Shown only when the banner is blocked, `findingSender` is defined (Orca on and able to take a message for this PR) and at least 2 findings are open. Hidden, not disabled, otherwise (A8, A18).
- Human threads never appear in the list. Resolved findings never appear.
- Unticking a row rebuilds the prompt, unless the user has edited it. After an edit, ticks still change the count and the button, and a muted line under the prompt says `Ticks changed. Rebuild prompt` (the second part a link button). Not drawn.

## Combined prompt

The send route takes one line of at most `SEND_MAX` (600) characters (`prepareSend` collapses newlines). A numbered multi-line prompt is not possible, so the prompt is one tagged line. The worktree path uses the same 600 cap, as the phone finding dispatch already does (`max={SEND_MAX}`).

New `dispatchAllText(findings, repo, number)` in `shared/findings.ts`, next to `dispatchText`:

- 1 ticked finding: exactly `dispatchText(f, repo, number)`.
- 2 or more: `[nod] {n} review findings on {repo}#{number}. ` then, per finding in list order, `({i}) {severity}, {path}:{line}: {text} {url}`, joined by one space.
- `severity` is the lower-case `f.severity`, as `dispatchText` writes it. `text` is `oneLine(f.text)`. `repo` and `where` go through `cleanField` with the `dispatchText` limits (100, 160).
- Over 600: links stay whole. Each finding's text is cut to an equal share of the room left, ending `...`. If the heads and links alone pass 600, the primary button is disabled and the counter shows `too long`.
- Fixture result: 553 characters for both findings (A2), 306 for the Blocker alone (A3).

```
[nod] 2 review findings on acme-co/orders-api#365. (1) blocker, db/migrate/20261113000000_add_amounts.rb:12: The diff adds the new migration without deleting the old version, so the duplicate version remains and migration loading still fails. https://github.com/acme-co/orders-api/pull/365#discussion_r2234567891 (2) major, db/migrate/20261113000000_add_amounts.rb:31: Rolling back the new migration drops the existing parcels table on a database where the old migration already ran. https://github.com/acme-co/orders-api/pull/365#discussion_r2234567892
```

## Reuse

| Part | Reuse or extend | Source |
|---|---|---|
| Banner | Extend `FindingBanner`: new props `canDispatch`, `onDispatchAll`, `dispatchCap`. With both buttons, wrap them into a new `.finding-banner-actions` row. One button keeps today's single row. | `web/FindingParts.tsx`, `web/findings.css` |
| Banner buttons | `.btn.finding-btn.finding-banner-btn` and `KeyCap`, as Hand all today | `web/FindingParts.tsx`, `web/base.css` |
| Desktop dialog shell | Extend `BulkDialog` into a shared bulk shell (head, ticked rows, actions, focus trap, Esc). Hand all keeps its body; Dispatch all adds target and prompt. Class `dialog dispatch-dialog finding-bulk finding-dispatch-all` (560 wide from `.dispatch-dialog`). | `web/FindingParts.tsx`, `web/issues.css`, `web/detail.css` |
| Finding rows | `.finding-bulk-rows`, `.finding-bulk-row`, `.finding-bulk-check`, `SeverityBadge`. Preview text changes (below); markup does not. | `web/FindingParts.tsx`, `web/findings.css` |
| Session row (linked) | Desktop: new `.dispatch-all-session` matching `.ph-fit-session` (dot, mono name, `Linked` pill), plus the `STATE_WORD` on the right. Phone: `.ph-fit-session` as is. | `web/phone/phone-fit.css`, `shared/orca-sessions.ts` |
| Session choice (desktop) | Inline in the dialog. Rows reuse `SessionPicker`'s `Row` markup (`.picker-row.picker-row-2`, `orca-group` headers) with a radio. Export `Row` rather than copy it. | `web/orca/SessionPicker.tsx` |
| Session choice (phone) | `PhoneSessionPicker` unchanged, opened first (as `findingSender` does now). `Remember and continue` opens the A12 sheet with that session. | `web/phone/PhoneSessionPicker.tsx` |
| Worktree fields | Desktop: the `DispatchDialog` field block (Agent, `ModelFields`, Worktree name, locked Head branch). Lift it into a `DispatchFields` component used by both dialogs; Agent and Worktree name sit in one `.dp-model-row` grid. Phone: `PhoneFixDispatch` fields. | `web/issues/IssueDialogs.tsx`, `web/orca/ModelFields.tsx`, `web/phone/PhoneFix.tsx` |
| Prompt and counter | Desktop: `.dispatch-dialog textarea` (12/18 mono) and `.orca-counter`. Phone: `.ph-fit-area`, `.ph-fit-counter`. | `web/issues.css`, `web/orca.css`, `web/phone/phone-fit.css` |
| Errors | Desktop: `StatusLine tone="err"` inside the dialog. Phone: `PhoneSheetError`. | `web/FindingParts.tsx`, `web/phone/PhoneFitSheet.tsx` |
| Phone sheet | `PhoneFitSheet` (keyboard inset, content height, `.is-fit`) and `PhoneSheetBar` | `web/phone/PhoneFitSheet.tsx`, `web/phone/phone-sheets.css` |
| Send | `doSend` in `useOrca` with one tag per ticked finding. New `findingSender.sendAll(text, tags, target)`; `onFindingResult` runs once per tag. | `web/orca/useOrca.tsx`, `web/useFindings.ts` |
| Dispatch | `confirmDispatch` (`orcaDispatch`, `pr: true`, `baseBranch: headRef`); `onFindingDispatched` once per tag | `web/orca/useOrca.tsx` |
| Cards afterwards | Unchanged: `FindingBtn spent`, `StatusLine tone="ok"` | `web/FindingList.tsx` |
| Toast | Desktop `.toast` (success). Phone `.ph-toast`. | `web/detail.css`, `web/phone/phone-sheets.css` |

New state lives in `useFindings` beside `bulk`: `dispatchAll: { rows, text, edited, busy, error } | undefined`, with `openDispatchAll`, `toggleDispatchAll`, `closeDispatchAll`.

## Desktop page (A1, A7 to A9)

The detail pane is drawn scrolled to the Thread card. Pane: crop 21 to 501 (480). Narrow: 21 to 381 (360).

| Element | Box normal / narrow | Font | Colour tokens | Truncation and states |
|---|---|---|---|---|
| Thread header | 21,48,480,40 / 21,48,360,40 | 12/600 caps, count 12/400 | `fgColor-muted`, rule `borderColor-muted` | `THREAD`, `4 items`. Unchanged |
| Banner, two buttons | 32,98,458,80 / 32,98,338,80 | | `bgColor-danger-muted`, `borderColor-danger-emphasis`, radius 6 | Padding 8 8 8 12. Row 1 is 28 high, row 2 starts at y+44. Sticky top 0, as today |
| Banner icon | x+12, y+14, 16 | | `fgColor-danger` | `OctagonIcon size 16` |
| `Merge blocked` | x+38, baseline y+27 | 14/600 (`text-body-medium-semibold`) | `fgColor-default` | nowrap |
| Sub | after title +8 | 12/400 (`text-caption`) | `fgColor-muted` | ellipsis. `3 unresolved`; after a send `3 unresolved · 2 sent to Orca` |
| `Hand all to review-bot` | x+12, y+44, 160x28 | 12/400 | `button-default-bgColor-rest`, `borderColor-default`, radius 6 | key cap `H`. Hidden when the bot is off |
| `Dispatch all` | x+180, y+44, 106x28 | 12/400 | same | key cap `S`. Gap 8. If the bot name is long, the row wraps and Dispatch all drops to a third row (`flex-wrap`) |
| Banner, one button | 32,98,458,44 | | as today | Orca off or 1 open finding: Hand all only. Bot off: `No bot set` note then Dispatch all, right aligned |
| Finding cards | x 32, w 458 / 338. Normal heights 156 and 156; 188 with a status line | | as today | Unchanged |
| Key caps in banner | 18 high, min 18 wide | 12 mono | `bgColor-default`, `borderColor-default`, `fgColor-muted` | Kept at narrow: both buttons fit in 338 (A9) |
| Footer | 0,842,window,28 | 12 | kbd as above, labels `fgColor-muted` | Finding footer keeps 6 entries: `H` and `S` share one, `hand all / dispatch all` (narrow `all`) |
| Toast (A7) | window right 16, bottom 44, 40 high | 14/400 | `bgColor-success-muted`, `borderColor-success-emphasis`, icon `fgColor-success` | `Dispatched 2 findings to fix-migration-365`. Drawn at the crop edge |

Scroll owner: the detail pane. The banner stays sticky.

## Desktop dialog (A2 to A6, A10)

Width 560 (`.dispatch-dialog`), padding 20, inner 520. Centred on the window: x 550 in the 1660 window (crop 171), x 281 in the 1122 window (crop 22). Vertically centred by `.scrim`. Heights at the fixtures: linked 564, failed 600, picker 750, worktree 784, worktree failed 820.

Max height `calc(100vh - 32px)`. Past that the middle (rows, target, prompt) scrolls and the head and actions stay pinned: `.finding-dispatch-all { max-height; display: flex }`, middle `overflow-y: auto`. At the fixtures nothing scrolls. 3 or more findings in the worktree path will.

Offsets below are from the dialog's top-left (linked variant; other variants differ only from `Send to` down).

| Element | Box | Font | Colour tokens | Truncation and states |
|---|---|---|---|---|
| Dialog | 0,0,560,h | | `bgColor-default`, `borderColor-default`, radius 6. Scrim `#010409b3` | |
| Title | 20,20,400,24 | 16/600 (`text-title-small`) | `fgColor-default` | `Dispatch 2 findings to Orca`; singular for 1. One line |
| PR label | right, baseline 37 | 12/400 | `fgColor-muted` | `acme-co/orders-api #365` |
| Intro | 20,56,520,18 | 12/400 | `fgColor-muted` | `One prompt with every ticked finding. Human threads are left out.` |
| `Findings` label | 20,86,520,18 | 12/600 (`.field-label`) | `fgColor-default` | right: `2 of 2 ticked`, 12/400 muted |
| Finding row | 20,108+32i,520,32 | | | `.finding-bulk-row`, gap 12 |
| Checkbox | x 20, 16x16 | | on: `bgColor-accent-emphasis`; off: `borderColor-emphasis` outline | Sending: on rows turn `borderColor-emphasis` filled, disabled |
| Severity | after check +8 | 12/600 | `.sev-badge` | |
| Name | after badge +12 | 12 mono | `fgColor-default`; unticked `fgColor-muted` | `20261113000000_add_amounts.rb:12`, the file name and line. Full path in `title` |
| Text | after name +10, to row end | 12/400 | `fgColor-muted` | one line, ellipsis. `title` holds the full text |
| `Send to` label | 20,184,520,18 | 12/600 | `fgColor-default` | `Dispatch to` on the worktree path |
| Session row | 20,206,520,40 | name 13/600 mono, pill 12, state 12 | `bgColor-default`, `borderColor-default`, radius 6; dot `fgColor-accent`; pill `bgColor-neutral-muted`, `borderColor-muted` | Name ellipsis. Sending: dashed border, dot and name muted, name 400 |
| `Change` | right end of the session row | 12 | `.finding-btn` | Only when another candidate exists. Not shown at the fixtures (one session for #365). Swaps the row for the picker block |
| Picker block (A3) | 20,206,520,204 | groups 12/600 caps; name 13/600 mono; state, reason 12/400; hint 12/600 | groups `bgColor-muted`; selected row `bgColor-accent-muted`, 2px `borderColor-accent-emphasis`; radio `fgColor-accent` / `borderColor-emphasis`; hint `fgColor-accent` | Rows 52. `RELATED` `2 match`, `POSSIBLE`. Right of label: `2 related, 1 possible`. Up and Down move, as `SessionPicker` |
| Picker note | under block +4 | 12/400 | `fgColor-muted` | `Your choice is remembered for this PR. A possible match only gets the message you send now.` Picking a related row calls `orcaChoose` on send; a possible row is send-once |
| Worktree block (A4, A10) | from 206: note 18, then Agent and Worktree name (two columns 254, 32 high), Model and Effort, model note, Head branch 32 + note | labels 12/600; values 14/400, name and branch mono | fields `bgColor-default`, `borderColor-default`, radius 6; locked dashed and `fgColor-muted` | Note: `No Orca session linked to PR #365. A new worktree opens on the PR head.` Name default `pr-365-findings`. Head branch `feature/365`, locked, with the existing note |
| `Prompt` label | 20,258,520,18 | 12/600 | `fgColor-default` | |
| Prompt | 20,280,520,198 (10 rows) | 12/18 mono (`text-codeInline`), padding 8 12 | `bgColor-default`, `borderColor-default`; focus `borderColor-accent-emphasis` | Wraps; long URLs break anywhere. Scrolls inside past 10 rows. Sending: read-only, dashed, `fgColor-muted` |
| Counter | 20,482,520,18 | 12/400 | `fgColor-muted`; over: `fgColor-danger` 600 | Left `Edit before sending.` / `Edit before dispatching.`; sending `Fields are locked while sending.` Right `553 / 600`, over adds `too long` |
| Error (A6) | 20,512,520,24 | 12/400 | `fgColor-danger`, alert icon | `StatusLine tone="err"`. Wraps. Moves actions down by 36 |
| Cancel | right of primary −8, 32 high | 14/400 | `button-default-bgColor-rest` | cap `Esc`. Sending: dashed, `fgColor-muted`, inert |
| Primary | right, 32 high | 14/600 | `button-primary-bgColor-rest`, white; cap outline `fgColor-onEmphasis` | `Send 2` / `Dispatch 2` + `Ctrl+Enter`. Sending: spinner + `Sending...` / `Dispatching...`, no cap, `aria-busy`. Failed: `Retry`. Disabled at 0 ticked or over 600 |

Keys: `Esc` cancels (not while busy). `Ctrl+Enter` confirms from anywhere in the dialog, as `SendDialog`. Focus starts on the primary button.

## Phone page (A11, A17, A18)

| Element | Box | Font | Colour tokens | Truncation and states |
|---|---|---|---|---|
| Header, tabs | as `large-title-spec.md` collapsed | | | Unchanged. `Thread 4` |
| Banner, two buttons | 12,137,388,104 | title 15/600, sub 13/400 | `bgColor-danger-muted`, `borderColor-danger-emphasis`, radius 8 | Padding 6 6 6 12. Icon 16 at 24,157 |
| `Merge blocked` | 51, baseline 163 | 15/600 | `fgColor-default` | |
| Sub | 51, baseline 181 | 13/400 | `fgColor-muted` | ellipsis. After a send `3 unresolved · 2 sent to Orca` |
| Banner buttons | 18,191,184,44 and 210,191,184,44 | 15/400 | `button-default-bgColor-rest`, `borderColor-default`, radius 10 | `Hand all to review-bot`, `Dispatch all`. Label ellipsis. Actions row has `margin-left: -6px` so both sides are 6 |
| Banner, one button | 12,137,388,57 | | as today | Button right, natural width. Bot off: `No bot set` 13/400 muted left of `Dispatch all` |
| Cards | x 12, w 388; heights 246 and 226 at the fixtures | | as today | Unchanged |
| Toast (A17) | 16,773,380,46 | 15/400 | `bgColor-neutral-emphasis`, `fgColor-onEmphasis`, radius 10 | `Dispatched 2 findings to fix-migration-365`. `.ph-toast` |

## Phone sheet (A12, A14 to A16)

Shell is `PhoneFitSheet`: content height, bottom on the scrim, which ends on the keyboard. Max height is the screen (`--ph-top` is 0). Head 69, action bar 76.

| Element | Box (sheet-relative) | Font | Colour tokens | Truncation and states |
|---|---|---|---|---|
| Sheet | top 262 (A12, height 653); top 40 (worktree, 875); full height when the body overflows (A14, A16) | | `bgColor-default`, 2px top edge `borderColor-default`, radius 20 | Scrim `#010409` at 60% |
| Title | 16,12 to 340 | 17/600 | `fgColor-default` | `Dispatch 2 findings to Orca`, ellipsis |
| Sub | 16, under title | 13/400 | `fgColor-muted` | `acme-co/orders-api #365` |
| Close | circle 44 at 354,18 | | as other sheets | Disabled while busy |
| `Findings` label | 16,81,380,18 | 12/400 | `fgColor-muted` | right `2 of 2 ticked` |
| Finding row | 0,103+56i,412,56 | | divider `borderColor-muted` from x 48 | Phone variant of `.finding-bulk-row` (`.finding-bulk.is-phone` min-height 44 grows to 56) |
| Checkbox | 16, row+18, 20x20 | | as desktop | 44px hit area (whole row toggles) |
| Badge, name | 48, row+6; name after badge +10 | 12/600; 12 mono | as desktop | Name ellipsis |
| Text | 48, baseline row+46, to 396 | 13/400 | `fgColor-muted` | one line, ellipsis |
| `Session` label, row | 16,227; row 16,249,380,48 | 14/600 mono | `.ph-fit-session` | Locked while sending |
| Worktree block | from 227: `Dispatch to`, note, Agent, Worktree name, Head branch (44 high each, 16/400) and the locked note | | `.ph-fit-form` fields | Name default `pr-365-findings`. Focus ring `borderColor-accent-emphasis` (A14) |
| `Prompt` label, area | label then 16,y,380,200 | 13/20 mono, padding 10 | `.ph-fit-area` | Area scrolls inside past 9 lines (the fixture prompt is 13). Locked: dashed, muted |
| Counter | under the area +4 | 12/400 | `.ph-fit-counter` | `Edit before sending.` / `Edit before dispatching.`; locked `Fields are locked while sending.`; right `553 / 600` |
| Error (A16) | 16, counter+30, 380, 38 | 12/400 | `.ph-fit-error` | `Dispatch failed: Worktree pr-365-findings already exists`. Session path: `Not sent: fix-migration-365 is showing a prompt. Your text is kept.` |
| Cancel, primary | `PhoneSheetBar`, two 186x48 | 15 | as other sheets | `Send 2` / `Dispatch 2`; `Sending...` / `Dispatching...` with spinner; `Retry` |

Scroll owner: `.ph-sheet-body`. The action bar never scrolls. When the keyboard opens (A14) the sheet bottom moves to the keyboard top, the body shrinks to the space left, and the focused field scrolls into view. After a failure the body scrolls to the error (A16).

Picker (A13): `PhoneSessionPicker` exactly as built (title `Choose a session for #365`, `2 related, 1 possible`, `Remember and continue`).

## Sent cards (A7, A17)

- Button: `Dispatched`, spent (dashed `borderColor-emphasis`, check, `fgColor-muted`). Same for the send and worktree paths, as today.
- Status line: `Sent to fix-migration-365, confirmed 09:42` per ticked card. Worktree path: `Dispatched to pr-365-findings, confirmed 09:42`. The existing `StatusLine` copy, unchanged.
- An unconfirmed or failed send writes the existing `sendFailure` line on every ticked card, with Retry reopening Dispatch all with the same ticks and text.
- Unticked cards do not change. Dispatch all stays available for a second round.

## Keys

- `S` opens Dispatch all from anywhere in the finding list, like `H`. It is free in PRs; in Issues `S` is start / stop work. Help adds `S dispatch all findings to Orca (in Issues, S is start / stop work)`.
- `FOOTER_FINDINGS`: replace `{ keys: 'H', label: 'hand all' }` with `{ keys: 'H S', label: 'hand all / dispatch all' }`, so the footer keeps 6 entries.

## Constraint checks

- All text is 12px or larger. Smallest: captions, key caps and footer at 12.
- Nothing relies on colour alone: unticked rows are an empty box; locked fields are dashed plus a note; spent buttons are dashed with a check; errors have an icon and a dashed block (phone).
- Every action has a button and, on desktop, a key hint (`S`, `Esc`, `Ctrl+Enter`).

## Invented content

- Desktop worktree default name `pr-365-findings` (single Dispatch uses `pr-365-finding` on desktop and `pr-365` on phone).
- Session `review-365` (done, linked PR #365) in the picker frames A3 and A13. It is not in `server/orca-fake.ts`, which links only `fix-migration-365` to #365; it matches the built finding-dispatch picker capture. `crew-310` is from `orca-fake.ts`.
- Copy: `One prompt with every ticked finding. Human threads are left out.`, `2 of 2 ticked`, `Dispatch to`, `No Orca session linked to PR #365. A new worktree opens on the PR head.` (phone: `No session linked to PR #365. New worktree on the PR head.`), the picker note, `3 unresolved · 2 sent to Orca`, `Dispatched 2 findings to fix-migration-365` (plural of the existing `Dispatched finding to {name}`), `Ticks changed. Rebuild prompt` (not drawn).
- `Dispatch failed: Worktree pr-365-findings already exists`, as in the finding-dispatch mockup.
- Clock `09:42`.
- The synthetic third finding from the wireframe is dropped. The fixtures have 2 open findings on #365, which is enough to show Dispatch all.
- The diff pane lines are grey bars, not code.
