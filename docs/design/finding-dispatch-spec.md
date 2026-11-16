# Phone finding dispatch spec (round 2, layout A)

Mockup: `finding-dispatch-mockup-phone.svg` and `.png` (dark, 412x915, frames A1 to A8). Generator: `tools/gen_finding_mock.py`.
Wireframe: `finding-dispatch-wireframe-A-phone.svg` (picked). Colour and type tokens: `tokens.md`. Minimum font 12px (`constraints.md`). All boxes are x, y, w, h at 412x915.

## Behaviour

- Phone only. `Dispatch` on a finding card opens one bottom sheet over the Thread tab. The desktop is unchanged.
- Job 1, one linked session: Send sheet (A1 to A3). Job 2, several candidates: Picker sheet (A4), then the Send sheet. Job 3, no session: Dispatch sheet (A5 to A7).
- Success closes the sheet. The card button becomes spent and a status line names the target (A8). Existing `useFindings.dispatch` and `onSendResult` already do this for jobs 1 and 2.
- Job 3 posts `orcaDispatch({ repo, number, agent, name, baseBranch: headRef, prompt, pr: true })`, the same call as the PR dispatch.

## Reuse

| Sheet | Reuse or extend | Source |
|---|---|---|
| Send (Job 1) | Extend `SendDialog` logic (text, 600 cap, Cancel/Send, busy) in a phone sheet. Not reused as-is: it is a desktop `.dialog` with Start-from chips and Ctrl+Enter. | `web/orca/SendDialog.tsx` |
| Picker (Job 2) | Reuse `SessionPicker` data (`related`, `possible`, `title`, `onChoose`, `onSendOnce`) and `SessionView` rows. New phone markup with `.ph-pk-row` rows. | `web/orca/SessionPicker.tsx`, `web/phone/phone-picker.css` |
| Dispatch (Job 3) | Reuse `PhoneFixDispatch` for fields, validation (`NAME_RE`, `COMMENT_MAX`), busy and error. Change only its container (below). | `web/phone/PhoneFix.tsx` |
| Sheet shell | Extend `PhoneSheet`: `.ph-sheet`, `.ph-handle`, `.ph-sheet-head`, `.ph-sheet-body`, `.ph-actionbar`. New: a content-height variant (`inset` set by height, not `var(--ph-top)`). | `web/phone/PhoneSheet.tsx`, `web/phone/phone-sheets.css` |
| Finding card | Unchanged. `.finding`, `.finding-btn`, `.finding-btn.is-spent`, `.finding-status`. | `web/FindingList.tsx`, `web/FindingParts.tsx`, `web/findings.css` |
| Icon buttons | Round 44px, as the header back and More buttons. The close button is new, same size and style. | `web/phone/PhoneIcons.tsx` (`CloseIcon`) |

`PhoneFixDispatch` change for job 3: render inside the bottom sheet, not `.ph-scrim.is-center` / `.ph-confirm`. The head ref prop is the fixture value `feature/365` (`headRefOf` in `server/fixture-data.ts`). Default worktree name is `prWorktreeName(365)` = `pr-365`. The prompt is prefilled with `dispatchText(finding, repo, number)` instead of `prDispatchPrompt`.

## Page under the sheet (all frames)

