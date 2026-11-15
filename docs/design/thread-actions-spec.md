# Nod finding actions on review threads, round 2 spec (build contract)

Layout A, approved in round 1: actions inline on each finding card, `Hand all to bot` in the merge banner. Wireframes: `thread-actions-wireframe-A.svg`, `thread-actions-wireframe-A-narrow.svg`. Mockups: `thread-actions-mockup.svg` (dark, compact, 1660x870) and `thread-actions-mockup-narrow.svg` (dark, compact, 412x915). Tokens: `tokens.md`, `density-tokens.md`. Constraints: `constraints.md`.

Sample data is synthetic: `acme-co/orders-api` PR #365 "fix: resolve duplicate migration version", bot `review-bot`, human `riley-k`, author `sam-lee`. Orange pins and the state sheet are redline ink, not app colours or app UI. SVG text uses Helvetica / Arial stand-ins, so real widths differ by a few px.

## 1. What changes

| # | Surface | Change |
|---|---------|--------|
| 1 | Thread card | New pinned merge banner above the list, with `Hand all to bot`. |
| 2 | Review thread items | A thread whose first comment is by the configured bot becomes a finding card with severity badge, bot chip and four actions. |
| 3 | Human review threads | New compact card with `Reply` and `Resolve` only. |
| 4 | Resolved threads | Collapsed row with `Show`, or `Reopen` when open. |
| 5 | Confirm dialog | New bulk confirm for `Hand all to bot`. |
| 6 | Footer | Key hints for the Thread view. |
| 7 | Data | Thread items gain `severity` (`blocker`, `major`, parsed from the bot comment) and `fromBot`. Settings gain `bot.name` and `bot.command` (already referenced as `bot.*`). |

Out of scope: editing the finding before sending, other bots, and severities below major (those render as ordinary human-style threads).

## 2. Components and tokens used

| Piece | Used for | Source |
|-------|----------|--------|
| `ThreadCard`, `.card`, `.card-h` | Thread card shell and header (36 high) | `web/DetailBody.tsx`, `web/base.css` |
| `PrThreadList`, `PrThreadRow`, `CommentItem` | Where finding cards mount | `web/PrThread.tsx` |
| `TlCard`, `.tl-card`, `.tl-code`, `.tl-pill`, `.tl-pill-success` | Card, path row, Resolved pill | `web/Timeline.tsx`, `web/timeline.css` |
| `HiddenItem`, `.tl-hidden-row`, `.tl-hidden-btn` | Resolved row and `Show` | `web/Timeline.tsx`, `web/timeline.css` |
| `.btn`, `.btn-primary`, `.btn[disabled]`, `.btn.is-busy`, `.spinner` | All buttons | `web/base.css` |
| `.kbd`, `KeyCap` | Key caps | `web/base.css`, `web/ui.tsx` |
| `.badge`, `.tl-pill-danger` | Pill shape reference for severity badges | `web/base.css`, `web/timeline.css` |
| `.dialog`, `.dialog-head`, `.dialog-actions`, `.fix-dialog`, `.scrim` | Bulk confirm | `web/detail.css`, `web/FixDialogs.tsx` |
| `SessionPicker`, `.picker`, `.picker-row-2`, `.picker-act`, `.orca-picker` | No-session picker | `web/orca/SessionPicker.tsx`, `web/issues.css` |
| `SendDialog`, `useOrca` | Dispatch flow (prefilled dialog, sent, not confirmed, blocked, Orca down) | `web/orca/SendDialog.tsx`, `web/orca/useOrca.tsx` |
| `.toast`, `.toast-icon-ok`, `.toast-icon-err` | Result toasts | `web/detail.css` |
| `Footer`, `footer-keys` rule | Footer hints | `web/Footer.tsx`, `density-tokens.md` |
| `Avatar`, `CheckIcon`, `XIcon`, `Chevron` | Glyphs | `web/ui.tsx`, `web/issues/parts.tsx` |
| `PrThreadItem` (`kind: 'thread'`) | Data | `shared/types.ts` |

