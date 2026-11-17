# Primer UI kit evaluation

Spike for issue #72. Question: should Nod adopt `@primer/react` for buttons, dialogs, menus, labels and checkboxes?

## Decision

Adopt it in stages, starting with Dialog and ActionMenu. Do not migrate Button, Label and Checkbox until the token bridge and the design-rule overrides below are in place.

## What was tested

A throwaway page rendered Button (default, primary, danger, small), Label (four variants), Checkbox, ActionMenu and Dialog with `@primer/react` 38.46.0, loaded beside Nod's own `tokens.css` and `base.css`. The spike code is not committed.

## Findings

| Check | Result |
|---|---|
| React 19 | Works. Peer range is React 18 or 19. Needs `react-is` and `@types/react-is`. |
| Styling engine | CSS modules. No styled-components, so no runtime style injection. |
| Bundle | The spike entry (6 components plus react-dom) builds to 647 kB JS, 144 kB gzip. The app today is 962 kB, 288 kB gzip. Expect roughly +500 kB raw, +100 kB gzip once shared code is deduplicated. Acceptable for a localhost and Electron app. |
| Look | Matches the current hand-built style closely, since both follow Primer tokens. |
| Tokens | Primer reads `--bgColor-*`, `--fgColor-*` and `--borderColor-*` by the same names Nod's `web/tokens.css` defines. Nod's file wins where both load, so the app's light-theme attention override (`#7d4e00`) survives. |
| Theme switch | Primer follows `data-color-mode` and `ThemeProvider`. Nod uses `data-theme`. A small bridge must set both. |

## Conflicts with the design rules

| Rule | Issue | Handling |
|---|---|---|
| Key hint on every action (`constraints.md`) | Buttons need a trailing key cap. | Primer `trailingVisual` slot holding the existing `KeyCap`. |
| Disabled = dashed border plus note (`tokens.md`) | Primer disabled style differs. | CSS override on `[aria-disabled]`. |
| Focus ring 2px, offset -2px (spec section 1) | Primer uses its own outline. | CSS override. |
| Min font 12px | Primer Label and small Button measure 12px. Fine. | None. |
| Status never by colour alone | Primer Label is colour-only by default. | Keep icon and word in the label content. |

## Incidental findings

- `@primer/primitives` is a dev dependency but nothing imports it. `web/tokens.css` is a hand-copied subset. Importing the package's theme CSS would remove drift, but the custom light-theme overrides must be kept.
- Three rules already break the 12px minimum: `web/inbox.css:116`, `web/inbox.css:219`, `web/diff.css:730` (11px).

## Migration surface

| Thing | Count |
|---|---|
| `<Btn>` uses | 131 |
| `className="btn"` uses | 43 |
| `role="dialog"` uses | 27 |
| `role="menu"` files | 5 |
| `type="checkbox"` inputs | 12 |

## Stages

1. Add the dependency, the theme bridge and the focus and disabled overrides. No visible change.
2. Dialogs (27). Biggest accessibility win: focus trap, Escape, scroll lock now hand-rolled in `useFocusTrap`.
3. Menus (5), then Checkbox.
4. Button and Label, last, since they carry the key-hint and colour-only rules.

Each stage is its own PR with before and after screenshots. The phone icon set and phone layouts are out of scope until the desktop stages land.