| Element | Box | Font | Colour tokens | Notes |
|---|---|---|---|---|
| Header | 0,0,412,64 | | `bgColor-default`, bottom `borderColor-default` | |
| Back button | circle 44, centre 36,32 | glyph stroke 2 | fill `button-default-bgColor-rest`, `borderColor-default`, glyph `fgColor-default` | round, chevron centred |
| Title | 72,12,278,24 | 16/600 | `fgColor-default` | `acme-co/orders-api #365`, one line |
| Subtitle | 72,34,278,18 | 13/400 | `fgColor-muted` | `fix: resolve duplicate migration version`, ellipsis |
| More button | circle 44, centre 376,32 | three 4px dots | as back | round |
| Open chip | 16,74,52,22 | 12/600 | `fgColor-onEmphasis` on `bgColor-open-emphasis` | |
| Tabs | 0,102,412,48, four 103px columns | 15, active 600 | active `fgColor-default`, others `fgColor-muted` | `Overview`, `Files 0/2`, `Thread 4`, `Checks`. Underline 206,147,103,3 `bgColor-accent-emphasis`. Rule `borderColor-muted` |
| Finding card 1 (Blocker) | 11,161,390,176 | | `bgColor-default`, `borderColor-default`, radius 6 | `.finding`, padding 12, gap 8 |
| Finding card 2 (Major) | 11,345,390,176 | | same | |
| Human thread card (riley-k) | 11,529,390,136 | | same | existing `.finding-human` |
| Severity chip | card x+12, y+12, w text+20, 22 | 12/600 | Blocker `bgColor-danger-emphasis` fill, white text. Major `bgColor-attention-muted`, `borderColor-attention-emphasis`, second ring | `.sev-badge` |
| Bot chip | after severity, +6 gap, 22 high | 12/400 | `bgColor-neutral-muted`, `borderColor-muted`, `fgColor-muted` | `.bot-chip`, max 160, ellipsis |
| State | right aligned in head row | 12/400 | `fgColor-muted` | `Unresolved`, `.finding-state` |
| Path | card x+12, 18 high | 12 mono | `fgColor-muted` | `db/migrate/20261113000000_add_amounts.rb:12` (`:31` on the Major card), ellipsis. `.finding-path` |
| Body | 366 wide, 20/line | 14/400 | `fgColor-default` | wraps, clamps at 5 lines with `Show more`. `.finding-body` |
| Action buttons | 28 high, padding 0 10, gap 8, natural width | 12/400 | `button-default-bgColor-rest`, `borderColor-default`, radius 6 | `Hand to bot`, `Dispatch`, `Reply`, `Resolve`. `.finding-btn` |

Scroll owner: the PR sheet body scrolls (`.ph-sheet-body`). While a dispatch sheet is open the page is covered by a scrim (`#010409` at 60%, `.ph-scrim`) and does not scroll.

## Shared sheet shell (A1 to A7)

| Element | Box (sheet-relative) | Font | Colour tokens |
|---|---|---|---|
| Sheet | 0,0 to 412 wide, height by content, bottom at frame bottom (or top of keyboard). Radius 20 top. | | `bgColor-default`, 2px top edge `borderColor-default` |
| Handle | 188,8,36,4 | | `borderColor-emphasis` |
| Header | 0,12,412,56 | | bottom rule `borderColor-default` |
| Title | 16,12 to 340, 24 | 17/600 | `fgColor-default`, one line, ellipsis (`.ph-sheet-title`) |
| Sub | 16, under title, 18 | 13/400 | `fgColor-muted`, one line, ellipsis (`.ph-sheet-sub`) |
| Close button | circle 44, centre 376,40 | glyph stroke 2 | as header buttons. Closes and cancels. Disabled while busy. |
| Body | 0,68 to action bar | | scrolls (`overflow-y: auto`, `overscroll-behavior: contain`) |
| Action bar | 0, bottom-76, 412, 76 | | `bgColor-inset`, top rule `borderColor-default`. Pinned, never scrolls. `.ph-actionbar` |
| Buttons | 48 high, y +14, gap 8, two equal columns (186) | 15 | Cancel `button-default-bgColor-rest`. Primary `button-primary-bgColor-rest`, 600, white. `.ph-btn`, `.ph-btn.is-primary` |

Keyboard rule: the sheet is positioned by `useKeyboardInset` / `keyboardHeight` (`PhoneSheet` prop), so its bottom sits on the keyboard top. The body shrinks and scrolls, the action bar stays visible. A1 shows a 300px keyboard.

Field styles: text 16 (select, input) or 13/20 mono (message, prompt), `bgColor-default`, `borderColor-default`, radius 8. Focus is a 2px `borderColor-accent-emphasis` ring. Locked, busy or read-only fields use a dashed `borderColor-default` and `fgColor-muted` text (the tokens.md disabled rule), plus a text note.

## A1 to A3: Send sheet (Job 1)

Heights at the fixture text (9 message lines): A1 494, A2 494, A3 566. Tops: A1 121 (keyboard from 615), A2 421, A3 349.

