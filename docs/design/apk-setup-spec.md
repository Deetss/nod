# Android first-launch setup spec (round 2, layout B)

Mockup: `apk-setup-mockup-phone.svg` and `.png` (dark, 412x915, 10 frames). Wireframe: `apk-setup-wireframe-B-phone.svg` (picked). Generator: `tools/gen_apk_setup_mockup.py` (the box tables below are written by the same code that draws the mockup).
Colour and type tokens come from `tokens.md`; the 12 px minimum is from `constraints.md`. No new colour tokens. All hosts are synthetic (`desk.example-tailnet.ts.net`).

## What it is

A native Activity in the TWA's `android/` project, shown before the web app opens. Dark only, to match the TWA theme colour `bgColor-default` #0d1117. Phone only. Units are dp, which equal the px in the mockup at 412 wide.

## Flow

1. Welcome (frame 1) lists three methods. Scan is first and tinted.
2. Each method opens a focused step: camera (2), type the address (3), paste the pair link (10).
3. Check server runs the three-row check (4). A failure shows its row and an error card (5, 6, 7).
4. Success (8) saves the server, then opens the web app in the TWA at the URL shown.
5. From the app menu, Change server (9) opens the welcome step with the current host and Cancel.

The pair link path: a `nod://pair` link opens frame 10 with the field filled and the host found card shown.

## Colour tokens used (dark)

| Token | Hex |
|---|---|
| `bgColor-default` | `#0d1117` |
| `bgColor-muted` | `#151b23` |
| `bgColor-inset` | `#010409` |
| `fgColor-default` | `#f0f6fc` |
| `fgColor-muted` | `#9198a1` |
| `fgColor-onEmphasis` | `#ffffff` |
| `fgColor-accent` | `#4493f8` |
| `fgColor-success` | `#3fb950` |
| `fgColor-danger` | `#f85149` |
| `bgColor-accent-emphasis` | `#1f6feb` |
| `bgColor-accent-muted` | `#111d2e` |
| `bgColor-success-muted` | `#12261e` |
| `bgColor-danger-muted` | `#25181c` |
| `button-primary-bgColor-rest` | `#238636` |
| `button-default-bgColor-rest` | `#212830` |
| `borderColor-default` | `#3d444d` |
| `borderColor-muted` | `#2f353d` |
| `borderColor-emphasis` | `#656c76` |
| `borderColor-accent-emphasis` | `#1f6feb` |
| `borderColor-danger-emphasis` | `#da3633` |

`bgColor-accent-emphasis` is used for the keyboard Go key, the progress indicator and the primary row icon only. The primary button is green (`button-primary-bgColor-rest`), the same as the web app's primary button.

## Type

| Use | Size / line | Weight | Token |
|---|---|---|---|
| Screen and sheet title | 20/28 | 600 | `text-title-medium` |
| Row headline, error headline, host in cards | 16/24 | 600 | `text-title-small` |
| Field and host value | 16/24 | 400 | `text-title-small` at weight 400 (input text is never under 16) |
| Body, section label, button label, check headline | 14/20 | 400 or 600 | `text-body-medium`, `text-body-medium-semibold` |
| Captions, supporting text, step label | 12/18 | 400 | `text-caption` |
| Chip label, field label | 12/18 | 600 | `text-caption-semibold` |
| URL, pair link, error detail | 12/18 | 400 | `text-codeInline`, monospace |

Font is the system sans (`fontStack-system` resolves to Roboto on Android). The SVG uses Liberation Sans so line breaks match within a word or two.

## Shape and touch

- Buttons full radius, 48 high. Method rows 12 radius. Fields 4. Chips 8. Cards 12. Sheet 28 top.
- Every tappable target is at least 48x48. Icon buttons are a 40 px round disc with the glyph centred, inside a 48 px target. The Paste chips are 32 high and get a 48 px touch target (extra padding, not drawn).
- Page gutter is 20. Gap between rows 12 (welcome), 8 (checks).
- Status bar 24 and the 3-button nav bar 48 are drawn for scale only. Use edge-to-edge with the system bar colour `bgColor-default` #0d1117 (camera: `bgColor-inset` #010409) and light bar icons.

## Components

Sub-elements in the frame tables use the component of the same name. `row`, `check-row-*` and `error-card` are containers; their children are listed on their own lines.

