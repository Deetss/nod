# Dialog spec (round 2, layout A)

Mockups: `dialog-mockup.svg` (dark), `dialog-mockup-light.svg`. Wireframe:
`dialog-wireframe-A.svg`. Colour and type tokens come from `tokens.md`; the 12px
minimum is from `constraints.md`. No new tokens.

This spec replaces the per-file header, footer, scrim and dismiss logic in every
existing dialog with one shared wrapper, `AppDialog`. All three dialogs in the
mockups (Request changes, Approve busy, Admin merge) use the wrapper; the
geometry is the same, only the body and footer buttons change.

## Behaviour

- One shared wrapper `AppDialog` in `web/AppDialog.tsx` around `@primer/react` `Dialog`. Props: `title`, `onClose`,
  `busy`, `width` (`small` 296, `medium` 480 default, `large` 640, or a number), `footer` (the buttons), `footerNote`
  (optional 12px text left of the buttons), `children` (the body), `label` (aria-label, defaults to the title).
- Esc and the close X call `onClose` unless `busy`. Clicking the scrim does the same. Focus starts on the first field,
  else the confirm button, and returns to the opener on close. Tab stays inside. Page scroll is locked.
- Enter and Ctrl+Enter submit exactly as today (`ActionDialog` rules in `web/Dialogs.tsx`).
- While `busy`: Cancel and X are disabled, the confirm button shows `.spinner` plus the busy word, `aria-busy` is set.
- Disabled buttons keep their label and the dashed border; the footer note says why. The note never replaces the dashed border.
- The scrim stays `#010409b3`. Dialog z-index stays above the app (50).
- Phone sheets and `NotifyMenu` do not use this wrapper.

## Elements

| Element | Source | Box at 1660 | Font | Colour tokens |
|---|---|---|---|---|
| Scrim | `AppDialog` (full sheet overlay) | full viewport, opacity 0.7 | n/a | `#010409b3` |
| Dialog | `AppDialog` | 480 wide, body height variable | n/a | `bgColor-default` fill, `borderColor-default` 1px stroke, radius 6 |
| Header bar | `AppDialog` | 56 tall, full dialog width | n/a | `bgColor-muted` fill, bottom 1px `borderColor-default` |
| Title | `AppDialog` (`title` prop) | 16 left of dialog, baseline 33 from dialog top | 16/24 600 | `fgColor-default` |
| Esc key cap | `KeyCap` (`web/ui.tsx`) | 18 tall, 26 wide, 8 left of close X, vertically centred in header | 12 mono 400 | `bgColor-default` fill, `borderColor-default` 1px stroke, radius 4; text `fgColor-muted` |
| Close button | `.btn` default, X glyph | 32x32 at 12 from right edge, vertically centred in header | 16 X glyph | `button-default-bgColor-rest` fill, `borderColor-default` 1px stroke, radius 6; X `fgColor-default` |
| Body | `AppDialog` (`children`) | 16 padding on left/right, top/bottom; gap 12 inside | n/a | `bgColor-default` fill |
| PR title line | per dialog | baseline 30 below header | 14/20 400 | `fgColor-muted` |
| Textarea | per dialog (existing `<textarea>`) | 448 wide, 144 tall (where used), 16 in from dialog edges, 12 below PR title | 14/20 400 | `bgColor-default` fill, `borderColor-default` 1px stroke, radius 6; text `fgColor-default`; placeholder `fgColor-muted` |
| Warning paragraph | per dialog | 16 in from dialog edges, below PR title with 12 gap | 14/20; first sentence 600, after 400 | `fgColor-default` |
| Confirm input | `.confirm-input.mono` (`web/Dialogs.tsx`) | 448 wide, 36 tall, 16 in from dialog edges | 14 mono 400 | `bgColor-default` fill, `borderColor-danger-emphasis` 1px stroke, radius 6; text `fgColor-default` |
| Footer bar | `AppDialog` | 64 tall, full dialog width | n/a | `bgColor-muted` fill, top 1px `borderColor-default` |
| Footer note | `AppDialog` (`footerNote` prop) | 16 left of footer, vertically centred (baseline 36 below footer top) | 12/18 400 | `fgColor-muted` |
| Cancel | `.btn` default | 32 tall, 70 wide, right-aligned with 16 right padding | 14/20 400 | `button-default-bgColor-rest` fill, `borderColor-default` 1px stroke, radius 6; text `fgColor-default` |
| Confirm (primary) | `.btn.btn-primary` | 32 tall, width by label, 8 gap left of Cancel | 14/20 600 | `button-primary-bgColor-rest` fill, `borderColor-success-emphasis` 1px stroke, radius 6; text `fgColor-onEmphasis` |
| Admin merge (danger) | `.btn.btn-danger` | 32 tall, 106 wide | 14/20 600 | `bgColor-danger-muted` fill, `borderColor-danger-emphasis` 1px stroke, radius 6; text `fgColor-danger`; hover fill `borderColor-danger-emphasis`, text `fgColor-onEmphasis`. The mockup shows it disabled. |
| Disabled button | `.btn[disabled]` | same box | 14/20 400 | fill `none`, 1px dashed `borderColor-emphasis`, text `fgColor-muted` |
| Busy button | `.btn.is-busy` | same box as primary, 14 spinner at 12 from left, label centred at button_x + 80 | 14/20 600 | `button-primary-bgColor-rest` fill, `borderColor-success-emphasis` 1px stroke; spinner and text `fgColor-onEmphasis` |

## Overrides

The CSS this build adds, with exact values:

- Focus ring on any focused control inside the dialog: `2px` outline `borderColor-accent-emphasis`, offset `-2px`.
- Disabled buttons: `1px` dashed `borderColor-emphasis` border and `fgColor-muted` text (same as `.btn[disabled]`).
- Dialog radius: `6px`.
- Header and footer fill: `bgColor-muted`.

## States

| State | Result |
|---|---|
| Default | Nothing typed; placeholder visible in textarea; confirm button disabled with footer note |
| Typed | Text visible in textarea or input; placeholder replaced; first field still focused |
| Disabled confirm with footer note | Confirm uses dashed border and muted text; footer note explains why |
| Busy | Cancel and X disabled; confirm shows `.spinner` plus busy word; `aria-busy` set on the dialog; scrim click and Esc ignored |
| Error | `role="alert"` line in the body, 12px `fgColor-danger`, with an alert icon, above the footer |
| Narrow viewport | Width becomes `min(480px, 100vw - 32px)` |

## Scroll owner

The body scrolls (`overflow-y: auto`, `min-height: 0`); header and footer are
pinned. Dialog max height is `100vh - 64px`. The page never scrolls.

## Dialogs to convert

- `web/Dialogs.tsx` (`ActionDialog`, `HelpDialog`)
- `web/FixDialogs.tsx`
- `web/PairDialog.tsx`
- `web/settings/SettingsDialog.tsx` (custom width 840, see note)
- `web/settings/Welcome.tsx`
- `web/issues/IssueDialogs.tsx`
- `web/issues/SplitDialog.tsx`
- `web/issues/SubIssueDialogs.tsx`
- `web/issues/Picker.tsx`
- `web/orca/SendDialog.tsx`
- `web/orca/SessionPicker.tsx`

Note: `SettingsDialog` keeps its left nav and uses a custom width of `840`; its
own header and footer map to the wrapper's.