New classes (no new tokens): `.finding`, `.finding-btn` (based on `.btn`), `.finding-banner`, `.sev-badge`, `.bot-chip`, `.finding-status`, `.finding-reply`.

Colour tokens: `bgColor-default`, `bgColor-muted`, `bgColor-inset`, `bgColor-neutral-muted`, `bgColor-accent-emphasis`, `bgColor-success-muted`, `bgColor-success-emphasis`, `bgColor-danger-muted`, `bgColor-danger-emphasis` (`#da3633`, Primer value, used as fill for Blocker), `bgColor-attention-muted`, `fgColor-default`, `fgColor-muted`, `fgColor-onEmphasis`, `fgColor-accent`, `fgColor-success`, `fgColor-danger`, `fgColor-attention`, `borderColor-default`, `borderColor-muted`, `borderColor-emphasis`, `borderColor-accent-emphasis`, `borderColor-success-emphasis`, `borderColor-danger-emphasis`, `borderColor-attention-emphasis`, `button-default-bgColor-rest`, `button-primary-bgColor-rest`, `borderColor-hairline`.

Type: `text-title-small` is not used. `text-title-medium` 20/28 600 (PR title), `text-body-medium` 14/20 400 (finding body, human name), `text-body-medium-semibold` 14/20 600 (banner headline, dialog rows), `text-caption` 12/18 400 (buttons, status lines, meta), `text-caption-semibold` 12/18 600 (badges, bot reply author), `text-codeInline` 12/18 mono (path, key caps, command preview), dialog title 16/24 600 (`text-title-small`). Smallest text is 12.

Contrast, dark: white on Blocker fill 4.61, `fgColor-attention` on `bgColor-attention-muted` 6.27, `fgColor-muted` on `bgColor-default` 6.50, on `bgColor-muted` 5.94, on `bgColor-neutral-muted` 5.41, on `button-default-bgColor-rest` 5.11, `fgColor-danger` on `bgColor-default` 5.65, `fgColor-onEmphasis` on `button-primary-bgColor-rest` 4.63. All pass 4.5:1.

## 3. Desktop 1660x870

Boxes are `x, y, w, h` at 1660x870. The page never scrolls. Panes are the `three` layout: list 400, handle 1, middle 480, handle 1, rest 778 (the Diff pane, replaced here by the state sheet).

### 3.1 Frame

| Element | Box | Notes |
|---------|-----|-------|
| Top bar | 0, 0, 1660, 48 | Unchanged. |
| List pane | 0, 48, 400, 794 | Unchanged. Selected row is PR #365. |
| Middle pane | 401, 48, 480, 794 | PR detail, Thread card open. |
| Footer | 0, 842, 1660, 28 | `bgColor-muted`, 1px top `borderColor-default`. |

### 3.2 Scroll owner

| Region | Scrolls | Notes |
|--------|---------|-------|
| Thread card finding list `.finding-list` | Yes, vertical | Box 418, 255, 446, 575. `overflow-y: auto`. The only scroller in the middle pane at this height. |
| PR header, Thread card header, merge banner | No | Pinned above the list, `flex: none`. |
| List pane | Yes | Unchanged. |
| Page | No | `html, body { overflow: hidden }` as today. |

The Thread card is a flex column filling the pane below the PR header (`min-height: 0`), so the banner stays visible while findings scroll. A confirm dialog and the session picker are portalled to `body` (`position: fixed`) and never clip.

### 3.3 Pane header and Thread card

| # | Element | Box | Type, colour | Behaviour |
|---|---------|-----|--------------|-----------|
| 12 | PR title | 417, 64, 448, 28 | `text-title-medium`, `fgColor-default`, ellipsis after 2 lines | Unchanged. |
| | Meta, state pill | 417, 96..140 | `text-caption`, `fgColor-muted`; Open pill 22 high | Unchanged. |
| | Thread card | 417, 156, 448, 674 | 1px `borderColor-default`, radius 6, `bgColor-default` | Fills to 12 above the footer. |
| | Card header | 418, 157, 446, 36 | `bgColor-muted`, `Thread` 14/600 and `3 items` 12 `fgColor-muted` | Unchanged. Count includes human and resolved threads. |