| Component | Is | Type | Colour | Radius | Default state | Other states |
|---|---|---|---|---|---|---|
| `badge` | Success badge, 112 px disc, 6 px check | n/a | disc `button-primary-bgColor-rest` #238636, check `fgColor-onEmphasis` #ffffff | full | Static | none |
| `body` | Body copy, TextView | 14/20 400 `text-body-medium` | `fgColor-muted` #9198a1 | n/a | Static | none |
| `body-fg` | Body copy on the error card | 14/20 400 `text-body-medium` | `fgColor-default` #f0f6fc | n/a | Static | none |
| `btn-outlined` | M3 outlined button | 14/20 600 `text-body-medium-semibold` | no fill, border `borderColor-emphasis` #656c76 1 px, label `fgColor-default` #f0f6fc | full (24) | Enabled | Pressed: ripple. Focused: 2 px `borderColor-accent-emphasis` ring. Disabled: border `borderColor-muted`, label `fgColor-muted` |
| `btn-primary` | M3 filled button | 14/20 600 `text-body-medium-semibold` | fill `button-primary-bgColor-rest` #238636, label `fgColor-onEmphasis` #ffffff | full (24) | Enabled | Pressed: ripple. Focused: 2 px `borderColor-accent-emphasis` ring, 2 px gap. Disabled: fill `button-default-bgColor-rest` #212830, dashed border `borderColor-muted` #2f353d, label `fgColor-muted` #9198a1. Loading: not used, the check screen replaces it |
| `camera` | Camera preview (placeholder fill `button-default-bgColor-rest` #212830) | n/a | live preview | n/a | Live | Permission denied: see Android notes. Torch on or off |
| `caption` | Caption, TextView | 12/18 400 `text-caption` | `fgColor-muted` #9198a1 | n/a | Static | none |
| `caption-scrim` | Caption on the camera | 12/18 400 `text-caption` | `fgColor-default` #f0f6fc | n/a | Static | none |
| `card` | Outlined card | see parts | fill `bgColor-muted` #151b23, border `borderColor-muted` #2f353d 1 px | 12 | Static | none |
| `check-icon` | Leading status icon, 32 px | n/a | done: disc `button-primary-bgColor-rest` #238636 + check `fgColor-onEmphasis` #ffffff. running: ring `borderColor-muted` #2f353d + arc `fgColor-accent` #4493f8. failed: disc `bgColor-danger-muted` #25181c + ring `borderColor-danger-emphasis` #da3633 + X `fgColor-danger` #f85149. pending: dashed ring `fgColor-muted` #9198a1 | full | Per row state | none |
| `check-row-done` | Check list item, done | see parts | fill `bgColor-muted` #151b23, border `borderColor-muted` #2f353d 1 px | 12 | Passed | none |
| `check-row-fail` | Check list item, failed | see parts | fill `bgColor-danger-muted` #25181c, border `borderColor-danger-emphasis` #da3633 2 px | 12 | Failed | The X icon marks it, so colour is not the only cue |
| `check-row-pend` | Check list item, not reached | see parts | no fill, dashed border `borderColor-muted` #2f353d 1 px, title `fgColor-muted` #9198a1 | 12 | Pending | none |
| `check-row-run` | Check list item, running | see parts | fill `bgColor-muted` #151b23, border `borderColor-accent-emphasis` #1f6feb 2 px | 12 | Running | Rotates the spinner arc |
| `check-sub` | Check supporting text | 12/18 400 `text-caption` | `fgColor-muted` #9198a1 | n/a | Static | none |
| `check-title` | Check headline | 14/20 600 `text-body-medium-semibold` | `fgColor-default` #f0f6fc (`fgColor-muted` when pending) | n/a | Static | none |
| `chip` | M3 assist chip with clipboard glyph (32 px chip in a 48 px target) | 12/18 600 `text-caption-semibold` | fill `button-default-bgColor-rest` #212830, border `borderColor-default` #3d444d, label and glyph `fgColor-default` #f0f6fc | 8 | Rest, shown when the clipboard has text | Pressed: ripple. Hidden: clipboard empty. Focused: 2 px accent ring |
| `err-detail` | Technical detail line | 12/18 400 monospace `text-codeInline` | `fgColor-muted` #9198a1 | n/a | Static | Selectable, so it can be copied into a ticket |
| `err-title` | Error headline | 16/24 600 `text-title-small` | `fgColor-default` #f0f6fc | n/a | Static | none |
| `error-card` | Error card, M3 outlined card | see parts | fill `bgColor-danger-muted` #25181c, border `borderColor-danger-emphasis` #da3633 1.5 px | 12 | Shown only after a failure | Height follows the body text (2 lines in these frames). Announced as an alert |
| `field` | M3 outlined text field with label | label 12/18 600 `text-caption-semibold`, value 16/24 400 | fill `bgColor-default` #0d1117, label `fgColor-muted` #9198a1, value `fgColor-default` #f0f6fc, border `borderColor-emphasis` #656c76 1 px | 4 | Rest (empty shows the example host as hint, `fgColor-muted`) | Focused: border and label `borderColor-accent-emphasis` #1f6feb / `fgColor-accent` #4493f8, 2 px, caret `fgColor-accent`. Error: border `borderColor-danger-emphasis` #da3633 2 px, label `fgColor-danger` #f85149, supporting text states the problem. Disabled while checking: `bgColor-muted` fill, border `borderColor-muted` |
| `field-value` | Field or host text | 16/24 400 (`text-title-small` at weight 400) | `fgColor-default` #f0f6fc (muted #9198a1 on Connected) | n/a | Static | none |
| `field-value-mono` | Pair link text in the field | 12/18 400 monospace `text-codeInline` | `fgColor-default` #f0f6fc | n/a | Static | Wraps at the field edge |
| `handle` | Drag handle, 40x4 | n/a | `borderColor-emphasis` #656c76 | 2 | Static | none |
| `host-box` | Read-only host, outlined field look | 16/24 400 | fill `bgColor-muted` #151b23, border `borderColor-muted` #2f353d 1 px, text `fgColor-default` #f0f6fc | 8 | Static | none |
| `icon-btn` | Filled tonal icon button, 40 px disc in a 48 px target | 24 px glyph, 2 px stroke | disc `button-default-bgColor-rest` #212830, glyph `fgColor-default` #f0f6fc | full | Rest | Pressed: ripple. Focused: 2 px `borderColor-accent-emphasis` ring. Disabled: glyph `fgColor-muted` |
| `icon-btn-scrim` | Icon button over the camera | 24 px glyph | disc `bgColor-inset` #010409, glyph `fgColor-default` #f0f6fc | full | Rest | Flash on: glyph `fgColor-accent` #4493f8 and disc `bgColor-accent-muted` #111d2e. Pressed and focused as `icon-btn` |
| `icon-small` | Inline 20 px status glyph | n/a | `fgColor-muted` #9198a1 (info), `fgColor-danger` #f85149 (warning) | n/a | Static | none |
| `label` | Section label | 14/20 600 `text-body-medium-semibold` | `fgColor-default` #f0f6fc | n/a | Static | none |
| `mono` | URL text | 12/18 400 monospace `text-codeInline` | `fgColor-default` #f0f6fc | n/a | Static | Wraps at the box edge |
| `progress` | M3 linear progress, 4 px | n/a | track `button-default-bgColor-rest` #212830, indicator `bgColor-accent-emphasis` #1f6feb | 2 | Determinate or indeterminate | Indeterminate until the browser launch call returns |
| `row` | Method row, M3 list item (3 line) in a card | see parts | fill `bgColor-muted` #151b23, border `borderColor-muted` #2f353d 1 px | 12 | Rest | Pressed: fill `button-default-bgColor-rest` #212830 (ripple). Focused: 2 px `borderColor-accent-emphasis` #1f6feb. Disabled: not used |
| `row-chev` | Trailing chevron, 2 px stroke | n/a | `fgColor-muted` #9198a1 | n/a | Shown | none |
| `row-desc` | List item supporting text | 12/18 400 `text-caption`, max 2 lines | `fgColor-muted` #9198a1 | n/a | Static | none |
| `row-icon` | Leading icon disc, 24 px glyph | n/a | disc `button-default-bgColor-rest` #212830 + border `borderColor-default` #3d444d, glyph `fgColor-default` #f0f6fc; on the primary row disc `bgColor-accent-emphasis` #1f6feb, glyph `fgColor-onEmphasis` #ffffff | full (48 px disc) | Rest | none |
| `row-primary` | First method row (scan), same item | see parts | fill `bgColor-accent-muted` #111d2e, border `borderColor-accent-emphasis` #1f6feb 1.5 px | 12 | Rest | Pressed: border 2 px. Focused: as `row`. The icon disc is filled, so the row differs by more than colour (first position, filled icon) |
| `row-title` | List item headline | 16/24 600 `text-title-small` | `fgColor-default` #f0f6fc | n/a | Static | none |
| `sheet` | M3 modal bottom sheet (standard, non-dismissible) | see parts | fill `bgColor-muted` #151b23 | 28 top | Open | Dragging up is not supported |
| `sheet-title` | Sheet title | 20/28 600 `text-title-medium` | `fgColor-default` #f0f6fc | n/a | Static | none |
| `title` | Screen title, TextView | 20/28 600 `text-title-medium` | `fgColor-default` #f0f6fc | n/a | Static | none |
| `url-box` | Read-only URL box | see parts | fill `bgColor-muted` #151b23, border `borderColor-muted` #2f353d 1 px | 8 | Static | none |
| `viewfinder` | Scan frame, 240 px, 6 px corners | n/a | `fgColor-default` #f0f6fc | corner caps | Idle | Code found: corners turn `fgColor-success` #3fb950 for 300 ms, then the check starts |

## Frames: every element's box

Boxes are x, y, w, h in dp at 412x915 from the top left of the screen. Text boxes are the line boxes; a wrapped text box is lines x line height.

### 1. First launch, empty (welcome)

Three methods as large rows.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Screen title | `title` | 20 | 56 | 250 | 28 |
| Step caption | `caption` | 252 | 60 | 140 | 18 |
| Explainer | `body` | 20 | 92 | 372 | 20 |
| Section label | `label` | 20 | 136 | 372 | 20 |
| Row scan | `row-primary` | 20 | 168 | 372 | 96 |
| Row scan icon | `row-icon` | 36 | 192 | 48 | 48 |
| Row scan title | `row-title` | 100 | 186 | 244 | 24 |
| Row scan desc | `row-desc` | 100 | 210 | 244 | 36 |
| Row scan chevron | `row-chev` | 362 | 204 | 16 | 24 |
| Row paste | `row` | 20 | 276 | 372 | 96 |
| Row paste icon | `row-icon` | 36 | 300 | 48 | 48 |
| Row paste title | `row-title` | 100 | 303 | 244 | 24 |
| Row paste desc | `row-desc` | 100 | 327 | 244 | 18 |
| Row paste chevron | `row-chev` | 362 | 312 | 16 | 24 |
| Row type | `row` | 20 | 384 | 372 | 96 |
| Row type icon | `row-icon` | 36 | 408 | 48 | 48 |
| Row type title | `row-title` | 100 | 411 | 244 | 24 |
| Row type desc | `row-desc` | 100 | 435 | 244 | 18 |
| Row type chevron | `row-chev` | 362 | 420 | 16 | 24 |
| Footer icon | `icon-small` | 22 | 508 | 20 | 20 |
| Footer note | `body` | 52 | 508 | 340 | 20 |

### 2. Camera scanning

Focused step, sheet offers the others.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Camera preview | `camera` | 0 | 24 | 412 | 516 |
| Back button | `icon-btn-scrim` | 8 | 32 | 48 | 48 |
| Flash button | `icon-btn-scrim` | 356 | 32 | 48 | 48 |
| Step caption | `caption-scrim` | 100 | 47 | 212 | 18 |
| Viewfinder | `viewfinder` | 86 | 170 | 240 | 240 |
| Bottom sheet | `sheet` | 0 | 540 | 412 | 327 |
| Drag handle | `handle` | 186 | 552 | 40 | 4 |
| Sheet title | `sheet-title` | 20 | 576 | 372 | 28 |
| Sheet body | `body` | 20 | 612 | 372 | 40 |
| Paste link button | `btn-outlined` | 20 | 700 | 372 | 48 |
| Type address button | `btn-outlined` | 20 | 760 | 372 | 48 |

### 3. Host typed

Focused step, keyboard open.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Back button | `icon-btn` | 8 | 32 | 48 | 48 |
| Step caption | `caption` | 252 | 47 | 140 | 18 |
| Screen title | `title` | 20 | 96 | 372 | 28 |
| Body | `body` | 20 | 132 | 372 | 40 |
| Address field | `field` | 20 | 196 | 372 | 56 |
| Field value | `field-value` | 36 | 212 | 240 | 24 |
| Paste chip | `chip` | 302 | 208 | 78 | 32 |
| Helper text | `caption` | 36 | 260 | 356 | 18 |
| Check server button | `btn-primary` | 20 | 300 | 372 | 48 |

### 4. Checking

Checklist shows the running check.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Step caption | `caption` | 252 | 47 | 140 | 18 |
| Screen title | `title` | 20 | 96 | 372 | 28 |
| Host box | `host-box` | 20 | 140 | 372 | 48 |
| Host value | `field-value` | 36 | 152 | 340 | 24 |
| Check row 1 | `check-row-done` | 20 | 212 | 372 | 64 |
| Check row 1 icon | `check-icon` | 36 | 228 | 32 | 32 |
| Check row 1 title | `check-title` | 80 | 223 | 300 | 20 |
| Check row 1 sub | `check-sub` | 80 | 243 | 300 | 18 |
| Check row 2 | `check-row-done` | 20 | 284 | 372 | 64 |
| Check row 2 icon | `check-icon` | 36 | 300 | 32 | 32 |
| Check row 2 title | `check-title` | 80 | 295 | 300 | 20 |
| Check row 2 sub | `check-sub` | 80 | 315 | 300 | 18 |
| Check row 3 | `check-row-run` | 20 | 356 | 372 | 64 |
| Check row 3 icon | `check-icon` | 36 | 372 | 32 | 32 |
| Check row 3 title | `check-title` | 80 | 367 | 300 | 20 |
| Check row 3 sub | `check-sub` | 80 | 387 | 300 | 18 |
| Note | `caption` | 20 | 436 | 372 | 18 |
| Cancel button | `btn-outlined` | 20 | 790 | 372 | 48 |

### 5. Failed: not on the tailnet

First check row fails.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Back button | `icon-btn` | 8 | 32 | 48 | 48 |
| Step caption | `caption` | 252 | 47 | 140 | 18 |
| Screen title | `title` | 20 | 96 | 372 | 28 |
| Host box | `host-box` | 20 | 140 | 372 | 48 |
| Host value | `field-value` | 36 | 152 | 340 | 24 |
| Check row 1 | `check-row-fail` | 20 | 212 | 372 | 64 |
| Check row 1 icon | `check-icon` | 36 | 228 | 32 | 32 |
| Check row 1 title | `check-title` | 80 | 223 | 300 | 20 |
| Check row 1 sub | `check-sub` | 80 | 243 | 300 | 18 |
| Check row 2 | `check-row-pend` | 20 | 284 | 372 | 64 |
| Check row 2 icon | `check-icon` | 36 | 300 | 32 | 32 |
| Check row 2 title | `check-title` | 80 | 295 | 300 | 20 |
| Check row 2 sub | `check-sub` | 80 | 315 | 300 | 18 |
| Check row 3 | `check-row-pend` | 20 | 356 | 372 | 64 |
| Check row 3 icon | `check-icon` | 36 | 372 | 32 | 32 |
| Check row 3 title | `check-title` | 80 | 367 | 300 | 20 |
| Check row 3 sub | `check-sub` | 80 | 387 | 300 | 18 |
| Error card | `error-card` | 20 | 436 | 372 | 130 |
| Error icon | `icon-small` | 36 | 454 | 20 | 20 |
| Error title | `err-title` | 64 | 452 | 312 | 24 |
| Error body | `body-fg` | 36 | 484 | 340 | 40 |
| Error detail | `err-detail` | 36 | 532 | 340 | 18 |
| Edit address button | `btn-outlined` | 20 | 586 | 150 | 48 |
| Retry button | `btn-primary` | 182 | 586 | 210 | 48 |

### 6. Failed: wrong host

Second check row fails.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Back button | `icon-btn` | 8 | 32 | 48 | 48 |
| Step caption | `caption` | 252 | 47 | 140 | 18 |
| Screen title | `title` | 20 | 96 | 372 | 28 |
| Host box | `host-box` | 20 | 140 | 372 | 48 |
| Host value | `field-value` | 36 | 152 | 340 | 24 |
| Check row 1 | `check-row-done` | 20 | 212 | 372 | 64 |
| Check row 1 icon | `check-icon` | 36 | 228 | 32 | 32 |
| Check row 1 title | `check-title` | 80 | 223 | 300 | 20 |
| Check row 1 sub | `check-sub` | 80 | 243 | 300 | 18 |
| Check row 2 | `check-row-fail` | 20 | 284 | 372 | 64 |
| Check row 2 icon | `check-icon` | 36 | 300 | 32 | 32 |
| Check row 2 title | `check-title` | 80 | 295 | 300 | 20 |
| Check row 2 sub | `check-sub` | 80 | 315 | 300 | 18 |
| Check row 3 | `check-row-pend` | 20 | 356 | 372 | 64 |
| Check row 3 icon | `check-icon` | 36 | 372 | 32 | 32 |
| Check row 3 title | `check-title` | 80 | 367 | 300 | 20 |
| Check row 3 sub | `check-sub` | 80 | 387 | 300 | 18 |
| Error card | `error-card` | 20 | 436 | 372 | 130 |
| Error icon | `icon-small` | 36 | 454 | 20 | 20 |
| Error title | `err-title` | 64 | 452 | 312 | 24 |
| Error body | `body-fg` | 36 | 484 | 340 | 40 |
| Error detail | `err-detail` | 36 | 532 | 340 | 18 |
| Edit address button | `btn-outlined` | 20 | 586 | 150 | 48 |
| Retry button | `btn-primary` | 182 | 586 | 210 | 48 |

### 7. Failed: Nod not running

Third check row fails.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Back button | `icon-btn` | 8 | 32 | 48 | 48 |
| Step caption | `caption` | 252 | 47 | 140 | 18 |
| Screen title | `title` | 20 | 96 | 372 | 28 |
| Host box | `host-box` | 20 | 140 | 372 | 48 |
| Host value | `field-value` | 36 | 152 | 340 | 24 |
| Check row 1 | `check-row-done` | 20 | 212 | 372 | 64 |
| Check row 1 icon | `check-icon` | 36 | 228 | 32 | 32 |
| Check row 1 title | `check-title` | 80 | 223 | 300 | 20 |
| Check row 1 sub | `check-sub` | 80 | 243 | 300 | 18 |
| Check row 2 | `check-row-done` | 20 | 284 | 372 | 64 |
| Check row 2 icon | `check-icon` | 36 | 300 | 32 | 32 |
| Check row 2 title | `check-title` | 80 | 295 | 300 | 20 |
| Check row 2 sub | `check-sub` | 80 | 315 | 300 | 18 |
| Check row 3 | `check-row-fail` | 20 | 356 | 372 | 64 |
| Check row 3 icon | `check-icon` | 36 | 372 | 32 | 32 |
| Check row 3 title | `check-title` | 80 | 367 | 300 | 20 |
| Check row 3 sub | `check-sub` | 80 | 387 | 300 | 18 |
| Error card | `error-card` | 20 | 436 | 372 | 130 |
| Error icon | `icon-small` | 36 | 454 | 20 | 20 |
| Error title | `err-title` | 64 | 452 | 312 | 24 |
| Error body | `body-fg` | 36 | 484 | 340 | 40 |
| Error detail | `err-detail` | 36 | 532 | 340 | 18 |
| Edit address button | `btn-outlined` | 20 | 586 | 150 | 48 |
| Retry button | `btn-primary` | 182 | 586 | 210 | 48 |

### 8. Success handoff

Saved, then opens the web app.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Success badge | `badge` | 150 | 144 | 112 | 112 |
| Connected title | `title` | 20 | 296 | 372 | 28 |
| Host | `field-value` | 20 | 332 | 372 | 24 |
| Progress label | `label` | 20 | 404 | 372 | 20 |
| Progress bar | `progress` | 20 | 432 | 372 | 4 |
| URL box | `url-box` | 20 | 452 | 372 | 58 |
| URL line 1 | `mono` | 32 | 462 | 348 | 18 |
| URL line 2 | `mono` | 32 | 480 | 348 | 18 |
| Note | `caption` | 20 | 526 | 372 | 36 |

### 9. Change-server variant

Welcome step, current host and Cancel.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Screen title | `title` | 20 | 56 | 250 | 28 |
| Step caption | `caption` | 252 | 60 | 140 | 18 |
| Current server card | `card` | 20 | 100 | 372 | 76 |
| Current label | `caption` | 36 | 114 | 340 | 18 |
| Current host | `row-title` | 36 | 138 | 340 | 24 |
| Section label | `label` | 20 | 200 | 372 | 20 |
| Row scan | `row` | 20 | 232 | 372 | 80 |
| Row scan icon | `row-icon` | 36 | 248 | 48 | 48 |
| Row scan title | `row-title` | 100 | 251 | 244 | 24 |
| Row scan desc | `row-desc` | 100 | 275 | 244 | 18 |
| Row scan chevron | `row-chev` | 362 | 260 | 16 | 24 |
| Row paste | `row` | 20 | 324 | 372 | 80 |
| Row paste icon | `row-icon` | 36 | 340 | 48 | 48 |
| Row paste title | `row-title` | 100 | 343 | 244 | 24 |
| Row paste desc | `row-desc` | 100 | 367 | 244 | 18 |
| Row paste chevron | `row-chev` | 362 | 352 | 16 | 24 |
| Row edit | `row` | 20 | 416 | 372 | 80 |
| Row edit icon | `row-icon` | 36 | 432 | 48 | 48 |
| Row edit title | `row-title` | 100 | 435 | 244 | 24 |
| Row edit desc | `row-desc` | 100 | 459 | 244 | 18 |
| Row edit chevron | `row-chev` | 362 | 444 | 16 | 24 |
| Cancel button | `btn-outlined` | 20 | 524 | 372 | 48 |

### 10. Paste pair link step

Also the landing for a nod://pair link.

| Element | Component | x | y | w | h |
|---|---|---|---|---|---|
| Back button | `icon-btn` | 8 | 32 | 48 | 48 |
| Step caption | `caption` | 252 | 47 | 140 | 18 |
| Screen title | `title` | 20 | 96 | 372 | 28 |
| Body | `body` | 20 | 132 | 372 | 40 |
| Link field | `field` | 20 | 196 | 372 | 84 |
| Link line 1 | `field-value-mono` | 36 | 212 | 340 | 18 |
| Link line 2 | `field-value-mono` | 36 | 230 | 340 | 18 |
| Paste chip | `chip` | 227 | 292 | 165 | 32 |
| Host found card | `card` | 20 | 340 | 372 | 64 |
| Host found icon | `check-icon` | 36 | 356 | 32 | 32 |
| Host found label | `caption` | 80 | 350 | 300 | 18 |
| Host found value | `row-title` | 80 | 368 | 300 | 24 |
| Check server button | `btn-primary` | 20 | 428 | 372 | 48 |

## Android build notes

### Components (Material 3, `com.google.android.material`)

| Mockup | Use |
|---|---|
| Buttons | `MaterialButton` with `Widget.Material3.Button` (filled) and `Widget.Material3.Button.OutlinedButton`, `cornerRadius` 24dp, `minHeight` 48dp |
| Icon buttons | `MaterialButton` with `Widget.Material3.Button.IconButton.Filled.Tonal`, 40dp, `android:minWidth` and `minHeight` 48dp |
| Address and pair link | `TextInputLayout` with `Widget.Material3.TextInputLayout.OutlinedBox`, `boxCornerRadius` 4dp, `TextInputEditText`. Address: `inputType=textUri`, `imeOptions=actionGo`. Pair link: multi-line |
| Paste chip | `Chip` with `Widget.Material3.Chip.Assist`, `chipCornerRadius` 8dp |
| Method rows and check rows | `MaterialCardView` (outlined, `cardCornerRadius` 12dp, `strokeWidth` per state) holding a `ConstraintLayout` list item |
| Error card | `MaterialCardView`, `accessibilityLiveRegion=polite`, announced when it appears |
| Progress | `LinearProgressIndicator`, `trackThickness` 4dp |
| Bottom sheet | `BottomSheetDialogFragment` with a non-draggable behaviour (`isDraggable = false`) on frame 2 |
| Top bar | none; the back arrow is the icon button. System Back does the same |
| Camera | CameraX preview with the ML Kit barcode scanner on `QR_CODE` only, or the Google code scanner |

Theme: `Theme.Material3.Dark.NoActionBar`, with `colorSurface` #0d1117, `colorOnSurface` #f0f6fc, `colorPrimary` #238636 (buttons), `colorOutline` #656c76, `colorError` #f85149. Set `android:windowBackground` to #0d1117 so there is no white flash.

Icon glyphs are vector drawables, 24dp: back, close, bolt, scan, clipboard, keyboard, check, spinner arc, info, warning, chevron. Content descriptions: Back (`cd_back`), Flash (`cd_flash`). Decorative glyphs get `importantForAccessibility=no`.

### Behaviour

- Check server (and Retry, and Save on frame 9) normalises the input (see below), then runs the check on a background thread. The field locks and the screen shows frame 4. Cancel, and system Back, abort the call.
- Rows advance: row 1 runs first. Rows 1 and 2 turn done together when the TCP and TLS connect finishes (an OkHttp `EventListener.connectEnd`). Row 3 runs until the HTTP response arrives. On success all three are done, then frame 8.
- Frame 3 Paste fills the field with the clipboard text, trimmed. Frame 10 Paste from clipboard fills the pair link and, when the link parses, shows the host found card and enables Check server.
- Frame 8 saves the server only after the check passed, then launches the TWA at `https://<host>/?apk=<versionCode>`. `apk` is this app's build number, not a pairing code.
- Camera permission denied: show the camera frame without the preview, the sheet unchanged, and a toast `camera_denied` (not drawn in the mockup).

### Health check

- One request: `GET https://<host>/api/health`, over https only. No http fallback, no cleartext.
- Timeouts: connect 5 s, read 5 s. Redirects are not followed.
- Pass when the response is JSON with `app == "nod"` (any 2xx).

| Failure the client sees | Row that fails | Card shown | Detail line |
|---|---|---|---|
| Connect or read timeout, `NoRouteToHostException`, `ConnectException` with no route, network unreachable | 1 Reach your tailnet | Not on the tailnet | `GET /api/health: timed out after 5 s` (or `no route to host`) |
| `UnknownHostException` (DNS), `ConnectException` connection refused | 2 Find the desktop | Can't find the desktop | `GET /api/health: host not found` (or `connection refused`) |
| An HTTP answer arrived and it is not app "nod" (any status, a non-JSON body, or another `app` value) | 3 Confirm Nod | Nod is not running | `GET /api/health: HTTP <status>, app is not "nod"` |

TLS failures (certificate or handshake) are treated as Can't find the desktop.

A tailnet name does not resolve off the tailnet, so a DNS failure cannot tell a typo from a phone off the tailnet. The "Can't find the desktop" card names both causes. Frame 6 of the mockup shows the earlier "Wrong host" copy; the strings below win.

The mockup shows one detail line per card. The strings list holds those three; the alternatives in the table need their own strings if the reviewer wants them.

### Input handling

Accept `desk.example-tailnet.ts.net`, `https://desk.example-tailnet.ts.net` and a `nod://pair?host=...&code=...` link. Strip scheme, path and trailing slash, lower-case the host, reject anything with spaces. Store only the host. The pair `code` is not stored here; the web app uses it.

## Strings (`res/values/strings.xml`)

Every string in the mockup, once. The example host is a generic placeholder, never a real host.

```xml
<resources>
    <string name="setup_title">Set up Nod</string>
    <string name="setup_explain">Nod needs the tailnet address of the desktop running it.</string>
    <string name="step_1_of_2">Step 1 of 2</string>
    <string name="step_2_of_2">Step 2 of 2</string>
    <string name="setup_choose">Choose how to add your desktop</string>
    <string name="method_scan_title">Scan pair code</string>
    <string name="method_scan_desc">Use the camera on the QR in Settings &gt; Pair phone</string>
    <string name="method_paste_title">Paste pair link</string>
    <string name="method_paste_desc">Paste the nod://pair link from your desktop</string>
    <string name="method_type_title">Type the address</string>
    <string name="method_type_desc">For example desk.example-tailnet.ts.net</string>
    <string name="setup_footer">We check the desktop answers before saving.</string>
    <string name="scan_body">Point the camera at the QR in Settings &gt; Pair phone on your desktop.</string>
    <string name="scan_paste_instead">Paste link instead</string>
    <string name="scan_type_instead">Type address instead</string>
    <string name="type_body">Your desktop\'s name on the tailnet. No pairing code is needed.</string>
    <string name="field_label">Server address</string>
    <string name="field_example">For example desk.example-tailnet.ts.net</string>
    <string name="paste">Paste</string>
    <string name="check_server">Check server</string>
    <string name="checking_title">Checking the desktop</string>
    <string name="checking_note">This takes a few seconds.</string>
    <string name="cancel">Cancel</string>
    <string name="check_tailnet">Reach your tailnet</string>
    <string name="check_tailnet_sub">Phone can reach the tailnet</string>
    <string name="check_desktop">Find the desktop</string>
    <string name="check_nod">Confirm Nod</string>
    <string name="check_nod_sub">GET /api/health returns app \"nod\"</string>
    <string name="fail_title">Can\'t connect</string>
    <string name="err_tailnet_title">Not on the tailnet</string>
    <string name="err_tailnet_body">This phone cannot reach your tailnet. Connect it to the tailnet, then retry.</string>
    <string name="err_host_title">Can\'t find the desktop</string>
    <string name="err_host_body">Check the address for typos, and that this phone is on your tailnet, then retry.</string>
    <string name="err_nod_title">Nod is not running</string>
    <string name="err_nod_body">The desktop answered, but Nod is not running. Start Nod on it, then retry.</string>
    <string name="detail_timeout">GET /api/health: timed out after 5 s</string>
    <string name="detail_dns">GET /api/health: host not found</string>
    <string name="detail_not_nod">GET /api/health: HTTP 404, app is not \"nod\"</string>
    <string name="edit_address">Edit address</string>
    <string name="retry">Retry</string>
    <string name="connected_title">Connected</string>
    <string name="opening_nod">Opening Nod</string>
    <string name="apk_note">apk is this app\'s build number, not a pairing code. Pairing the device key happens inside Nod next.</string>
    <string name="change_title">Change server</string>
    <string name="current_server">Current server</string>
    <string name="replace_by">Replace it by</string>
    <string name="method_scan_new_title">Scan new pair code</string>
    <string name="method_scan_new_desc">Camera on the QR</string>
    <string name="method_paste_new_desc">From the clipboard</string>
    <string name="method_edit_desc">Opens with the current host</string>
    <string name="paste_body">Copy the link from Settings &gt; Pair phone on your desktop, then paste it here.</string>
    <string name="link_label">Pair link</string>
    <string name="paste_clipboard">Paste from clipboard</string>
    <string name="host_found">Host found</string>
    <string name="camera_denied">Camera access is off. Use another method.</string>
    <string name="cd_back">Back</string>
    <string name="cd_flash">Flash</string>
</resources>
```

## Decisions to review

1. Primary button is green (`button-primary-bgColor-rest`), not blue, to match the web app.
2. Screen titles are 20/28 to stay on the web type scale. A larger Android title would need a new token.
3. The check detail for "Nod not running" is now `HTTP <status>, app is not "nod"`. The wireframe's "refused" moved to Wrong host, per the failure mapping above.
4. Decided 2026-11-16: `UnknownHostException` also happens off the tailnet, so its card ("Can't find the desktop") names both causes. Rows 1 and 2 are staged by the connect event, not by two requests.
5. Outlined buttons use `borderColor-emphasis` #656c76 (3:1 on the surface), not `borderColor-default` #3d444d (1.9:1).
