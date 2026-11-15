# Involved-in switch spec (round 2, layout B)

Mockups: `involved-mockup.svg` (dark), `involved-mockup-light.svg`. Wireframe: `involved-wireframe-B.svg`.
Colour and type tokens come from `tokens.md`; the 12px minimum is from `constraints.md`. No new tokens. Desktop only: the phone cannot change settings.

## Behaviour

- New setting `includeInvolved` (boolean, default `true`). The Settings > GitHub pane edits it.
- With orgs set and the switch on, the search scope is `(org:A OR org:B OR involves:@me)`. With it off the scope is `org:A org:B`, as today.
- With no orgs the scope is `involves:@me` whatever the switch says. The switch shows On, locked at reduced opacity, and does not save a change.
- Every query that uses `orgScope` takes the same scope: open PRs, open issues, mentions, closed items, and the delta searches.
- An existing file without the key reads as `true`, so a file that lists orgs gains the user's own repos until the switch is turned off.
- GitHub allows five AND/OR operators in a search. With the switch on, 4 orgs fit. A fifth org shows `With the switch on, Nod can watch up to 4 orgs. Turn it off or remove one.` on the last org field, and Save stays disabled.
- Saving restarts the service, as today.
- The Searching line is read-only and updates as the form changes.
- Pane caption: `Orgs Nod watches for PRs and issues. Add your own login to include your personal repos.` Second line: `The first org also owns the project board and Status.`

## Elements

Boxes are relative to the pane body (632 wide inside the 880x640 dialog, 24 side padding, 15 top padding).

| Element | Source | Box | Font | Colour tokens |
|---|---|---|---|---|
| Title `GitHub` | `Pane`, `web/settings/SettingsPanes.tsx` | y 0, h 24 | `text-title-small` 16/24 600 | `fgColor-default` |
| Caption | `.settings-caption`, `web/settings.css` | 4 under the title, two lines, 18 each | 12/18 400 | `fgColor-muted` |
| Switch row | `Switch`, `.settings-switch-row` | 14 under the caption, h 20, toggle 36x20, 12 gap | label 14/20 600, state word 12/18 | on: `button-primary-bgColor-rest`; off: `button-default-bgColor-rest`, `borderColor-emphasis`; knob `fgColor-default`, on `fgColor-onEmphasis` |
| Switch help | `.settings-help` | 11 under the switch row, one line | 12/18 400 | `fgColor-muted` |
| Orgs label | `.settings-orgs-label` | 18 under the help | 12/18 | `fgColor-muted` |
| Org row | `.settings-org-row` | input 480x32, 16 gap, Remove 112x32, 8 between rows | 14/20 | `bgColor-default`, `borderColor-default` |
| Add org | `.settings-add` | 112x32, 8 under the last row | 14/20 | `button-default-bgColor-rest`, `borderColor-default` |
| Searching label | new, `.settings-help` | 14 under Add org | 12/18 | `fgColor-muted` |
| Searching line | new `.settings-query`, built like `text-codeInline` | 632x30, 6 radius, 10 side padding, 2 under the label | mono 12/18, no wrap, ellipsis | `bgColor-neutral-muted`, `fgColor-default` |
| Locked switch | `Switch` with `disabled` | as the switch row | as above | 55% opacity |

## States

| State | Result |
|---|---|
| Orgs set, switch on | Scope `(org... OR involves:@me)` |
| Orgs set, switch off | Scope `org... org...` |
| No orgs | Switch on and locked, scope `involves:@me` |
| Fifth org, switch on | Field error, Save disabled |
| Saving | Existing saving state |

## Scroll owner

The dialog pane scrolls, as today. The page never scrolls.
