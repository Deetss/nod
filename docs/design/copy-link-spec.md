# Copy link spec (round 2, layout A)

Mockups: `copy-link-mockup.svg` (dark), `copy-link-mockup-light.svg`. Wireframe: `copy-link-wireframe-A.svg`.
Colour and type tokens come from `tokens.md`; the 12px minimum is from `constraints.md`. No new tokens.
The phone already has Copy link in its action sheet (`web/phone/link-actions.ts`), so this spec is desktop only. The copy code is shared.

## Behaviour

- Click copies the item's GitHub web URL. Headers always show the button. Rows, checks, comments and sub-issues show it on hover, selection or focus, like `.row-ext`.
- Key `Y` copies the focused item's link (PR or issue in the detail pane, the selected row in a list). `y` stays Ready for review. The help sheet lists `Y` as `copy link`.
- Pressed: the glyph becomes a check in `fgColor-success` for 1.5s, and a `.toast` reads `Link copied` for 2s.
- Failure: a `.toast` reads `Could not copy link`. The button stays as it was.
- Copy uses `navigator.clipboard.writeText`, then the textarea fallback in `link-actions.ts`.
- Which URL: PR and issue `url`. Check rows use the check's `url` and show no button when it has none. Comments use the comment's own link when the data has one, else the item URL with its comment anchor. Sub-issue rows use that issue's URL.
- Row buttons stop click propagation, so copying never selects or opens the row.
- Phone unchanged.

## Elements

| Element | Source | Box at 1660 | Font / glyph | Colour tokens |
|---|---|---|---|---|
| Header button | `.btn` icon-only, `web/base.css` | 32x32, 8 gap after its neighbour, `aria-label` and `title` `Copy link` | link glyph 16px | `button-default-bgColor-rest`, `borderColor-default`, `fgColor-default` |
| Issue header slot | `Edit title` row in the detail pane | right of Edit title, before the up and down buttons | as above | as above |
| PR header slot | `.pr-title-row`, `web/ci.css` | right of Open on GitHub, 8 gap | as above | as above |
| Row button | new sibling of `.ext-link`, `web/ci.css` | 22x22, absolute, top 6, right 28 on PR rows (left of the GitHub link at right 6), right 6 on issue rows | link glyph 14px | `fgColor-muted`, hover `bgColor-neutral-muted` and `fgColor-default` |
| Check row button | `.check-row` grid, `web/ci.css` | 22x22 column added before the GitHub link, grid `16px 86px 1fr auto 22px 18px` | link glyph 14px | as row button |
| Comment header button | `.tl-card-h`, `web/timeline.css` | 22x22, right end (`margin-left: auto`), 14 from the edge, after Fix when present | link glyph 14px | as row button |
| Sub-issue row button | sub-issue row, `web/issues` | 22x22, right end, 14 from the edge | link glyph 14px | as row button |
| Copied state | same button | same box | check glyph 14 or 16px | `fgColor-success` |
| Toast | `.toast`, `web/orca.css` | existing stack, bottom | `text-body-medium` 14/20 | success: `fgColor-success` check, failure: `bgColor-danger-muted`, `borderColor-danger-emphasis`, `fgColor-danger` |

## States

| State | Result |
|---|---|
| Row not hovered or focused | Button hidden (`opacity: 0`), keeps its box so nothing shifts |
| Hover or focus-visible | Button shown |
| Copied | Check glyph for 1.5s, then link glyph again |
| Check has no URL | No button |
| Clipboard blocked | Failure toast |

## Scroll owner

Unchanged. No pane gains a scrollbar.
