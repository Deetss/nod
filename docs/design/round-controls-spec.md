# Phone round controls spec (round 2, layout A)

Issue #35. Mockups: `round-controls-mockup-phone.svg` and `.png` (dark, frames 1 to 6) and `round-controls-mockup-phone-light.svg` and `.png` (frames 1 to 3). Wireframe: `round-controls-wireframe-A-phone.svg` (picked). Its inventory of 27 controls is the scope.

Colour and shape tokens are CSS custom properties from `web/tokens.css` (dark and light blocks). Boxes are x, y, w, h at 412x915. Minimum font is 12px (`constraints.md`).

## Behaviour

- Every square-cornered phone button becomes a pill (`border-radius: var(--borderRadius-full)`). Icon-only buttons are circles.
- Every sheet, full or fit, puts a round back arrow at top left. Fit sheets lose their close on the right.
- The drag handle and the swipe-down strip stay.
- The PR and issue action bars keep Approve (or the issue primary) as a filled pill and Comment as an outlined pill. More becomes a round 48px icon button.
- Sheet button pairs (Cancel / Send, Clear / Done, Discard / Finish) are equal pills.
- Finding actions stay a 2x2 grid of labelled pills, 44 tall. Banner buttons are pills too.
- Header menu items, checkbox rows, radio rows and action-sheet rows stay rows.
- Disabled is a dashed border with a muted label. Busy is a spinner plus a word. Neither relies on fill alone.
- Every tap target is 44px or more.
- Desktop does not change. Every rule below is scoped to the phone (see Scope).

## Reuse

| Part | Reuse or extend | Source |
|---|---|---|
| Pill | `.ph-btn`, radius changed | `web/phone/phone-states.css` |
| Primary pill | `.ph-btn.is-primary` | `web/phone/phone-sheets.css` |
| Off pill | `.ph-btn.is-off`, `.ph-btn.is-primary:disabled` | `web/phone/phone-sheets.css` |
| Busy pill | `.ph-btn.is-busy` and `PhoneSheetBar` (spinner plus `busyLabel`) | `web/phone/phone-picker.css`, `web/phone/PhoneFitSheet.tsx` |
| Round icon button | `.ph-iconbtn` (44, radius 22 today) | `web/phone/phone-shell.css` |
| Bar More | `.ph-btn.is-narrow` plus new `.is-round`, `MoreIcon` | `web/phone/phone-sheets.css`, `web/phone/PhoneIcons.tsx` |
| Back arrow | New `BackIcon` on the existing `Svg` wrapper | `web/phone/PhoneIcons.tsx` |
| Finding pill | `.ph-thread .finding-btn` (44 tall), `FindingBtn` unchanged | `web/findings.css`, `web/FindingParts.tsx` |
| Spinner | `.spinner` (12, `currentColor`) | `web/base.css` |
| Focus ring | global `:focus-visible` (2px `borderColor-accent-emphasis`, offset -2px) | `web/base.css` |
| Scrim | `.ph-scrim` (unchanged) | `web/phone/phone-actions.css` |

`BackIcon` path, on the 24 grid with stroke 2: `M19 12H5M12 19l-7-7 7-7`. No icon in the app draws a back arrow today.

## Control types

All radii use `var(--borderRadius-full)` (999px), which renders as half the height.

### Bar and sheet pill (`.ph-btn`)

