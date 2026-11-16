# Phone section headers spec (round 2, layout A)

Issue #33. Mockups: `section-headers-mockup-phone.svg` and `.png` (dark, frames 1 to 5, plus a 2x anatomy panel) and `section-headers-mockup-phone-light.svg` and `.png` (frames 1 and 3). Wireframe: `section-headers-wireframe-A-phone.svg` (picked).

Colour tokens are CSS custom properties from `web/tokens.css` (dark and light blocks). All boxes are x, y, w, h at 412x915. Minimum font is 12px (`constraints.md`). The search pill and filter button above the tab bar belong to #32 and are drawn but not specced here.

## Behaviour

- The header is a 44px text row (round 3: matches the app's phone tap targets; the mockup draws 40) on the row colour, with no band. Chevron at left, label in sentence case, muted count right after the label, hairline above.
- Tapping anywhere on the header toggles the section, as today.
- A section with 0 rows renders closed, whatever was saved. Tapping it opens one muted line, `No PRs here` or `No issues here`. That choice is not saved.
- A saved choice applies again once the section has rows.
- Headers stay sticky under the collapsed title bar (57px). While pinned, a hairline shows below the header.
- When every section is empty, the existing empty block replaces the headers (`PhoneInbox`, `status === 'empty'`). Unchanged.
- Titles are already sentence case in `shared/sections.ts` (`Needs my review`, `Mine`, `Org open`, `Dependabot`) and `shared/issue-sections.ts` (`In progress`, `With <bot>`, `Assigned to me`, `Created by me`, `Mentioned`, `Untriaged`, `All open`). Only the CSS uppercase transform goes.

## Reuse

| Part | Reuse or extend | Source |
|---|---|---|
| Header button | Extend `SectionHeader` (new props `empty`, `noun`) and `.ph-section` | `web/phone/PhoneList.tsx`, `web/phone/phone-list.css` |
| Chevron | `ChevronIcon` with `open` always true, rotated by CSS | `web/phone/PhoneIcons.tsx` |
| Section wrapper | The existing `<div key={s.key}>` gets `className="ph-section-group"` | `web/phone/PhoneInbox.tsx` |
| Empty line | New `.ph-section-empty`, rendered in place of rows | `PhoneInbox.tsx`, `phone-list.css` |
| Rows | Unchanged `.ph-row` (99 tall) | `PhoneList.tsx`, `phone-list.css` |
| Pressed fill | Same token as `.ph-row:active` | `phone-list.css` |
| Skeleton | `SkeletonSections` keeps `.ph-section.is-static`. It picks up the new look with no chevron. | `web/phone/PhoneStates.tsx` |

## Header row

| Element | Box | Font | Colour token (source `web/tokens.css`) | Notes |
|---|---|---|---|---|
| `.ph-section` | 0, y, 412, 44 (1px hairline + 43) | | fill `bgColor-default` (dark `#0d1117`, light `#ffffff`) | was 44 tall on `bgColor-muted`. `box-sizing: border-box`, `min-height: 44px`, padding `0 16px`. Selector is `.phone .ph-section`, which beats `.phone button { font: inherit; color: inherit }` |
| Hairline above | 0, y, 412, 1 | | `border-top: 1px solid var(--borderColor-hairline)` (dark `#3d444d80`, light `#d1d9e080`) | unchanged |
| Hairline below | none at rest | | | `border-bottom` removed. Pinned only, see below |
| Chevron | 16, y + 15, 16, 16 | stroke 2 on the 24 grid | `fgColor-muted` | `.ph-section-chev`, `aria-hidden` (the `Svg` wrapper already sets it) |
| Gap chevron to label | 8 | | | the existing `gap: 8px` |
| Label | 40, y + 13, to fit, 18 | 13/18, weight 600 | `fgColor-default` | no transform. One line, `white-space: nowrap`, ellipsis inside `min-width: 0` |
| Count | label end + 6, 18 | 13/18, weight 400 | `fgColor-muted` | `.ph-section-count` loses `margin-left: auto`. Its own `margin-left: -2px` brings the 8px gap to 6. `font-variant-numeric: tabular-nums` |
| Empty line | 0, y, 412, 44, padding `0 16px 0 40px` | 13/18, 400 | `fgColor-muted` on `bgColor-default` | `.ph-section-empty`. Text starts under the label |

Frame 1 positions (list top padding 113, no chip row after #32): sync line 113, `Needs my review` 141, `Mine` 185, first row 229, `Org open` 724.

Each break shows one hairline. The last row of a section drops its bottom border so it does not double the next header's top border:

```css
.ph-section-group > .ph-row:last-child { border-bottom: 0; }
```

## States

| State | Chevron | Rows | Fill | Frame |
|---|---|---|---|---|
| Open | down (rotate 0) | shown | `bgColor-default` | 1 |
| Closed | right (`rotate(-90deg)`) | hidden | `bgColor-default` | 2 |
| Pressed | either | | `bgColor-neutral-muted` (dark `#656c7633`, light `#818b981f`) on `:active` | 2, callout 1 |
| Empty closed | right | none | `bgColor-default` | 1 (`Needs my review 0`), 5 (`Created by me 0`) |
| Empty opened | down | one `.ph-section-empty` line | `bgColor-default` | 4, callout 3 |
| Pinned | either | | `bgColor-default`, hairline below `borderColor-hairline` | 3, callout 2. Box 0, 57, 412, 44; hairline at y 100 |

State never rides on colour alone: the chevron direction, `aria-expanded` and the visible rows carry it.

## Chevron motion

```css
.ph-section-chev { display: inline-flex; transition: transform 150ms ease-out; }
.ph-section[aria-expanded='false'] .ph-section-chev { transform: rotate(-90deg); }
@media (prefers-reduced-motion: reduce) { .ph-section-chev { transition: none; } }
```

Rows appear and disappear at once, with no height animation, as today. `SectionHeader` renders `<span className="ph-section-chev"><ChevronIcon open size={16} /></span>`, so the other `ChevronIcon` users keep their path swap.

## Pinned hairline

`.ph-section` stays `position: sticky; top: -56px` (`top: 0` while searching). It also becomes a scroll-state container. The hairline is a child, because a container query styles descendants only.

```css
.ph-section { container-type: scroll-state; position: sticky; }
.ph-section-rule {
  position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: var(--borderColor-hairline); opacity: 0;
}
@container scroll-state(stuck: top) { .ph-section-rule { opacity: 1; } }
```

`SectionHeader` adds `<span className="ph-section-rule" aria-hidden="true" />`. Chrome on Android supports this from version 133. Older engines simply show no pinned hairline, and nothing else changes.

## Empty sections and saved state

`rows` is the number of rows the section shows now (`s.prs.length`, `s.issues.length`, after search and filters). It is also the header count.

```
open(key) =
  rows === 0      -> peeked.has(key)
  filters ticked  -> true                          (unchanged from #32)
  otherwise       -> saved[key] ?? !CLOSED_BY_DEFAULT.has(key)
```

The resolveOpen rule (open the first non-empty section when none is open) still applies after this.

| File | Function | Change |
|---|---|---|
| `web/phone/phone-logic.ts` | `resolveOpen` | Take `{ key, rows }[]` and a `peeked` set. Empty sections return `peeked.has(key)`, never the saved value. Used by both tabs |
| `web/phone/phone-logic.ts` | new `sectionStates` | Adds `rows`, `empty` and `open` to each section through `resolveOpen`. Used by both tabs, replacing `isPrOpen` and `isIssueOpen` |
| `web/phone/PhoneApp.tsx` | new `peeked` state | `useState<Set<string>>`, page-load only, never written to storage |
| `web/phone/PhoneApp.tsx` | `toggle` | Takes the `InboxSectionView`. An empty section flips its `peeked` entry. A non-empty one saves `!open` through `saveOpen` |
| `web/phone/PhoneApp.tsx` | `prViews`, `issueViews` | `count: rows`, plus `empty` |
| `web/phone/phone-collapsed.ts` | `loadOpen`, `saveOpen` | No change. An empty section never writes, so its saved choice survives |
| `web/phone/PhoneInbox.tsx` | section map | Open and empty renders `.ph-section-empty` with `No PRs here` or `No issues here` (new `emptyLine` prop) |

## Accessibility

- The header stays a native `<button type="button">` with `aria-expanded={open}`.
- `aria-label={`${title}, ${count} ${count === 1 ? noun : noun + 's'}`}`, with `noun` `pull request` or `issue`. TalkBack reads "Mine, 5 pull requests, expanded, button". The label starts with the visible title (label in name).
- An empty header reads "Needs my review, 0 pull requests, collapsed, button".
- `.ph-section-empty` is plain text, not live. Focus stays on the header.
- Focus ring: the app's existing `:focus-visible` outline on buttons. No new style.

## phone-list.css diff

| Rule | Was | Now |
|---|---|---|
| `.ph-section` `min-height` | `44px` | `44px` (unchanged) |
| `.ph-section` `background` | `var(--bgColor-muted)` | `var(--bgColor-default)` |
| `.ph-section` `border-bottom` | `1px solid var(--borderColor-hairline)` | removed |
| `.ph-section` `color` | `var(--fgColor-muted)` | `var(--fgColor-default)` |
| `.ph-section` `font-size` / `line-height` | `12px` / `16px` | `13px` / `18px` |
| `.ph-section` `text-transform` | `uppercase` | removed |
| `.ph-section` | | add `container-type: scroll-state` |
| `.ph-section:active` | | new, `background: var(--bgColor-neutral-muted)` |
| `.ph-section-count` | `margin-left: auto` | `margin-left: -2px; color: var(--fgColor-muted); font-weight: 400; font-variant-numeric: tabular-nums` |
| `.ph-section-chev`, `.ph-section-rule`, `.ph-section-empty`, `.ph-section-group > .ph-row:last-child` | | new, as above |

`.phone.is-searching .ph-section { top: 0 }` and the sticky `top: -56px` stay.

The `.ph-arow` clash is not touched. `phone-actions.css` (line 208) and `phone-list.css` (line 207) both define `.ph-arow`, one for action-sheet rows and one for Activity rows. This change edits neither rule. Rename one when that clash is fixed.

## Checks against constraints.md

- Smallest text is 12px (meta). Header text is 13px.
- Phone frame is 412x915.
- State is never carried by colour alone (chevron, `aria-expanded`, rows).
- Sample data is synthetic: `acme-co/orders-api`, `acme-dev/tools`, authors `acme-dev`, `build-bot`, `sam-lee`.

## Invented copy

- `No PRs here`, `No issues here` (from the brief).
- The `aria-label` pattern `<title>, <n> pull requests`.

## Decisions (round 3)

- Tap target: the header is 44px, matching the app's other phone buttons.
- Counts follow the current search and filters: the count is the rows the section shows now. A section left with 0 rows renders closed by the empty rule. Since #32 a typed query replaces the sections with flat results, so in practice the filters drive this.
- Desktop layout is unchanged. Every rule here is scoped to `web/phone/`.