### 3.4 Merge banner (pin 1, 2)

| Part | Rule |
|------|------|
| Box | 429, 203, 424, 44. Pinned. 1px border, radius 6. 10px below the card header. |
| Blocked | Fill `bgColor-danger-muted`, border `borderColor-danger-emphasis`. 16px octagon-with-bar glyph filled `bgColor-danger-emphasis` at x 441. Text `Merge blocked` `text-body-medium-semibold` `fgColor-default`, then `2 unresolved` `text-caption` `fgColor-muted` after 8px. |
| Ready | Fill `bgColor-success-muted`, border `borderColor-success-emphasis`. Check glyph in `fgColor-success`. Text `Ready to merge`, sub `0 unresolved`. No button. |
| Truncation | Headline never truncates. The sub drops first when the banner is narrower than 230px. |
| `Hand all to bot` button (2) | 724, 211, 121, 28. `.finding-btn`. Label `Hand all to bot`, cap `H`. 8px from the banner right edge. |
| Shows when | Bot configured and at least one unresolved finding. Hidden at 0 findings and when no bot is set (the sub-line `No bot set` shows at the right instead). |
| Count | N is unresolved bot findings only. Human threads count toward `unresolved` in the banner text but not toward `Hand all`. |

### 3.5 Finding card (pins 3 to 8)

Default sample: card 1 at 429, 259, 424, 150 (focused), card 2 at 429, 417, 424, 150. Heights are content driven. Card 2 repeats the layout with `Major`.

| # | Element | Box (card 1) | Type, colour | Rule |
|---|---------|--------------|--------------|------|
| | Card | 429, 259, 424, 150 | 1px `borderColor-default`, radius 6, `bgColor-default`, padding 12 | Focus: 2px `borderColor-accent-emphasis` ring 2px outside the border. `j` and `k` move focus between cards. |
| 3 | Severity badge | 441, 271, 80, 22 | `text-caption-semibold` 12/18 600, radius full, padding 0 10 | See 3.6. |
| 4 | Bot chip | 527, 271, 75, 22 | `text-caption` 12/18 400, `fgColor-muted`, fill `bgColor-neutral-muted`, 1px `borderColor-muted`, radius full | Bot login, ellipsis past 160px. |
| | State word | right aligned, baseline 286 | `text-caption`, `fgColor-muted` | `Unresolved`. |
| 5 | Path | 441, 299, 400, 18 | `text-codeInline`, `fgColor-muted`, mono | One line, ellipsis at the end, `title` carries the full path. |
| 6 | Body | 441, 321, 400, 40 | `text-body-medium` 14/20 400, `fgColor-default` | Line clamp 5, ellipsis, then a 20px `Show more` row (12, `fgColor-accent`). Sample bodies fill 2 lines at 400 wide. |
| 7 | Action row | 441, 369, 400, 28 | see below | 8px between buttons, 8px above, 12px padding below. |
| | `Hand to bot` | 441, 369, 106, 28 | `.finding-btn` | Absent when no bot is set. |
| | `Dispatch` | 555, 369, 91, 28 | `.finding-btn` | Opens the Send flow. |
| | `Reply` | 654, 369, 75, 28 | `.finding-btn` | Opens the composer on that thread. |
| | `Resolve` | 737, 369, 87, 28 | `.finding-btn` | Resolves the thread on GitHub. |
| 8 | Key caps | inside each button, 6px after label | `.kbd` 18 high, `text-codeInline` | Shown on the focused card only (hover, keyboard focus, or Alt held), per the `keycaps` rule. Card 2 at rest shows none. Widths above include caps on card 1, labels only on card 2. |