| Property | Value |
|---|---|
| Box | min-height 48, `box-sizing: border-box`. In `.ph-actionbar` `flex: 1`, padding `0 12px`. Elsewhere padding `0 20px` |
| Radius | `var(--borderRadius-full)` (was 10px) |
| Type | 15px, 400; primary 600. One line, `white-space: nowrap` |
| Rest, default | fill `button-default-bgColor-rest` (dark `#212830`, light `#f6f8fa`), border 1px `borderColor-default` (`#3d444d`, `#d1d9e0`), label `fgColor-default` |
| Rest, primary | fill and border `button-primary-bgColor-rest` (`#238636`, `#1f883d`), label `fgColor-onEmphasis` |
| Pressed, default | `:active`: fill `button-default-bgColor-hover` (`#262c36`, `#eff2f5`), border `borderColor-emphasis` (`#656c76`, `#818b98`) |
| Pressed, primary | `:active`: fill and border `button-primary-bgColor-hover` (`#2ea043`, `#1c8139`) |
| Disabled | fill transparent, border `1px dashed var(--borderColor-default)`, label `fgColor-muted`. Applies to `:disabled` and `.is-off`, primary or not |
| Busy | `.is-primary.is-busy`, `aria-busy`, `aria-disabled`: primary fill kept, `.spinner` (14 on phone) before the busy word (`Sending…`, `Approving…`). Gap 8. The sibling Cancel and the sheet back go disabled |
| Focus-visible | global ring, 2px `borderColor-accent-emphasis` (`#1f6feb`, `#0969da`), inset 2px. Chrome draws the outline along the radius |

### Round icon button (`.ph-iconbtn`, `.ph-btn.is-round`)

| Property | Sheet back, header More (`.ph-iconbtn`) | Bar More (`.ph-btn.is-narrow.is-round`) |
|---|---|---|
| Box | 44 x 44, `margin-top: 6px` (unchanged) | 48 x 48, `flex: none`, padding 0, `min-width: 0` |
| Radius | `var(--borderRadius-full)` (was 22px) | `var(--borderRadius-full)` |
| Icon | 20, `BackIcon` or `MoreIcon`, `currentColor` | 20, `MoreIcon` |
| Rest | fill `button-default-bgColor-rest`, border 1px `borderColor-default`, icon `fgColor-default` | same |
| Pressed | fill `button-default-bgColor-hover`, border `borderColor-emphasis` | same |
| Disabled | fill transparent, `1px dashed var(--borderColor-default)`, icon `fgColor-muted` | same |
| Busy | the sheet back disables while its sheet's request runs (`closeDisabled`) | never busy |
| Focus-visible | global ring | global ring |
| Accessible name | back: `aria-label="Back"` (was `Close`). More: `More actions` | `aria-label="More actions"`, visible text removed |

### Finding pill (`.finding-btn` on the phone)

| Property | Value |
|---|---|
| Box | 44 tall. Grid cell `1fr`, gap 8 (178 wide in a 388 card). Resolved-row Show stays 92 wide. Padding `0 10px` |
| Radius | `var(--borderRadius-full)` (was 10px) |
| Type | 15/22, 400 (unchanged) |
| Rest | `.btn`: fill `button-default-bgColor-rest`, border 1px `borderColor-default`, label `fgColor-default` |
| Pressed | `:active`: fill `button-default-bgColor-hover`, border `borderColor-emphasis` |
| Spent | `.is-spent` (unchanged colours): fill `bgColor-default`, `1px dashed borderColor-emphasis`, label `fgColor-muted`, 12px check before the label |
| Busy | `.is-busy`, `aria-busy`: label kept, spinner moved before it with `order: -1` (phone only). Fill unchanged |
| Disabled | `aria-disabled` and not spent or busy: fill transparent, `1px dashed borderColor-default`, label `fgColor-muted`, `opacity: 1` (desktop keeps 0.6) |
| Focus-visible | global ring |

The busy word on finding pills stays the label (`Dispatch`), since `FindingBtn` is shared with the desktop. The spinner and `aria-busy` carry the state.

## Screens