| Element | Box (sheet-relative) | Font | Colour tokens | Truncation | States |
|---|---|---|---|---|---|
| Title | `Send to Orca session` | 17/600 | `fgColor-default` | ellipsis | |
| Sub | `db/migrate/20261113000000_add_amounts.rb:12` | 13/400 | `fgColor-muted` | ellipsis | |
| Label `Session` | 16,80,380,18 | 12/400 | `fgColor-muted` | | |
| Session field | 16,102,380,48 | | `bgColor-default`, `borderColor-default` | | Locked while sending (dashed, muted) |
| Session name | x 50, mono | 14/600 | `fgColor-default` | ellipsis | `fix-migration-365`. Dot 10px `fgColor-accent` at x 29. 400 and muted when locked |
| `Linked` pill | right aligned, 22 high | 12/400 | `bgColor-neutral-muted`, `borderColor-muted`, `fgColor-muted` | | `Linked` for related, `Possible` for a send-once pick |
| Label `Message` | 16,162,380,18 | 12/400 | `fgColor-muted` | | |
| Message box | 16,184,380,200 (10px padding, 20/line, 9 lines) | 13 mono | `fgColor-default` | wraps at the box, long URL breaks by character (textarea behaviour) | Default focused with ring. Sending: locked. Failed: kept and editable |
| Counter | 16,388, 18 high | 12/400 | `fgColor-muted` | | Left: `Nothing is sent until you press Send.` Sending: `Sending to fix-migration-365. Fields are locked.` Right: `306 / 600` (`SEND_MAX`); over 600 shows `too long` and disables Send |
| Error block | 16,418,380,60 (A3) | 12/400 | `fgColor-danger` on `bgColor-danger-muted`, dashed `borderColor-danger-emphasis` | wraps, 2 lines | A3 only. Alert icon 18px |
| Cancel | 16, bar+14, 186x48 | 15 | default button | | Dashed and muted while sending |
| Primary | 210, bar+14, 186x48 | 15/600 | `button-primary-bgColor-rest` | | `Send`. Sending: spinner + `Sending...`, `aria-busy`. Failed: `Retry` |

Scroll owner: the body (Session, Message, counter, error). Action bar is pinned. With the keyboard up the textarea scrolls inside the body.

## A4: Picker sheet (Job 2)

Height 408, top 507.

| Element | Box (sheet-relative) | Font | Colour tokens | Truncation |
|---|---|---|---|---|
| Title | `Choose a session for #365` (the existing default) | 17/600 | `fgColor-default` | ellipsis |
| Sub | `1 related, 2 possible` | 13/400 | `fgColor-muted` | |
| Group header | 0,80,412,24 | 12/600, count 12/400 | `fgColor-muted` on `bgColor-muted` | `RELATED` + `1 match`, `POSSIBLE` (as `SessionPicker`) |
| Row | 64 high, radio at x 32 (22px), hairline `borderColor-muted` | | | |
| Row name | x 56 | 14/600 mono | `fgColor-default` | ellipsis, max 190 |
| Row state | right, `STATE_WORD` | 12/400 | `fgColor-muted` | |
| Row reason | x 56 | 12/400 | `fgColor-muted` | ellipsis. `linked PR #365`, `branch crew/acmeapi-data-read-bonus` |
| Row hint | right, line 2 | 12/600 | `fgColor-accent` | `Send once` on possible rows only |
| Selected row | inset 8, 2px `borderColor-accent-emphasis`, fill `bgColor-accent-muted` | | | Radio filled plus ring, not colour alone |
| Cancel | 16, bar+14, 114x48 | 15 | default (`.ph-pk-cancel`, min-width 114) | |
| Primary | 138, bar+14, 258x48 | 15/600 | primary | `Remember and continue` (related row selected) |

Behaviour: tapping a related row selects it. `Remember and continue` calls `onChoose` and opens the Send sheet. Tapping a possible row selects it and the primary becomes `Send once` (`onSendOnce`). Default selection is the first related row. Scroll owner: the list (body). Bar is pinned.

## A5 to A7: Dispatch sheet (Job 3)

Heights: A5 and A6 672 (top 243), A7 726 (top 189). Source: `PhoneFixDispatch`.

