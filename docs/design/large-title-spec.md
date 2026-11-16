# Large-title header spec (round 2, layout A, phone)

Issue #31. Mockup: `large-title-mockup-phone.svg` and `.png` (dark, 412x915, 6 frames). Wireframe: `large-title-wireframe-A-phone.svg` (picked). Generator: `tools/large-title-mockup.py`.
Tokens come from `tokens.md` and `density-tokens.md`, comfortable density. Minimum font 12px (`constraints.md`). Phone only, the desktop is unchanged.
Chip row, sync line, section headers and rows are unchanged (issues #32, #33 and #39 change them later). Only their position in the scroll moves.

## Behaviour

- The header sits over the top of `.ph-main` and the list scrolls under it. The page never scrolls (`.phone` is `position: fixed; overflow: hidden`). The scroll owner is the active pane's `.ph-list`.
- `p = clamp(scrollTop / 56, 0, 1)`. `0` is expanded, `1` is collapsed. A passive scroll listener on the active list writes `--ph-p` on `.phone`, throttled with `requestAnimationFrame`. No CSS transition while dragging.
- Collapse distance is 56px. Over it the header shrinks 113 to 57 and the title shrinks 28/36 to 17/24 (linear in `p`). Rows move 1:1 with the finger because the header's bottom edge tracks the list's first row.
- Chip row and sync line are the first children of the list, below a 113px top padding. They scroll away with the rows. Chips are fully hidden at scrollTop 108, the sync line at 136.
- Sticky: the header bar (always) and `.ph-section` (`top: 57px`, was `0`). Not sticky: chip row, sync line, the 56px of header growth.
- Snap: on scroll end, if `0 < scrollTop < 56` the list scrolls to 0 (under 28) or 56 (28 and over). `prefers-reduced-motion` snaps without animation.
- The list body has `min-height: calc(100% + 56px)` so a short list can still finish the collapse. Loading (`.is-locked`), empty and error states do not get it, so the header stays expanded there.
- Each tab keeps its own scroll. On a tab change `--ph-p` is recomputed from the new active list and the title text changes with it (Pull requests, Issues, Activity). Tapping the active tab scrolls to 0 (existing `selectTab`), which expands the header.
- Search: the header locks at `p = 1`, the title is replaced by the input, the list padding-top drops to 57 and the list scrolls to 0 so the chips show. Closing search restores the padding and `p` follows the scroll again.
- Pull to refresh is unchanged. The offset still moves the sync line, so the gap opens between the chip row and the sync line.
- `--ph-top` (safe-area inset, 0 in the TWA) is added to the header's heights, the list padding-top and the sticky `top`.
- Menu popover (`.ph-menu`, `top: 52px; right: 8px`) is unchanged. The buttons never move, so it fits at every `p`.

## Reused components and classes

| Element | Class or component | Source |
|---|---|---|
| Header | `AppBar`, `.ph-appbar` | `web/phone/PhoneBars.tsx`, `web/phone/phone-shell.css` |
| Title | `.ph-apptitle` | same |
| Round buttons | `.ph-iconbtn` | same |
| Search input | `.ph-search` | same |
| Chip row, chip | `Chips`, `.ph-chips`, `.ph-chip` | `PhoneBars.tsx`, `phone-shell.css` |
| Tab bar | `TabBar`, `.ph-tabbar`, `.ph-tab`, `.ph-count` | same |
| Scroll owner, sync line | `PullList`, `.ph-list`, `.ph-syncline` | `web/phone/PhoneList.tsx`, `web/phone/phone-list.css` |
| Section header | `SectionHeader`, `.ph-section` | same |
| PR row | `PrRow`, `.ph-row`, `.ph-badge`, `.ci`, `.draft-chip` | `PhoneList.tsx`, `phone-list.css`, `web/base.css`, `web/detail.css` |
| Issue row | `IssueRow`, `.status-chip`, `.chip.label-chip` | `PhoneList.tsx`, `web/issues.css`, `web/issues/parts.tsx` |
| Activity row | `.ph-arow`, `.ph-aicon`, `.ph-updates`, `.ph-afilter` | `web/phone/PhoneActivity.tsx`, `phone-list.css` |
| Pager | `SwipePager`, `.ph-pane` | `web/phone/SwipePager.tsx`, `phone-swipe.css` |

Changes to existing code:

- `AppBar` renders inside `.ph-main` (`position: relative`) and the header is `position: absolute; top: 0; z-index: 4`. The `ApkBanner` stays in flow above `.ph-main`.
- `Chips` moves from outside the scroller into `.ph-list` (`PhoneInbox`, `PhoneActivity`).
- `.ph-iconbtn` and its use for Close search go from radius 10 to 22.
- `.ph-section` sticky `top` changes from `0` to `57px`.
- The `Logo` leaves the phone bar.
- New type token `text-title-large` 28 / 36, 600.

## Elements (412x915, dark, `--ph-top` 0)

Colour tokens are from `tokens.md`. "default" means `fgColor-default`, "muted" means `fgColor-muted`.

### Header

| Element | Box x, y, w, h | Font | Colour | Truncation |
|---|---|---|---|---|
| `.ph-appbar` expanded (`p` 0) | 0, 0, 412, 113 (112 + 1 border) | none | `bgColor-inset`, bottom `borderColor-default` | none |
| `.ph-appbar` collapsed (`p` 1) | 0, 0, 412, 57 (56 + 1 border) | none | same | none |
| Title at `p` 0 | 16, 60, up to 380, 36 | `text-title-large` 28/36, 600 | default | one line, ellipsis |
| Title at `p` 1 | 16, 16, up to 284, 24 | `.ph-apptitle` 17/24, 600 | default | one line, ellipsis |
| Title between | bottom edge 16 above the header's bottom border, size `28 - 11p`, line `36 - 12p`, right limit `396 - 96p` | | | |
| Search button | 308, 6, 44, 44, radius 22 | glyph `SearchIcon` 20 at 320, 18 | fill `button-default-bgColor-rest`, border `borderColor-default`, glyph default | none |
| More button | 360, 6, 44, 44, radius 22 | `MoreIcon` 20 at 372, 18 | same | none |

States: default as above. Pressed `.ph-iconbtn:active` border `borderColor-emphasis`. Menu open sets `aria-expanded` and shows `.ph-menu` (unchanged). Header height and title never depend on the tab, only the title text does.

### Search (frame 6)

| Element | Box | Font | Colour |
|---|---|---|---|
| Header | 0, 0, 412, 57, locked at `p` 1 | none | as collapsed |
| `.ph-search` | 16, 6, 336, 44, radius 10 | 15/22 400 | fill `bgColor-default`, border `borderColor-accent-emphasis`, text default, placeholder muted |
| Close button | 360, 6, 44, 44, radius 22 | `CloseIcon` 20 | as the round buttons |

Query text is one line, clipped by the input. Close clears the query and leaves search. Rows filter as today. Section counts stay unfiltered, as today (not changed here).

### List (all tabs)

| Element | Box x, y, w, h | Font | Colour | Truncation |
|---|---|---|---|---|
| List top padding | 0, 0, 412, 113 (57 while searching) | none | `bgColor-default` | none |
| `.ph-chips` | 0, 113, 412, 52 | none | `bgColor-default`, bottom `borderColor-hairline` | scrolls sideways |
| `.ph-chip` | x from 12, 8 apart, y 116.5, h 44, radius 22 | 15/22, 600 when selected | selected fill and border `bgColor-accent-emphasis`, text `fgColor-onEmphasis`. Others fill `bgColor-default`, border `borderColor-default`, text default | no wrap, row scrolls |
| `.ph-syncline` | 0, 165, 412, 28, padding 5 16 | `text-caption` 13/18 | muted | one line |
| `.ph-section` | 0, y, 412, 44, padding 0 16 | 12/16, 600, uppercase | fill `bgColor-muted`, hairline top and bottom, text muted | count right |
| `.ph-row` PR or issue | 0, y, 412, 99 (121 with a two-line title) | see rows | none, bottom `borderColor-hairline` | see rows |
| `.ph-arow` | 0, y, 412, 73 (72 + 1 border) | see rows | none | see rows |

Frame 1 positions: sync line 165, Needs my review header 193, first row 237, Mine header 435, Org open header 771.

### PR row (inside 32 to 396)

| Part | Box (row top `y`) | Font | Colour | Truncation |
|---|---|---|---|---|
| Unread dot | 12, y + 18, 9 x 9 | none | `fgColor-accent` | none |
| Title | 32, y + 12, 364 minus chips and badges, 22 per line | 15/22, 600 when unseen | default | 2 lines, then ellipsis |
| Draft chip, UPDATED or NEW badge | right aligned, y + 12, h 20 | 12, badge 700 | muted, dashed or inset `borderColor-default` | none |
| CI pill | 32, y + 12 + 22n + 6, h 22 | 12/18, 600 on fail | pass and running muted, fail `fgColor-danger` on `bgColor-danger-muted` | none |
| Status text | after the pill + 6, same line | 13/18 | muted | one line, ellipsis |
| Meta line | 32, 6 below the CI line, h 18 | 12/18, `#n` 700 | muted | one line, ellipsis |

### Issue row

Same box as the PR row. The CI line holds the status chip (`.status-chip`, h 20, 12/20, default text, dot by status), up to 2 label chips (`.chip.label-chip`, h 20, 12) and the status text (`New comment · n comments`, 13/18, muted, ellipsis). Meta line `repo #n · author · age`.

### Activity row

| Part | Box (row top `y`) | Font | Colour | Truncation |
|---|---|---|---|---|
| Unread dot | 10, y + 32, 9 x 9 | none | `fgColor-accent` | none |
| `.ph-aicon` | 28, y + 20, 32, 32 | glyph 18 | fill `bgColor-muted`, border `borderColor-default`, glyph muted | none |
| Title | 72, y + 15, 324 minus pill, 22 | 14/22, 600 when unread | default | one line, ellipsis |
| `.ph-updates` pill | right at 396, y + 16, h 20 | 12/20, 600 | fill `bgColor-neutral-muted` | none |
| Meta | 72, y + 37, to the age, 20 | 13/20 | muted | one line, ellipsis |
| Age | right at 396, y + 37 | 13/20 | muted | none |
| `.ph-afilter` | 0, y, 412, 30, padding 4 16 8 | 13/18, link 600 | muted, link `fgColor-accent` | none |

### Tab bar (unchanged, listed for position)

| Element | Box | Font | Colour |
|---|---|---|---|
| `.ph-tabbar` | 0, 826, 412, 89 (1 border, 64 bar, 24 inset) | none | `bgColor-inset`, top `borderColor-default` |
| Active pill | slot centre - 32, 833, 64, 32, radius 16 | none | `bgColor-accent-muted` |
| Icon | slot centre - 12, 837, 24, 24 | none | active `fgColor-accent`, else muted |
| Label | centred, y 867, h 18 | 13/18, 600 when active | active default, else muted |
| `.ph-count` | right edge slot centre + 26, y 831, h 18 | 12/18, 700 | `bgColor-accent-emphasis`, text `fgColor-onEmphasis`, 2px ring `bgColor-inset` |

Slot centres are 68.7, 206 and 343.3.

## Frames

| Frame | State | `scrollTop` | `p` |
|---|---|---|---|
| 1 | PRs, expanded | 0 | 0 |
| 2 | PRs, mid-collapse | 28 | 0.5 (header 85, title 22.5/30) |
| 3 | PRs, collapsed | 376 | 1 (chips and sync line gone, Mine header 59 from the top) |
| 4 | Issues, expanded | 0 | 0 |
| 5 | Activity, expanded | 0 | 0 |
| 6 | Search open, query `release` | 0 | 1 (locked) |

Frames 1 to 3 show Org open expanded (it is collapsed by default) so the list is long enough to collapse.

## Other states

- Loading, empty, error (`PhoneStates`): list locked or short, header stays expanded, chips and sync line as today.
- Short list: the min-height pad makes the collapse reachable, and the snap rule settles `p` at 0 or 1.
- Tab swipe: the header keeps its height during the swipe and takes the new list's `p` when the tab commits.
- Offline and cached banner: unchanged, they sit in the list under the sync line.

## Decisions to check

1. Title copy is `Pull requests`, `Issues`, `Activity`. Today the bar says `Nod` on PRs and Issues. The wireframe used these words.
2. The logo is gone from the phone bar (the wireframe has none).
3. Button order stays search then more (as built). Wireframe A had more then search.
4. Buttons are 44 round, wireframe boxes were 40. 44 is the existing touch target.
5. Title stays left-aligned when collapsed. Wireframe frame 3 centred it.
6. Expanded height is 113 (collapse 56). The wireframe used about 136 with a blank band, 113 is enough for a 28px title below the buttons.
7. New type size 28/36, not in `tokens.md`.
8. The status bar is outside the page in the TWA (`phone-shell.css`), so it is not drawn. The wireframes drew one.
9. Counts that need the live fixture server are derived by hand from the seeds (Issues chips: All 170, In progress 4, Assigned 4, Created 19, Mentioned 1, Untriaged 6). Check them against the running fixtures.
10. Activity has no fixture seed. Rows use fixture PR and issue titles with invented event pairings (verbs from `verbFor`), `Synced 14:02 · 6 items moved`, and `Mine hidden (2)`.