| Frame | Element | Box | Notes |
|---|---|---|---|
| 1, 4 | Action bar | 0, 815, 412, 100 | `bgColor-inset`, top border `borderColor-default`, padding `14px 16px calc(14px + var(--ph-bottom))` (unchanged) |
| 1, 4 | Approve | 16, 830, 158, 48 | primary pill |
| 1, 4 | Comment | 182, 830, 158, 48 | default pill |
| 1, 4 | More | 348, 830, 48, 48 | `.is-round` |
| 1, 2, 3, 4 | Sheet back | 8, head y + 9, 44, 44 | full and fit sheets |
| 1, 4 | Header More | 360, 53, 44, 44 | unchanged position |
| 1, 4 | Title, sub | 64, head y + 7 | 17/24 600, 13/18 muted (unchanged) |
| 2, 3 | Fit sheet head | padding `0 8px` (was `0 14px 0 16px`) | back at left, title after it |
| 2, 3 | Bar pair | 16 and 210, 830, 186, 48 | Cancel / Send, Clear / Done |
| 4 | Banner pills | 24 and 210, banner y + 56, 178, 44 | `.finding-banner-actions` grid |
| 4 | Finding grid | card x + 12, 2 columns of 178, gap 8, rows 44, row gap 8 | |

Scroll owner is `.ph-sheet-body`, as today. The bar and head never scroll.

## Inventory

Every square-cornered control on the phone UI. Files are under `web/phone/` unless a path is given.

