# Set up bot button spec (round 2, layout A)

Mockups: `setup-bot-mockup.svg` (dark), `setup-bot-mockup-light.svg`, `setup-bot-mockup-phone.svg` (dark, 412x915).
Colour and type tokens come from `tokens.md`; the 12px minimum is from `constraints.md`. No new tokens.

## Behaviour

- Shows only while `bot.enabled` is false. When the bot is on, the same slot holds Hand to bot.
- Sits in `.actions-dispatch`, after Dispatch with Orca. The row wraps, so at a 280 sidebar it lands on its own line.
- Click, or key `L` (listed in help only while the bot is off, like `K` and `L` are listed only while it is on today).
- Opens the Settings dialog on the Bot pane with Name focused. The dialog needs an optional initial section.
- Caption under the button: `Bot is off. Opens Settings, Bot pane.` Muted, 12px, `.actions-caption`.
- Hidden when Dispatch and the bot are both unavailable, as the row is today.
- Phone: action-sheet row `Set up bot` with a muted `How to` hint, under Dispatch with Orca. Tapping shows a toast: `Turn the bot on in Settings on the desktop.` The settings write is loopback only, so the phone never opens Settings.
- Scroll owner is unchanged (the sidebar scrolls above the pinned actions panel). The page never scrolls.

## Elements

| Element | Source | Box at 1660 | At 412 | Font | Colour tokens |
|---|---|---|---|---|---|
| Button | `.btn`, `web/base.css` | h 32, w 118, 8 gap after the previous button, wraps | sheet row h 44, full width | `text-body-medium` 14/20 400, nowrap | `button-default-bgColor-rest`, `borderColor-default` |
| Key chip `L` | `.kbd`, `web/base.css` | 18x18, right, 8 gap | none | `text-codeInline` 12/18 mono | `fgColor-muted` on `bgColor-default`, `borderColor-default` |
| Caption | `.actions-caption`, `web/issues.css` | full row, below the button | none | `text-caption` 12/18 400 | `fgColor-muted` |
| Sheet row | existing action-sheet row, `web/phone/phone-actions.css` | h 44 | as left | 15 | `button-default-bgColor-rest`, `borderColor-default` |
| Sheet hint `How to` | muted row hint | right, 16 inset | as left | 12 | `fgColor-muted` |

## States

| State | Result |
|---|---|
| Bot off | Button and caption shown |
| Bot on | Hand to bot replaces it, no caption |
| Bot on, issue held | Disabled `With bot`, as today |
| Closed issue | Button still enabled, since setup does not touch the issue |
| Settings already open | Click does nothing |