| Element | Box (sheet-relative) | Font | Colour tokens | Truncation | States |
|---|---|---|---|---|---|
| Title | `Dispatch with Orca` | 17/600 | `fgColor-default` | ellipsis | |
| Sub (subject) | `acme-co/orders-api #365` | 13/400 | `fgColor-muted` | `.ph-clip` ellipsis | |
| Label `Agent` | 16,80,380,18 | 12/400 | `fgColor-muted` | | `.ph-fix-label` |
| Agent select | 16,102,380,44 | 16/400 | `fgColor-default` | | `claude` (`DEFAULT_AGENT`). Chevron 14px at right. Locked while dispatching |
| Label `Worktree name` | 16,158 | 12/400 | `fgColor-muted` | | |
| Name input | 16,180,380,44 | 16 mono | `fgColor-default` | | `pr-365`. Valid against `NAME_RE`; invalid keeps ring red (`aria-invalid`) and disables Dispatch |
| Label `Head branch` | 16,236 | 12/400 | `fgColor-muted` | | |
| Head input | 16,258,380,44 | 16 mono | `fgColor-muted`, dashed border | | `feature/365`, read-only (`.ph-fix-locked`) |
| Locked note | 16,302, 18 high | 12/400 | `fgColor-muted` | wraps | `Locked. The agent works on the PR head and pushes its fix there.` |
| Label `Prompt` | 16,328 | 12/400 | `fgColor-muted` | | |
| Prompt box | 16,350,380,200 | 13/20 mono | `fgColor-default` | wraps, URL breaks by character | Default text is `dispatchText` (306 chars). Locked while dispatching. Empty or over 600 disables Dispatch |
| Counter | 16,554, 18 high | 12/400 | `fgColor-muted` | | `Edit before dispatching.` (busy: `Fields are locked while dispatching.`), right `306 / 600` |
| Error block | 16,584,380,42 (A7) | 12/400 | `fgColor-danger` | wraps | A7 only, `role="alert"` |
| Cancel | bar left, 186x48 | 15 | default | | Dashed and muted while dispatching |
| Primary | bar right, 186x48 | 15/600 | primary | | `Dispatch`. Busy: spinner + `Dispatching...`. Failed: `Retry` |

Scroll owner: the body. Action bar pinned. On focus of a field the sheet sits on the keyboard as in A1.

## A8: finding card after dispatch

| Element | Box | Font | Colour tokens |
|---|---|---|---|
| Card 1 | 11,161,390,208 | | as page cards, +32 for the status row |
| Spent button | `Dispatched`, 28 high | 12/400 | `bgColor-default`, dashed `borderColor-emphasis`, `fgColor-muted` (`.finding-btn.is-spent`) |
| Status line | card x+12, y+0 after buttons +8, 24 high | 12/400 | text `fgColor-muted`, check icon `fgColor-success` (`.finding-status.is-ok`) |
| Card 2 | 11,377,390,208 | | same |
| Human card | 11,593,390,136 | | unchanged |

Card 1 status is Job 1 or 2. Card 2 status is Job 3. States: the button stays spent after reload only if the card state persists (existing behaviour: not persisted).

## Invented copy

Real strings reused: `Send to`-style status `Sent to <session>, confirmed <time>`, `Not confirmed: <name> may not have the message`, `Dispatch failed: <message>`, `Locked. The agent works on the PR head and pushes its fix there.`, `Choose a session for #365`, `RELATED`, `POSSIBLE`, `Send once`, `Dispatched`, `Sending...`, `Dispatching...`, `Dispatch with Orca`, `Worktree name`, `Head branch`, `Prompt`, `<n> / 600`.

Invented, mark for review:

- `Send to Orca session` (sheet title; the desktop dialog says `Send message to <name>`).
- `Nothing is sent until you press Send.` (shortened from the desktop footer, same meaning).
- `Sending to fix-migration-365. Fields are locked.` and `Fields are locked while dispatching.` (the desktop has only a screen-reader line).
- `Not confirmed: fix-migration-365 may not have the message. Your text is kept.` The first sentence is real; `Your text is kept.` is new.
- `Retry` as the primary in the failed sheets (real `Retry` exists on the card status line).
- `Remember and continue` and the `Linked` / `Possible` pills in the Send sheet.
- `Edit before dispatching.` (counter note).
- `Dispatch failed: Worktree pr-365 already exists`. The `Dispatch failed:` prefix is real (`server/orca.ts`); the CLI text after it is a guess at Orca's message.
- `Dispatched to pr-365, confirmed 09:44` (card status for job 3; the real code only has `Sent to <note>`).
- `1 related, 2 possible` (picker sub).
- Times `09:42` and `09:44` and the possible rows `crew-310`, `crew-305-a` (real fixture sessions, but not real matches for #365: the fixture has only `fix-migration-365` linked).

## Constraints that forced a change

- Message and prompt text use 13px mono, not the 16px of `.ph-fix-field`. At 16px the 306-character text needs about 14 lines and the sheet cannot show the fields and both buttons. Needs a `.ph-fix-field.ph-mono` size override (13/20, still above the 12px minimum).
- PR sample text is trimmed to the fixtures: `Files 0/2` and `Thread 4`, not the wireframe's `Files 6/6`, `Thread 3`, and the PR title is `fix: resolve duplicate migration version`.
- The wireframe's subject row under the title is dropped. The repo and number sit in the sheet sub, so the subject does not truncate mid-word.
- Wireframe worktree name `pr-365-finding` is `pr-365` (`prWorktreeName`), head branch `feature/365`, not `feat/webhook-retry`.
