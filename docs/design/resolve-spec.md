# Resolve thread spec (round 2, layout B)

Mockups: `resolve-mockup.svg` (dark), `resolve-mockup-light.svg`, `resolve-mockup-phone.svg` (dark, 412x915).
Colour and type tokens come from `tokens.md`; the 12px minimum is from `constraints.md`. No new tokens.

## Behaviour

- Resolve / Unresolve sits on the thread path row, right end. Fix stays in the first card's header.
- Open threads default expanded. Resolved threads default collapsed to the path row.
- Expand is click only. Desktop Resolve and Unresolve show the `x` key chip (existing key in `web/inline/ThreadView.tsx`). Phone shows no chips.
- Scroll owner is the timeline pane (the parent of `.tl-list` in the PR detail pane). The page never scrolls. Panel 6 draws the pane scrollbar thumb.

## Elements

Boxes are x, y, w, h at 1660 relative to the thread item inside the timeline pane (mockup pane is 810 wide). Pane content width is the pane width minus 32.

| Element | Source | Box at 1660 | At 412 | Font | Colour tokens |
|---|---|---|---|---|---|
| Pane list padding | `.tl-list`, `web/timeline.css` | 16 all sides | 16 / 12 (`.ph-thread .tl-list`, `web/phone/phone-timeline.css`) | none | `bgColor-default` |
| Rail | `.tl-item::before`, `web/timeline.css` | x 19, w 2 | same | none | `borderColor-default` |
| Path row | `TlEvent`, `.tl-event-row`, `web/timeline.css` | 0, 0, content w, 40 | same, w 388 | row 14/20 | none |
| Mark | `.tl-mark`, `web/timeline.css` | 8x8 centred at x 21 | same | none | border `borderColor-emphasis` 1.5px |
| Path text | `.tl-code`, `web/timeline.css` | x 48, w 101 | same | `text-codeInline` 12/18 mono 400, no wrap | `fgColor-muted` |
| Open pill | `TlPill` neutral, `.tl-pill`, `web/timeline.css` | after path, 6 gap, h 22, w 50 | same | `text-caption-semibold` 12/18 600, nowrap | text `fgColor-muted`, border `borderColor-emphasis` |
| Resolved pill | `TlPill` success, `.tl-pill-success` | h 22, w 78 | same | same | `bgColor-success-muted`, `borderColor-success-emphasis`, `fgColor-success` |
| Hidden count | `.tl-age` style, `web/timeline.css` | after Resolved pill, 8 gap, collapsed only | not shown | `text-caption` 12/18 400, nowrap | `fgColor-muted` |
| Resolve / Unresolve | `.btn`, `web/base.css` | right end of row, h 32, w 108 / 122 | h 32, w 76 / 90, no chip | `text-body-medium` 14/20 400, nowrap | `button-default-bgColor-rest`, `borderColor-default` |
| Key chip `x` | `.kbd`, `web/base.css` | 18x18 inside button, right | removed | `text-codeInline` 12/18 mono | `fgColor-muted` on `bgColor-default`, `borderColor-default` |
| Expand | `.btn`, `web/base.css` | h 32, w 76, no chip | same | `text-body-medium` | as Resolve |
| Failed box | `.thread-error`, `web/diff.css` | x 48, 4 under row, w content-48 (730), h 36, radius 6 | w 340, h 50, text wraps to 2 lines | `text-caption` 12/18 400, wraps (`overflow-wrap: anywhere`) | `bgColor-danger-muted`, `borderColor-danger-emphasis`, `fgColor-danger` |
| Failed icon | `WarningIcon`, `web/inline/icons.tsx` | 14px, left in box | same | none | `fgColor-danger` |
| Retry | `.thread-btn` as used in the error row of `web/inline/ThreadView.tsx` | h 24, w 52, right in box | same | `text-caption` 12/18 | `button-default-bgColor-rest`, `borderColor-default` |
| Card | `.tl-card`, `web/timeline.css` | x 48, w content-48 (730), h 115 | w 340 | none | `bgColor-default`, `borderColor-default` |
| Card header | `.tl-card-h`, `web/timeline.css` | h 40, 14 side padding | same | author `text-body-medium-semibold`, nowrap with ellipsis; age `text-caption` | `fgColor-default`, `fgColor-muted` |
| Fix | `CommentFixButton`, `.fix-comment`, `web/fix-checks.css` | right end of header, h 24, w 44 | same | `text-caption` 12/18 | `button-default-bgColor-rest`, `borderColor-default` |
| Card body | `.tl-card-b`, `web/timeline.css` | 14 / 16 padding, 22px lines | same | `text-body-medium` 14/20, title 600, wraps | `fgColor-default` |

Gap from a path row to its card is 20 (`.tl-item` margin). In the failed state the box takes 4 above and 10 below, so the card sits 4 lower than in the default state. Next thread row after a card is 20 below.

## States

- Open (default): neutral Open pill, `Resolve [x]` enabled, card shown.
- Busy: Resolve takes the `.btn[disabled]` look from `web/base.css` (dashed `borderColor-emphasis`, transparent fill, `fgColor-muted` text) with a 12px `.spinner` and the label `Resolving...`. Pill and card unchanged. The button ignores clicks and `x` while busy (matches `resolveBusy` in `ThreadView.tsx`).
- Failed: the Failed box appears under the path row, Resolve returns to rest, Retry repeats the call. Text is `Could not resolve thread: GitHub API error 502`. It clears on the next attempt.
- Resolved, collapsed (default for resolved): Resolved pill, `1 comment hidden`, `Expand`. Card not rendered.
- Resolved, expanded: Resolved pill, `Unresolve [x]`, card shown with Fix. No Collapse control this round.
- Unresolve failure: same box, text `Could not unresolve thread: ...`.

## Constraints that forced a change from wireframe B

- Phone drops `1 comment hidden`. Path, pill and Expand fill the 388px row, so the count would wrap.
- Phone mockup draws Busy without its card to fit 915px. The card is unchanged in that state.
- Open pill is a neutral `TlPill`. `PrThreadRow` shows a pill only for Resolved today, so this is a new use of an existing tone.
- Buttons use `.btn` (32px, `web/base.css`) rather than `.thread-btn`, because the path row is 40px and `.thread-btn` is scoped to inline threads. Build may reuse `.thread-btn` if sizes match.
- The Fix glyph from `web/CommentFix.tsx` is not drawn. The label `Fix` is.
- Light theme uses the same layout with the Light column of `tokens.md`.
