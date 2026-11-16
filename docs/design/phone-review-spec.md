# Review on phone: spec

Layout A, picked 2026-11-16. Mockup: `phone-review-mockup.png`. Wireframes: `phone-review-wireframe-A.png` (picked) and `-B.png`.

Phone 412x915, dark and light. Closes the three biggest parity gaps from the 2026-11-16 audit: line and file comments with a pending review, the since-my-review diff, and replies on every thread. No desktop change.

## Data

Reuse the desktop's API calls; no new endpoints.

| Need | Call (`web/api.ts`) |
|---|---|
| Single comment on a line, range or file | `addInlineComment` |
| Draft comment | `addDraftComment` |
| Edit, delete a draft | `editDraft`, `deleteDraft` |
| Discard all drafts | `discardReview` |
| Finish review | `review` (event + body; the drafts go with it) |
| Reply to any thread | `replyToThread` |
| Since my review | `diff(repo, number, 'since')` |

Drafts and threads come from the PR detail the phone already loads (`usePhonePr`). Reuse the desktop's state helpers where they are UI-free (`web/pending-review-state.ts`, composer reducer), not its components.

## 1. Line selection (diff sheet, A1)

| Property | Value |
|---|---|
| Target | Tap anywhere on the number cells (`.dl-num`, 72 wide). The code cell still scrolls sideways |
| Selected row | `--bgColor-accent-muted` over the line colour, plus a 2px `--fgColor-accent` bar at the left edge (desktop `.dl-cursor`) |
| Range | Tapping a second line on the same side and hunk extends the range; tapping the anchor again clears it |
| Bar | While a selection exists, the diff bar becomes one full-width primary `ph-btn`: `Comment on line 13` or `Comment on lines 13–14` |
| Clear | Done, scrolling to another file, or Back clears the selection |

## 2. Composer sheet (A2, A4, A10)

Existing action sheet (`.ph-asheet`: radius 20 20 0 0, padding 0 16, handle 36x4).

| Element | Value |
|---|---|
| Title | `Comment on line 13`, `Comment on lines 13–14`, or `Comment on <file name>`; 16px bold |
| Sub | file path, 13px mono `--fgColor-muted`; `Whole file` for a file comment |
| Text | multiline, 120 high, 15px, focus border `--fgColor-accent`, radius 10; grows to 6 lines then scrolls |
| Row 1 | `Add to review` (primary) and `Comment` (default), equal halves, 48 high |
| Row 2 | `Cancel`, full width |
| Disabled | Both submit buttons off while text is empty |
| Posting | Pressed button shows a spinner and `Adding…` / `Posting…`; text read-only |
| Error (A10) | Line under the text: `Not posted: <reason>`, `--bgColor-danger-muted`, `--fgColor-danger` border and text, 14px. Buttons become `Retry` (primary, repeats the last action) and `Cancel`. Text kept |
| After success | Sheet closes, selection clears, a single comment appears as a thread pill, a draft appears as a draft card |
| Keyboard | Sheet sits above the keyboard (`useKeyboardInset`) |

File comment entry (A4): a `Comment on file` row in the diff sheet's ⋯ menu.

## 3. Draft card (A3)

| Element | Value |
|---|---|
| Place | Under its last line, full width minus 12 each side |
| Box | `--bgColor-muted`, `--borderColor-default`, radius 8 |
| Head | `you` 13px semibold, then the desktop `.pill-pending` (`Pending`, `--bgColor-attention-muted`, `--borderColor-attention-emphasis`, `--fgColor-attention`) |
| Body | 14px, wraps |
| Actions | `Edit` (`--fgColor-accent`) opens the composer sheet with the text and one `Update` button; `Delete` (`--fgColor-danger`) deletes after the standard phone confirm |
| Diff bar | First button becomes `<n> pending` (default); tapping it closes the diff sheet onto the PR sheet's pending bar |

## 4. Pending bar (A5)

| Property | Value |
|---|---|
| Shown | PR sheet, any tab, while the viewer has ≥1 draft on this PR |
| Place | Floats 8 above the PR bar (Approve, Comment, More), 8 from each side, height 64, radius 12 |
| Colours | `--bgColor-attention-muted` fill, `--borderColor-attention-emphasis` border |
| Text | `<n> pending comment(s)` 15px semibold; `Visible only to you` 13px muted |
| Buttons | `Discard` (default, 44 high) confirms then calls `discardReview`; `Finish` (primary, 44) opens Finish review |
| Scroll | The tab content gets 72 extra bottom padding so the bar never covers the last row |

## 5. Finish review sheet (A6)

| Element | Value |
|---|---|
| Title | `Finish review`; sub `<n> pending comments go with it` |
| Options | Three radio rows (Comment, Approve, Request changes) from `FINISH_OPTIONS`, 56 high, radius 10; chosen row `--bgColor-accent-muted` with `--fgColor-accent` border and dot |
| Default | Comment |
| Summary | 76 high text, optional; required for Request changes (Submit off until filled) |
| Buttons | `Submit review` (primary), `Cancel` |
| Own PR | Approve and Request changes rows disabled with the existing `GitHub only allows comments` reason |
| Success | Sheet and pending bar close; toast `Review submitted` |

The PR bar's Approve and Comment keep working; with drafts pending they post a review that includes the drafts (same as desktop).

## 6. Since my review (A7)

| Property | Value |
|---|---|
| Control | `ph-seg` with `All changes` / `Since my review`, top of the Files tab, 48 high, 12 margin |
| Shown | Only when the viewer has reviewed this PR before; otherwise no control |
| Default | `All changes` |
| Since | Files list and the diff sheet use `diff(..., 'since')`; only files with changes since the review |
| Empty | `No changes since your review.` 15px muted, centred |
| Badge | Files changed since review keep the existing `changed` badge in both modes |

## 7. Threads in the diff (A8)

| Property | Value |
|---|---|
| Pill | Under the thread's last line: 32 high, radius 16, `--button-default-bgColor-rest`, label `<n> comment(s) · <first author>` 13px semibold, `Open` in `--fgColor-accent` |
| Resolved | Pill text muted with `Resolved` in place of the author |
| Open | Opens a thread sheet with the comments and the same Reply and Resolve buttons as the Thread tab |

## 8. Reply on every thread (A9)

| Property | Value |
|---|---|
| Where | Thread tab cards and the thread sheet |
| Button | `Reply` next to `Resolve` on every thread, finding or not |
| Sheet | Composer sheet titled `Reply to <author>`, sub = the thread's path:line, buttons `Reply` (primary), `Cancel`; same posting and error states as section 2 |
| After | Reply appears at the end of the thread; toast `Reply posted` |

## States checklist

Selection none / one / range; composer empty / typing / posting / failed; draft present / editing / deleting; pending bar 0 (hidden) / n; finish default / Request changes without summary / submitting / failed; since control hidden / all / since / empty; thread pill open / resolved; reply posting / failed. Every failure keeps the typed text.

## Scroll owners

Diff sheet: the diff body scrolls; header, file strip and bar are fixed. PR sheet: the tab body scrolls under the fixed bar and pending bar. Sheets: the text area scrolls past 6 lines; the sheet itself never scrolls the page.