| # | Control | File · class | Today | Change |
|---|---|---|---|---|
| 1 | Sheet close (full sheets) | `PhoneSheet.tsx` · `.ph-iconbtn` + `CloseIcon` | round X, left | round back arrow, left (`BackIcon`) |
| 2 | Fit sheet close (dispatch, filter, reply) | `PhoneSheet.tsx` · `.is-fit .ph-iconbtn` | round X, right | round back arrow, left |
| 3 | Sheet header More | `PhoneSheet.tsx` · `.ph-iconbtn` + `MoreIcon` | round | keep |
| 4 | PR bar Approve, Comment | `PhonePrSheet.tsx` · `.ph-actionbar .ph-btn` | 10px rect, 48 | pill, Approve filled, Comment outlined |
| 5 | PR bar More | `PhonePrSheet.tsx` · `.ph-btn.is-narrow` | 10px rect, text | round 48 icon, add `.is-round` |
| 6 | Issue bar Comment, More | `PhoneIssueSheet.tsx` · `.ph-btn`, `.is-narrow` | 10px rect | pill + round More (`.is-round`) |
| 7 | Pending review Discard, Finish | `PhonePrSheet.tsx` · `.ph-pending-bar .ph-btn` | 10px rect | pill |
| 8 | Sheet bar Cancel, Send, Dispatch, Reply | `PhoneFitSheet.tsx` · `PhoneSheetBar` `.ph-btn` | 10px rect | pill pair, Cancel outlined |
| 9 | Dispatch all bar | `PhoneDispatchAll.tsx` · `PhoneSheetBar` | 10px rect | pill (via `.ph-btn`). The 6px Change button in `web/DispatchAll.tsx` is desktop only and stays |
| 10 | Filter sheet Clear, Done (#32) | `PhoneFilterSheet.tsx` · `.ph-filter-clear`, `.is-primary` | 10px rect | pill pair in the bar |
| 11 | Filter button (#32) | `PhoneSearch.tsx` · `.ph-iconbtn.ph-filterbtn` | round | keep |
| 12 | Search field opener | `PhoneSearch.tsx` · `.ph-pill` | pill | keep |
| 13 | Search Cancel | `PhoneSearch.tsx` · `.ph-search-cancel` | 10px rect | pill |
| 14 | Finding actions Hand, Dispatch, Reply, Resolve | `web/FindingList.tsx` · `.ph-thread .finding-btn` | 10px rect, 44 | pill, 2 per row |
| 15 | Human thread Reply, Resolve | `web/FindingList.tsx` · `.finding-human-actions .finding-btn` | 10px rect, 44 | pill, 2 per row |
| 16 | Resolved row Show, Reopen | `web/FindingList.tsx` · `.finding-resolved-row .finding-btn` | 10px rect, 92 wide | pill |
| 17 | Finding banner Hand all, Dispatch all | `web/FindingParts.tsx` · `.finding-banner-btn` | 10px rect | pill |
| 18 | Comment and line comment sheets (#58, #59) | `PhoneCommentSheet.tsx`, `PhoneComposer.tsx` · `.ph-btn` | 10px rect | pill |
| 19 | Finish review | `PhoneFinishReview.tsx` · `PhoneSheetBar` | 10px rect | pill pair, Cancel outlined |
| 20 | Action sheet primary, Cancel | `PhoneActionSheet.tsx` · `.ph-aprimary`, `.ph-acancel` | 10px rect | pill (rows stay rows) |
| 21 | Segmented control | `PhoneActionSheet.tsx`, `PhonePrSheet.tsx` · `.ph-seg` | 10px track | single-row track full radius. `.ph-seg-wrap` grid keeps 10px (open question 2) |
| 22 | Diff sheet pending, Wrap, Next | `PhoneDiffSheet.tsx` · `.ph-btn.is-narrow` | 10px rect, text | pill (keeps text, no `.is-round`) |
| 23 | Header menu button | `PhoneBars.tsx` · `.ph-iconbtn` | round | keep |
| 24 | Header menu items | `PhoneBars.tsx` · `.ph-menu button` | 12px popup rows | keep, a menu not buttons |
| 25 | Setup and error screens | `PhoneStates.tsx` · `.ph-btn` (buttons and the Tailscale link) | 10px rect | pill |
| 26 | App update Install, Dismiss | `ApkBanner.tsx` · `.ph-apk-install`, `.ph-apk-close` | 8px rect, 40 X | pill; X round and 44 |
| 27 | Session picker, new issue, sub-issues, edit title | `PhoneSessionPicker.tsx`, `PhoneNewIssue.tsx`, `PhoneSubIssues.tsx`, `PhoneEditTitle.tsx` · `.ph-btn` | 10px rect | pill |

## CSS changes

| File | Rule | Was | Now |
|---|---|---|---|
| `web/phone/phone-states.css` | `.ph-btn` `border-radius` | `10px` | `var(--borderRadius-full)` |
| `web/phone/phone-states.css` | `.ph-btn:active` | | new: `background: var(--button-default-bgColor-hover); border-color: var(--borderColor-emphasis)` |
| `web/phone/phone-states.css` | `.ph-btn:disabled` | muted label only | add `background: transparent; border-style: dashed` |
| `web/phone/phone-sheets.css` | `.ph-btn.is-primary:active` | | new: `background: var(--button-primary-bgColor-hover); border-color: var(--button-primary-bgColor-hover)` |
| `web/phone/phone-sheets.css` | `.ph-actionbar .ph-btn.is-round` | | new: `flex: none; width: 48px; min-width: 0; padding: 0` |
| `web/phone/phone-picker.css` | `.ph-btn.is-busy .spinner` | 12 x 12 | 14 x 14 |
| `web/phone/phone-shell.css` | `.ph-iconbtn` `border-radius` | `22px` | `var(--borderRadius-full)` |
| `web/phone/phone-shell.css` | `.ph-iconbtn:active` | border only | add `background: var(--button-default-bgColor-hover)` |
| `web/phone/phone-shell.css` | `.ph-iconbtn:disabled` | | new: `background: transparent; border-style: dashed; color: var(--fgColor-muted)` (moves from `phone-fit.css`) |
| `web/phone/phone-fit.css` | `.is-fit .ph-iconbtn`, `.is-fit .ph-iconbtn:disabled`, `.is-fit .ph-actionbar .ph-btn:disabled:not(.is-primary)` | fit-only round and dashed | delete, now covered globally on the phone |
| `web/phone/phone-fit.css` | `.is-fit .ph-sheet-head` padding | `0 14px 0 16px` | `0 8px` (same as full sheets) |
| `web/phone/phone-actions.css` | `.ph-seg` radius | `10px` | `var(--borderRadius-full)`; `.ph-seg-wrap` overrides back to `10px` |
| `web/phone/phone-sheets.css` | `.ph-apk-install` radius | `8px` | `var(--borderRadius-full)` |
| `web/phone/phone-sheets.css` | `.ph-apk-close` | 40 x 40 | 44 x 44, radius `var(--borderRadius-full)` |
| `web/findings.css` | `.ph-thread .finding-btn, .ph-thread .finding-btn.is-spent, .ph-thread .finding-retry` radius | `10px` | `var(--borderRadius-full)` |
| `web/findings.css` | `.ph-thread .finding-btn:active` | | new: `background: var(--button-default-bgColor-hover); border-color: var(--borderColor-emphasis)` |
| `web/findings.css` | `.ph-thread .finding-btn[aria-disabled='true']:not(.is-spent, .is-busy)` | | new: `opacity: 1; background: transparent; border: 1px dashed var(--borderColor-default); color: var(--fgColor-muted)` |
| `web/findings.css` | `.ph-thread .finding-btn .spinner` | | new: `order: -1` |

Any rule above that already sets a 10px or 8px radius on a `.ph-btn` variant must not override the new radius. None does today (checked `web/phone/*.css`).

## TSX changes

| File | Change |
|---|---|
| `web/phone/PhoneIcons.tsx` | add `BackIcon` |
| `web/phone/PhoneSheet.tsx` | close button renders `BackIcon`, `aria-label="Back"`, always first in the header (drop the `p.fit` branch that moved it right) |
| `web/phone/PhonePrSheet.tsx`, `web/phone/PhoneIssueSheet.tsx` | bar More: `className="ph-btn is-narrow is-round"`, `aria-label="More actions"`, child `<MoreIcon />` |

## Scope

- Every `.ph-*` class lives only under `web/phone/` and renders only inside the phone root `.phone` (`PhoneApp.tsx`). Editing those rules cannot reach the desktop.
- `.finding-btn` is shared. The desktop uses it in `web/FindingParts.tsx`, `web/FindingList.tsx` and `web/DispatchAll.tsx` (28 tall, 6px from `.btn`). Every finding rule here is under `.ph-thread`, which only `PhonePrSheet.tsx` and `PhoneIssueSheet.tsx` render. The bare `.finding-btn` rules and `.btn` in `web/base.css` stay untouched.
- `FindingBtn` markup does not change. The spinner moves by CSS order on the phone only.

## Android back

`useSheetStack` covers every sheet. Each `Level` pushed onto the stack owns one history entry, and `popstate` truncates to the restored depth. Layers opened with `openLayer` own their own entry. The round back button calls the same `pop` or `closeLayer`, so the button, the gesture and the swipe always agree.

| Sheet | Kind | Back closes |
|---|---|---|
| PR, issue | root `Level` | the sheet, to the list |
| Diff, thread, reply, action sheet, comment, composer, picker, edit title, finish review, confirm | `Level` | that sheet, to the one below |
| Finding dispatch, fix, PR dispatch, bot split, dispatch all, new issue, sub-issue sheets | `Level` (fit) | that sheet, to the PR or issue |
| Filter sheet | layer `filter` | the sheet, to the list |
| Search | layer `search` | search, to the list |
| Header menu, connection sheet, Activity row, non-default tab | layers | that layer |

While a fit sheet's request runs, the back button is disabled (dashed) and the scrim and Esc do nothing. The Android gesture still pops (open question 3).

## Checks against constraints.md

- Smallest text is 12px (sev badge, chip, meta). Control labels are 15px.
- Phone frames are 412x915.
- State never rides on colour alone: disabled is dashed, spent adds a check, busy adds a spinner and `aria-busy`, focus adds a ring.
- Tap targets: bar pills 48, bar More 48, sheet back 44, finding pills 44, APK close grows to 44.
- Sample data is synthetic: `acme-co/orders-api`, `acme-dev/tools`, authors `acme-dev`, `build-bot`, `sam-lee`.

## Open questions

1. `BackIcon` is new. The alternative is `ChevronIcon` rotated to point left, which needs no new icon but reads as "collapse" elsewhere in the app.
2. `.ph-seg-wrap` is a 3-column grid. A full-radius track looks odd over 2 rows, so the spec keeps it at 10px.
3. Android back during a running request closes the fit sheet today (`popstate` cannot be cancelled). Matching the dashed back button means re-pushing the entry while busy. Out of scope unless wanted.