`.finding-btn`: `.btn` with height 28, padding 0 10, `text-caption` 12/18 400. Fill `button-default-bgColor-rest`, 1px `borderColor-default`, radius 6, text `fgColor-default`. Hover `button-default-bgColor-hover`. Keyboard focus is the 2px accent ring outside the border. Busy: label stays, `.spinner` (12) replaces the cap, `aria-busy`, clicks ignored. Disabled and spent: dashed 1px `borderColor-emphasis`, `bgColor-default`, text `fgColor-muted`.

Keys, scoped to the focused finding card (existing keys that collide are shadowed while a card has focus):

| Key | Action | Existing meaning it shadows |
|-----|--------|-----------------------------|
| `b` | Hand to bot | none (free) |
| `s` | Dispatch | same flow as the existing `s` send message |
| `q` | Reply | none (free) |
| `x` | Resolve or reopen | same as existing `x` on a thread |
| `H` | Hand all to bot | none (free) |

The wireframe keys `H D R E T` collided with `h` hide viewed, `d` interdiff, `r` request changes, `e` expand description and `t` details drawer, so they were replaced.

### 3.6 Severity badge

Distinguishable by fill, outline, glyph and word, never colour alone.

| | Blocker | Major |
|-|---------|-------|
| Box | 80 x 22 | 68 x 22 |
| Fill | solid `bgColor-danger-emphasis` | `bgColor-attention-muted` |
| Border | 1px `bgColor-danger-emphasis` | double ring, 2 x 1px `borderColor-attention-emphasis` |
| Glyph | 12px filled octagon with a bar | 12px outlined triangle with a bar |
| Text | `Blocker`, `fgColor-onEmphasis`, 600 | `Major`, `fgColor-attention`, 600 |

`aria-label="Severity: blocker"` and `"Severity: major"`.

### 3.7 Other thread rows

| # | Element | Box | Rule |
|---|---------|-----|------|
| 9 | Human thread card | 429, 575, 424, 76 | Avatar 20 circle, name 14/600, `human thread, unresolved` 12 muted, first line of body 14/20 ellipsis. `Reply` and `Resolve` `.finding-btn` right aligned at y 587. No bot actions. |
| 10 | Resolved row | 429, 659, 424, 40 | `.tl-hidden-row` look: fill `bgColor-muted`, 1px `borderColor-muted`, check glyph in `fgColor-success`, text `Resolved · Major · review-bot · db/migrate/2026...rb` 12 `fgColor-muted` ellipsis. `Show` button 28 high at the right, no cap. Expanding shows the card with `Reopen` (cap `x`) instead of the four actions. |
| 11 | Scroll thumb | 859, 259, 4, 300 | Overlay scrollbar, `borderColor-emphasis` at 60%. Appears only when the list overflows. |

Order in the list: unresolved findings (blocker before major, then file order), unresolved human threads, resolved rows.

### 3.8 Footer (6 keys plus help)

`j k` next finding, `b` hand to bot, `s` dispatch, `q` reply, `x` resolve, `H` hand all, then `? all keys`. Caps `.kbd`, labels `text-caption` `fgColor-muted`. Shown only while the Thread card has focus; the PR footer returns otherwise.

## 4. States

All state boxes are drawn on the sheet in the right pane. Card offsets are card relative. Sheet cells are 377 wide (S7 214, S8 540).

