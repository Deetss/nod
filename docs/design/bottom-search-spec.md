# Bottom search and filter spec (round 2, layout A, phone)

Issue #32. Mockup: `bottom-search-mockup-phone.svg` and `.png` (dark, 412x915, frames 1 to 6) and `bottom-search-mockup-phone-light.svg` and `.png` (frames 1 and 3). Wireframe: `bottom-search-wireframe-A-phone.svg` (picked).
Colour tokens are the CSS custom properties in `web/tokens.css` (listed in `tokens.md`). Minimum font 12px (`constraints.md`). All boxes are x, y, w, h at 412x915 with `--ph-top` 0 and `--ph-bottom` 24. Phone only, the desktop is unchanged.
The large-title header from #31, the sync line, section headers and rows are unchanged (see `large-title-spec.md`). Only the list's top content and bottom padding change.

## Behaviour

- One floating bar sits 16px above the tab bar: a search pill (`Search pull requests`, `Search issues`) and a round filter button on its right.
- The filter button opens a bottom sheet with one checkbox row per filter. Ticks apply at once and the list updates under the scrim. Done or Close shuts the sheet.
- Filters combine with OR: a PR or issue shows if it is in any ticked section. Nothing ticked is today's `All`.
- With 1 or more filters on, the list shows only the ticked sections, each forced open (today's chip rule `prChip !== 'all'`, extended to a set).
- Tapping the pill opens search. The header and tab bar hide, the field sits on top of the keyboard with Cancel, and a flat result list fills the space above.
- Scrolling the list down hides the bar. Any scroll up brings it back.
- Each tab keeps its own filter set and its own query text is shared, as today (`query` in `PhoneApp.tsx`).

## Removed

| Element | Where it lives | Change |
|---|---|---|
| Chip row `Chips`, `.ph-chips`, `.ph-chip`, `.ph-chip-count` | `web/phone/PhoneBars.tsx` (component), `web/phone/phone-shell.css` (styles), rendered from `web/phone/PhoneInbox.tsx` and `web/phone/PhoneActivity.tsx` | Removed on PRs and Issues. The list starts with the sync line at y 113. |
| Header search button | `AppBar` in `web/phone/PhoneBars.tsx` (`aria-label="Search"`, `SearchIcon`) | Removed. The header keeps only the More button. |
| Header search mode | `AppBar` `searching` branch, `.ph-appbar.is-searching`, `.ph-search` in `phone-shell.css`; `.phone.is-searching .ph-list` and `.ph-section` overrides in `phone-list.css` | Replaced by the bottom search band below. `useLargeTitle(..., searching)` no longer locks `p` at 1; the header is hidden while searching. |
| Single chip state `prChip`, `issueChip` (strings) | `web/phone/PhoneApp.tsx` | Become `Set<SectionKey>` per tab. `prChips` and `issueChips` in `phone-logic.ts` stay and feed the sheet rows (drop the `all` entry). |

## Reused tokens and components

| Use | Token or component | Source |
|---|---|---|
| Pill and round button surface | `--button-default-bgColor-rest`, `--borderColor-default`, pressed `--borderColor-emphasis` (as `.ph-iconbtn`) | `web/tokens.css`, `web/phone/phone-shell.css` |
| Filter button | `.ph-iconbtn` (44 round), unchanged size | `phone-shell.css` |
| Filter on state | `--bgColor-accent-muted` fill, `--borderColor-accent-emphasis` border, `--fgColor-accent` glyph (the active tab pill colours) | `tokens.css`, `.ph-tab-ind` in `phone-shell.css` |
| Count badge | `.ph-count` look: `--bgColor-accent-emphasis`, `--fgColor-onEmphasis`, 12/18 700, radius 9, 2px ring | `phone-shell.css` |
| Search glyph | `SearchIcon` | `web/phone/PhoneIcons.tsx` |
| Filter sheet shell | `PhoneSheet` with `fit` (`.ph-sheet.is-fit`, `.ph-handle`, `.ph-sheet-head`, `.ph-sheet-title`, `.ph-sheet-sub`, `.ph-sheet-body`, `.ph-actionbar`) over `.ph-scrim` | `web/phone/PhoneSheet.tsx`, `phone-sheets.css`, `phone-fit.css`, `phone-actions.css` |
| Checkbox rows | `.ph-pk-row`, `.ph-pk-check`, `.ph-pk-node`, `.ph-pk-cap`, `.is-on` | `web/phone/phone-picker.css`, markup as `PhonePicker.tsx` |
| Sheet buttons | `.ph-btn`, `.ph-btn.is-primary`, disabled `.ph-btn.is-off` | `phone-states.css`, `phone-sheets.css` |
| Results line | `.ph-syncline` type (13/18, `--fgColor-muted`) | `web/phone/phone-list.css` |
| Rows, sections | `PrRow`, `IssueRow`, `SectionHeader`, `.ph-row`, `.ph-section` | `web/phone/PhoneList.tsx`, `phone-list.css` |
| Sheet stack and Back | `useSheetStack().openLayer` / `closeLayer` | `web/phone/useSheetStack.ts` |
| Keyboard position | `useKeyboardInset` (visual viewport height) | `web/phone/useKeyboardInset.ts` |

New, mark for review:

- `FilterIcon` in `PhoneIcons.tsx`: three round-capped lines, stroke 2, widths 16, 10 and 4, 6 apart, centred.
- `.ph-bottombar` fade: a gradient from transparent to `--bgColor-default` behind the bar (no new colour).

## Frames

| Frame | State |
|---|---|
| 1 | PRs at rest, no filters, header expanded (`p` 0) |
| 2 | PRs, Needs me and Mine on. Badge `2`, Org open hidden |
| 3 | Filter sheet open over frame 2 |
| 4 | Search active, query `webhook`, keyboard up, 6 results |
| 5 | PRs scrolled down, header collapsed (`p` 1), bar hidden |
| 6 | Issues at rest, no filters |

## Bottom bar (frames 1, 2, 6)

`.ph-bottombar`: `position: absolute; left: 0; right: 0; bottom: 16px` inside `.ph-main` (which ends at the tab bar top, y 826). `z-index: 3`, under the header (4) and the tab bar.

| Element | Box | Type | Colour, border, radius | Notes |
|---|---|---|---|---|
| Fade | 0, 746, 412, 80 | none | `--bgColor-default` from 0 to 100% opacity over the top 24px | `pointer-events: none`. Keeps rows from reading through the gap around the bar |
| Search pill | 16, 766, 336, 44 | placeholder 15/22 400 | fill `--button-default-bgColor-rest`, 1px `--borderColor-default`, radius 22 | A `button` (not an input) with `aria-label="Search pull requests"`. Pressed: `--borderColor-emphasis` |
| Search glyph | 30, 778, 20, 20 | `SearchIcon` stroke 2 | `--fgColor-muted` | |
| Placeholder | 60, 777, 278, 22 | 15/22 400 | `--fgColor-muted` | `Search pull requests`, `Search issues`, `Search activity`. One line, ellipsis |
| Filter button | 360, 766, 44, 44 | `FilterIcon` 20 | off: as `.ph-iconbtn`. On: fill `--bgColor-accent-muted`, border `--borderColor-accent-emphasis`, glyph `--fgColor-accent` | `aria-label="Filters, 2 on"` / `"Filters"`, `aria-haspopup="dialog"` |
| Badge | right edge 406, top 762, h 18, min-w 18, padding 0 5 | 12/18 700 | `--bgColor-accent-emphasis`, text `--fgColor-onEmphasis`, radius 9, ring `0 0 0 2px var(--bgColor-default)` | Centred text, `aria-hidden` (the button label carries the count) |

Badge states:

| Filters on | Badge | Button |
|---|---|---|
| 0 | none | default surface |
| 1 to 9 | the number | accent surface |
| 10 or more | `9+` | accent surface. Not reachable today (max 4 PR, 6 issue filters) |

The accent surface plus the badge number mean the on state never rests on colour alone.

List change: `.ph-list` gets `padding-bottom: 92px` (16 + 44 + 16 + 16) so the last row scrolls clear of the bar. While the bar is hidden the padding stays, so rows do not jump.

## Hide on scroll (frame 5)

- Scroll owner: the active pane's `.ph-list` (unchanged). The bar reads the same passive, `requestAnimationFrame`-throttled scroll listener as `useLargeTitle` and sets `.phone.is-bar-hidden`.
- Hide when the list has moved down 24px in one direction since the last direction change and `scrollTop > 56` (past the header collapse).
- Show on any upward move of 8px or more, at `scrollTop <= 56`, on a tab change, when a sheet or search closes, when the list cannot scroll, and in the loading, empty and error states.
- Pull to refresh never hides it.
- Animation: `transform: translateY(60px)` (44 + 16, fully behind the tab bar) and `opacity: 0`, 200ms `cubic-bezier(0.2, 0, 0, 1)`. Hidden sets `visibility: hidden` after the transition, so it leaves the tab order.
- `prefers-reduced-motion`: the bar never hides.

## Filter sheet (frame 3)

`PhoneSheet` with `fit`, over `.ph-scrim` (dark `rgb(1 4 9 / 60%)`, light `rgb(31 35 40 / 45%)`). Height by content. PRs, 4 rows: height 366, top 549. Issues, 5 rows: 415 (top 500), 6 with the bot section: 464 (top 451).

| Element | Box | Type | Colour, border, radius | Truncation |
|---|---|---|---|---|
| Sheet | 0, 549, 412, 366 | | `--bgColor-default`, radius 20 top, top edge `0 -2px 0 var(--borderColor-default)` | |
| Handle | 188, 557, 36, 4 | | `--borderColor-emphasis`, radius 2 | |
| Header | 0, 561, 412, 57 (56 + 1 border) | | bottom `--borderColor-default` | |
| Title | 16, 568, 324, 24 | 17/24 600 | `--fgColor-default` | ellipsis. `Filter pull requests`, `Filter issues` |
| Sub | 16, 592, 324, 18 | 13/18 400 | `--fgColor-muted` | ellipsis. `A PR shows if it is in any ticked section` (`An issue shows ...`) |
| Close | 354, 567, 44, 44 | `CloseIcon` | `.is-fit .ph-iconbtn` | |
| Row | 0, 618 + 49n, 412, 49 (48 + 1 border) | | bottom `--borderColor-muted`, pressed `--bgColor-neutral-muted` | |
| Check | 16, row + 13, 22, 22 | | off: 1.5px `--borderColor-emphasis`, radius 5. On: fill and border `--bgColor-accent-emphasis`, tick `--fgColor-onEmphasis` | |
| Label | 50, row + 13, to the count, 22 | 15/22, 600 when on | `--fgColor-default` | ellipsis |
| Count | right at 396 | 13/22 600 | `--fgColor-muted` | none |
| Action bar | 0, 814, 412, 101 | | `--bgColor-inset`, top `--borderColor-default` | |
| Clear | 16, 829, 114, 48 | 15 | `.ph-btn`, radius 10. Off (0 ticked): `.ph-btn.is-off` dashed, `--fgColor-muted`, `disabled` | |
| Done | 138, 829, 258, 48 | 15/22 600 | `.ph-btn.is-primary` (`--button-primary-bgColor-rest`, `--fgColor-onEmphasis`) | `Done`, `Done · 1 filter`, `Done · 2 filters` |

Rows, in this order, from `phone-logic.ts`:

- PRs (`PR_CHIP_LABELS`): Needs me, Mine, Org, Dependabot. Counts are section counts (`prChips`).
- Issues (`ISSUE_CHIP_LABELS`): In progress, Assigned, Created, Mentioned, Untriaged, plus the bot section's own title when present (`issueChips`).
- A section with count 0 still shows, with `0`, and can be ticked.

Rows are `role="checkbox"` with `aria-checked`. Clear unticks all and keeps the sheet open. Done, Close, a scrim tap, a swipe down on the strip (`shouldCloseSwipe`), Escape and Android Back all close it.

## Search (frame 4)

Tapping the pill sets `searching`, opens the `search` layer and focuses the input. The header and tab bar slide out (`display: none` once the keyboard is up), and the bar's pill becomes the input in the search band.

| Element | Box (keyboard 336, visual viewport 579) | Type | Colour, border, radius | Truncation |
|---|---|---|---|---|
| Results line | 0, 0, 412, 28, sticky `top: 0` | 13/18 400 | `--fgColor-muted` on `--bgColor-default`, bottom `--borderColor-hairline` | ellipsis. `6 results for “webhook”`, with filters `6 results for “webhook” · Needs me, Mine` |
| Results | 0, 28, 412, 487 | rows as today | | flat list, see below |
| Search band | 0, 515, 412, 64 | | `--bgColor-inset`, top `--borderColor-default` | |
| Input | 16, 525, 300, 44 | 15/22 400 | fill `--bgColor-default`, 2px `--borderColor-accent-emphasis` (focus), radius 22 | text scrolls inside the field |
| Glyph | 30, 537, 20, 20 | `SearchIcon` | `--fgColor-muted` | |
| Cancel | 324, 525, 72, 44 | 15/22 400 | `.ph-btn` (min-height overridden to 44), radius 10 | |

- Band position: `bottom: calc(100% - var(--ph-vvh))`, where `--ph-vvh` is `useKeyboardInset()` (visual viewport height) or `100%` with no keyboard. With the keyboard down the band sits on the bottom edge with `padding-bottom: var(--ph-bottom)`.
- Results: the rows of the active tab that match `filterPrs` / `matchesQuery`, within the ticked filters, in section order, each PR or issue once. No section headers. Rows are the normal `PrRow` / `IssueRow`.
- Scroll owner: the results list (`.ph-list.is-results`, `padding-top: 0`, `padding-bottom` the band height). The page does not scroll.
- An empty query shows the normal sections under the band (the list as filtered).
- Empty results: the results line reads `No results for “xyz”`. Under it an `EmptyBlock` (`PhoneStates.tsx`) with title `Nothing matches “xyz”`. With filters on, its body is `2 filters are on.` and a `.ph-btn` `Clear filters` clears them and keeps the query.
- Enter blurs the input (the keyboard drops) and keeps the results.
- Cancel and Escape clear the query, leave search and restore the list, header, tab bar and bar. Opening a result row keeps search behind the sheet; closing the sheet returns to the results.

## Keyboard and Back

- Escape: closes the filter sheet (`useFocusTrap` in `PhoneSheet`), or leaves search when the input or results have focus.
- Android Back (`useSheetStack` exists): the sheet opens with `openLayer('filter', close)` and search keeps `openLayer('search', ...)` (as `setSearchingLayer` today). One Back closes the sheet, or leaves search. With the keyboard up, the first Back is the system's and only drops the keyboard.
- Focus: opening the sheet focuses its first row; closing returns focus to the filter button. Leaving search returns focus to the pill.

## Safe areas

- Top: `--ph-top` is added to the header as today. The results line `top` is `var(--ph-top)` while searching.
- Bottom: the tab bar already holds `--ph-bottom`. The bar is inside `.ph-main`, so it needs no inset. The sheet action bar keeps `calc(14px + var(--ph-bottom))`. The search band adds `--ph-bottom` only when the keyboard is down.

## Header (unchanged except the button)

| Element | Box | Notes |
|---|---|---|
| `.ph-appbar` | 0, 0, 412, 113 to 57 | as `large-title-spec.md` |
| More button | 360, 6, 44, 44 | same place as today, now the only button |
| Title right limit | `right: calc(16px + 48px * var(--ph-p))` | was `96px * p`, one button now |

## Activity tab

Not drawn. Proposed: the same bar with `Search activity`, and a sheet with Needs me, Mentions, CI, Merged (`ACTIVITY_FILTER_LABELS`, today a single chip). `Mine hidden (n) · Show` stays. See open question 1.

## Checked against constraints.md

- Smallest text is 12px (badge, section headers, meta). Pass.
- Every action has a visible control: search pill, filter button, Clear, Done, Close, Cancel. Pass.
- State not by colour alone: filter on has a badge number, checks have a tick, focus has a 2px ring. Pass.
- Phone at 412x915, synthetic repos `acme-co/orders-api`, `acme-dev/tools`, authors `acme-dev`, `build-bot`, `sam-lee`. Pass.
- Desktop unchanged, so no 1660x870 frame.

## Invented copy

`Search pull requests`, `Search issues`, `Search activity`, `Filter pull requests`, `Filter issues`, `A PR shows if it is in any ticked section`, `Clear`, `Done · 2 filters`, `6 results for “webhook”`, `No results for “xyz”`, `Nothing matches “xyz”`, `2 filters are on.`, `Clear filters`.

## Open questions

1. Activity: same bar and multi-select sheet, or keep its single chip row? Its filters are single-select today.
2. Filters apply live. Done and Close then do the same thing. Keep both (the `fit` shell always has Close) or drop Done?
3. The results list is flat. Keep section headers in results instead?
