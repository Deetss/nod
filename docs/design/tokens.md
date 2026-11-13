# Nod tokens

Source: GitHub Primer primitives (`@primer/primitives`, MIT), functional colour tokens, written from memory of the package.
The done and open tokens are verified against `@primer/primitives` 11.10.0 (`dist/css/functional/themes/dark.css` and `light.css`). The other values are not yet checked.
Alpha values are composited over `bgColor-default` in the SVG mockups; the opaque result is shown in brackets.

## Colour

| Token | Dark (default) | Light |
|---|---|---|
| `bgColor-default` | `#0d1117` | `#ffffff` |
| `bgColor-muted` | `#151b23` | `#f6f8fa` |
| `bgColor-inset` | `#010409` | `#f6f8fa` |
| `bgColor-neutral-muted` | `#656c7633` (on bgColor-default `#1f232a`) | `#818b981f` (on bgColor-default `#f0f1f2`) |
| `bgColor-accent-muted` | `#388bfd1a` (on bgColor-default `#111d2e`) | `#ddf4ff` |
| `bgColor-accent-emphasis` | `#1f6feb` | `#0969da` |
| `bgColor-success-muted` | `#2ea04326` (on bgColor-default `#12261e`) | `#dafbe1` |
| `bgColor-success-emphasis` | `#238636` | `#1f883d` |
| `bgColor-danger-muted` | `#f851491a` (on bgColor-default `#25181c`) | `#ffebe9` |
| `bgColor-attention-muted` | `#bb800926` (on bgColor-default `#272215`) | `#fff8c5` |
| `bgColor-attention-emphasis` | `#9e6a03` | `#9a6700` |
| `fgColor-default` | `#f0f6fc` | `#1f2328` |
| `fgColor-muted` | `#9198a1` | `#59636e` |
| `fgColor-onEmphasis` | `#ffffff` | `#ffffff` |
| `fgColor-accent` | `#4493f8` | `#0969da` |
| `fgColor-success` | `#3fb950` | `#1a7f37` |
| `fgColor-done` | `#ab7df8` | `#8250df` |
| `bgColor-done-muted` | `#ab7df826` (on bgColor-default `#242139`) | `#fbefff` |
| `bgColor-done-emphasis` | `#8957e5` | `#8250df` |
| `borderColor-done-emphasis` | `#8957e5` | `#8250df` |
| `fgColor-open` | alias of `fgColor-success` | alias of `fgColor-success` |
| `bgColor-open-emphasis` | alias of `bgColor-success-emphasis` | alias of `bgColor-success-emphasis` |
| `fgColor-danger` | `#f85149` | `#d1242f` |
| `fgColor-attention` | `#d29922` | `#7d4e00` |
| `borderColor-default` | `#3d444d` | `#d1d9e0` |
| `borderColor-muted` | `#3d444db3` (on bgColor-default `#2f353d`) | `#d1d9e0b3` (on bgColor-default `#dfe4e9`) |
| `borderColor-emphasis` | `#656c76` | `#818b98` |
| `borderColor-accent-emphasis` | `#1f6feb` | `#0969da` |
| `borderColor-success-emphasis` | `#238636` | `#1f883d` |
| `borderColor-danger-emphasis` | `#da3633` | `#cf222e` |
| `borderColor-attention-emphasis` | `#9e6a03` | `#9a6700` |
| `button-default-bgColor-rest` | `#212830` | `#f6f8fa` |
| `button-default-bgColor-hover` | `#262c36` | `#eff2f5` |
| `button-primary-bgColor-rest` | `#238636` | `#1f883d` |
| `diffBlob-addition-bgColor-line` | `#2ea04326` (on bgColor-default `#12261e`) | `#dafbe1` |
| `diffBlob-addition-bgColor-num` | `#3fb9504d` (on bgColor-default `#1c4428`) | `#aceebb` |
| `diffBlob-deletion-bgColor-line` | `#f851491a` (on bgColor-default `#25181c`) | `#ffebe9` |
| `diffBlob-deletion-bgColor-num` | `#f851494d` (on bgColor-default `#542426`) | `#ffcecb` |
| `diffBlob-additionWord-bgColor` | `#2ea04366` | `#aceebb` |
| `diffBlob-deletionWord-bgColor` | `#f8514966` | `#ffcecb` |
| `diffBlob-hunk-bgColor` | `#388bfd1a` (on bgColor-default `#111d2e`) | `#ddf4ff` |
| `prettylights-syntax-keyword` | `#ff7b72` | `#cf222e` |
| `prettylights-syntax-string` | `#a5d6ff` | `#0a3069` |
| `prettylights-syntax-constant` | `#79c0ff` | `#0550ae` |
| `prettylights-syntax-entity-tag` | `#7ee787` | `#116329` |

### State chip contrast

| Chip | Dark | Light |
|---|---|---|
| Open, `fgColor-onEmphasis` on `bgColor-open-emphasis` | 4.63:1 | 4.52:1 |
| Closed, `fgColor-onEmphasis` on `bgColor-done-emphasis` | 4.61:1 | 5.05:1 |
| `fgColor-done` on `bgColor-default` | 6.33:1 | 5.05:1 |
| `fgColor-done` on `bgColor-done-muted` | 5.30:1 | 4.54:1 |

All pass 4.5:1. Closed chips use done purple for both close reasons because the issue query does not fetch `stateReason`. Primer shows not planned as `bgColor-neutral-emphasis` (`#656c76` dark, `#59636e` light, white text 5.30:1 and 6.11:1).

### Deviation from Primer

- `fgColor-attention` light is `#7d4e00` (Primer uses `#9a6700`). The Primer value gives 3.9:1 on `bgColor-attention-muted` at 12px; `#7d4e00` gives 6.6:1.
- Disabled controls use `fgColor-muted` text (no separate disabled token) so labels stay readable at 12px, plus a dashed border and a text note.

## Type scale

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `text-caption` | 12 / 18 | 400 | meta lines, counts, key hints, legend |
| `text-caption-semibold` | 12 / 18 | 600 | pane labels, NEW / UPDATED badges (700 in the SVG) |
| `text-body-medium` | 14 / 20 | 400 | titles, buttons, file names, card rows |
| `text-body-medium-semibold` | 14 / 20 | 600 | unseen titles, section names, card titles, primary button |
| `text-title-small` | 16 / 24 | 600 | app name, Files heading |
| `text-title-medium` | 20 / 28 | 600 | PR title in the detail pane |
| `text-codeBlock` | 13 / 22 | 400 | diff code, file paths |
| `text-codeInline` | 12 / 18 | 400 | line numbers, hunk headers, SHAs, key caps |

Minimum font size is 12px (`constraints.md`). No text in the mockups is smaller.

## Fonts

| Token | Stack |
|---|---|
| `fontStack-system` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif` |
| `fontStack-monospace` | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` |

The SVGs render with Helvetica / Arial (Liberation Sans) and a 0.6em monospace as stand-ins so text widths are predictable. 600 weight renders as bold in the SVGs.

## Shape and spacing

| Token | Value | Use |
|---|---|---|
| `borderRadius-medium` | 6px | buttons, cards, inputs, key caps use 4px |
| `borderRadius-full` | 999px | pills, badges, counters |
| `borderWidth-thin` | 1px | all borders; selected-row bar is 4px; badge ring on selected rows 1.5px |
| `base-size-4 ... 16` | 4, 8, 12, 16px | gaps and padding (8px between buttons, 16px pane gutter) |