| State | Cell box | What changes |
|-------|----------|--------------|
| S1 default | middle pane | 2 unresolved findings, banner blocked, `Hand all to bot` shown, all buttons at rest. |
| S2 handed, waiting | 890, 80, 377, 232 | `Hand to bot` becomes `Handed` with a check, spent look (dashed). Status line below the actions: clock glyph, `Handed to review-bot 09:42, waiting for reply`, 12/18, 24 high. Card stays unresolved. When the bot replies, a reply block (333 x 44, `bgColor-muted`, 1px `borderColor-muted`, radius 6) shows the bot name 12/600, time, first line 12 and an `Open run` link in `fgColor-accent` with underline. The block is added below the status line when the reply arrives, with no layout jump above it. |
| S3 dispatched, sent | same cell | `Dispatch` becomes `Dispatched` with a check, spent look. Status line: check in `fgColor-success`, `Sent to fix-migration-365, confirmed 09:44`. Toast: `Dispatched finding to fix-migration-365`. Both statuses stack, one per action. |
| S4 failed, retry | 1285, 80, 377, 232 | Status line per failed action: `!` ring glyph in `fgColor-danger`, text `fgColor-danger`, `Retry` button 24 high with the action's key (`b` or `s`) right aligned, 73 wide at 1557, 216. Texts: `Reply failed: GitHub 403`, `Not confirmed: Orca is down`. The action button itself returns to rest. |
| S5 no bot configured | 890, 322, 377, 228 | `Hand to bot` is not rendered. Banner right side shows `No bot set` (`text-caption`, `fgColor-muted`) instead of the button. Settings, bot section, holds `bot.name` and `bot.command`. |
| S6 no Orca session | 1285, 322, 377, 228 | `Dispatch` stays enabled. Clicking opens `SessionPicker` under it: 267 x 100, 2px `borderColor-accent-emphasis`, radius 6, title `No Orca session linked to PR #365` 12 muted, rows from `SessionPicker` (name mono 12, state and reason 12 muted, `Enter` hint on the focused row), dashed last row `Pick another session...`. Picking a row opens the prefilled Send dialog. |
| S7 all resolved | 890, 562, 214, 232 | Banner turns success, reads `Ready to merge`, no button. Every row is a resolved row with `Reopen x`. |
| S8 bulk confirm | 1112, 562, 540, 232 | Dialog 1122, 594, 520, 188. See 4.1. |

### 4.1 Bulk confirm dialog

| Part | Rule |
|------|------|
| Shell | `.dialog.fix-dialog`, 520 wide, padding 20, gap 12, over `.scrim`. |
| Title | `Hand 2 findings to review-bot?` 16/24 600. Count follows ticked rows. |
| Sub | `One reply per thread. The command comes from Settings.` 12/18 `fgColor-muted`. |
| Rows | 32 high. 16px checkbox (checked by default, `bgColor-accent-emphasis`), severity badge, command preview `/review-bot fix: <finding>` `text-codeInline` `fgColor-muted`, one line, ellipsis. Full text in `title`. |
| Buttons | `Cancel` (`Esc`) and primary `Hand 2 to bot` (`Enter`), 32 high, 14/600, right aligned, 8 apart. Primary uses `.btn-primary`. Disabled when no row is ticked. |
| Result | One reply posted per thread. Each card then shows S2. A partial failure shows S4 on the failed cards only and a toast `Handed 1 of 2, 1 failed`. |

## 5. Phone 412x915

Compact density, dark. Safe areas: status bar 32 at the top, 24 gesture inset at the bottom (`mobile-spec.md`). Phone type: `m-title` 17/24 600, `m-body` 15/22, `m-meta` 13/18, `m-caption` 12/16 600. Every tappable is at least 44 high.

### 5.1 Scroll owner

The sheet body below the banner scrolls (`p.scroll`, 0, 221, 412, 670). Status bar, header, tab bar and banner are pinned. The page and the sheet itself do not scroll. The last row is partly clipped at y 891 in the mockup, which shows that the region scrolls.

### 5.2 Boxes

| Element | Box | Type, colour | Notes |
|---------|-----|--------------|-------|
| Status bar | 0, 32 high | 13/18 600 | Safe area, as `mobile-spec.md`. |
| Sheet surface | 0, 32, 412, 883 | `bgColor-default`, top radius 20 | Behind it `bgColor-inset`. |
| Close, More | 8, 56, 44, 44 and 360, 56, 44, 44 | icon 20, `button-default-bgColor-rest`, 1px `borderColor-default`, radius 10 | Unchanged. |
| Title | centred, y 56 to 80 | `m-title` 17/24 600 | `orders-api #365`. |
| Sub | centred, y 80 to 98 | `m-meta` 13/18 `fgColor-muted` | PR title, ellipsis. |
| Tab bar | 0, 104, 412, 44 | 15/22, selected 600 `fgColor-default` with 3px `borderColor-accent-emphasis` underline, other `fgColor-muted` | `Details`, `Thread 3`. Count is all threads. |
| Merge banner | 12, 157, 388, 56 | fill `bgColor-danger-muted`, 1px `borderColor-danger-emphasis`, radius 8 | Headline `Merge blocked` 15/22 600, sub `2 unresolved` 13/18 muted, octagon glyph at x 24. Ready: success tokens, no button. |
| `Hand all to bot` | 256, 163, 138, 44 | 14/20, `button-default-bgColor-rest`, 1px `borderColor-default`, radius 10 | No key cap on the phone. Opens the confirm as a bottom sheet (`PhoneConfirm`) with the same rows and buttons, buttons 48 high. |
| Finding card 1 | 12, 229, 388, 256 | 1px `borderColor-default`, radius 8, padding 12 | |
| Finding card 2 | 12, 493, 388, 236 | same | 8 below card 1. |
| Badge row | 24, y+12, 24 high | `m-caption` 12/16 600 | Same encodings as 3.6, 24 high: Blocker 88 wide, Major 72. Bot chip 24 high, 12/16, next to it. `Unresolved` right aligned, 12. |
| Path | 24, y+54, 364, 18 | `text-codeInline` mono | One line, ellipsis. |
| Body | 24, y+78, 364 | 14/20 (`.ph-thread .tl-card-b`) | Clamp 5, `Show more` 44 high row. 3 lines in the sample. |
| Action grid | 24, below body +10 | 2 x 2, each 178 x 44, gap 8, radius 10, `m-body` 15/22 400 | Order `Hand to bot`, `Dispatch`, `Reply`, `Resolve`. Card 1 at 24, 377 and 210, 377 and 24, 429 and 210, 429. No key caps. |
| Human thread card | 12, 737, 388, 124 | | `Reply` and `Resolve`, 178 x 44, no bot actions. |
| Resolved row | 12, 869, 388, 56 | `.tl-hidden-row` 56 high, `Show` 92 x 44 | Text 12 muted, ellipsis. |

### 5.3 States on the phone

| State | Change |
|-------|--------|
| Handed | `Hand to bot` reads `Handed` with a check, dashed. A `m-meta` status line (13/18) under the grid: `Handed to review-bot 09:42, waiting for reply`. Reply block full width, `Open run` link 44 high. |
| Dispatched | `Dispatch` reads `Dispatched`. Status `Sent to fix-migration-365, confirmed 09:44`. |
| Failed | Status line in `fgColor-danger` with a `Retry` 44 high button right aligned. |
| No bot | `Hand to bot` absent, so the grid is `Dispatch`, `Reply`, `Resolve` (`Resolve` spans the second row). Banner shows `No bot set` instead of the button. |
| No Orca session | `Dispatch` opens `PhoneSheet` with the session list (rows 56 high) and `Pick another session...`. |
| All resolved | Banner is success, `Ready to merge`, no button. Rows show `Reopen` 92 x 44. |
| Bulk confirm | Bottom sheet over `.ph-scrim`, rows 44 high, buttons `Cancel` and `Hand 2 to bot` 48 high side by side. |

## 6. Constraint notes

- Round 1 keys `H D R E T` collide with existing keys, replaced in 3.5.
- `.finding-btn` is 28 high, not the 32 of `.btn`, to fit four actions and caps in 400px. The comment-fix precedent (`comment-fix-spec.md`) is 24.
- Key caps show only on the focused card (`keycaps` rule in `density-tokens.md`), which makes the always-visible key hint of `constraints.md` a focus state here. The footer carries the keys at all times.
- Dispatch no-session state keeps a solid button. The dashed look from the wireframe means disabled in `tokens.md`, and the button is enabled.
- The wireframe tab strip (`Files`, `Threads`, `Checks`) is not drawn. The finding cards live in the existing Thread card.
- The 520 wide `.dialog` is used unchanged, so the bulk confirm shows commands truncated to one line.
- Not verified: how the bot reply is detected, the severity parsing format, and how `bot.command` is templated (settings round, not drawn here).
