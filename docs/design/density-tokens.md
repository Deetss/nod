# Nod density tokens

Two densities. **Comfortable** is the default. **Compact** is the round 2 layout in `nod-spec.md` and `issues-spec.md`, unchanged. Colour tokens come from `tokens.md`. Minimum font stays 12px (`constraints.md`). Mockups: `issues-mockup-comfortable.svg`, `nod-mockup-comfortable.svg`. Build contract: `density-spec.md`.

## Spacing scale

| Token | px | Use |
|---|---|---|
| `space-1` | 4 | icon to label, chip gap inside a cluster |
| `space-2` | 8 | button gap, avatar to name |
| `space-3` | 12 | row vertical padding, paragraph gap |
| `space-4` | 16 | pane header padding, filter inset |
| `space-5` | 20 | row horizontal padding, section padding top and bottom |
| `space-6` | 24 | sidebar and detail gutters, block gap in a thread |
| `space-8` | 32 | detail pane top padding |

Chip gap in a row is 6px (`space-1.5`, only for chips and the line gap inside a row).

## Type

| Token | Compact | Comfortable | Use |
|---|---|---|---|
| `text-base` | 14 / 20 | 14 / 20 | titles, buttons, card rows (line-height 1.43 stays in lists) |
| `text-body` | 14 / 20 | 15 / 24.75 (1.65) | rendered markdown, comment bodies |
| `text-ui` | 14 / 20 | 14 / 21 (1.5) | detail meta line, sidebar rows |
| `text-section` | 14 / 20 semibold | 12 / 18 semibold, uppercase | sidebar and list group titles |
| `text-meta` | 12 / 18 | 12 / 18 | the one muted line in a row |
| `text-code-inline` | 12 / 18 | 13 / 20 | inline code in markdown |
| `text-heading-md` | 16 / 24 | 18 / 28 | markdown h2 |
| `text-title` | 20 / 28 | 20 / 28 | issue and PR title |

## Rows and blocks

| Element | Compact | Comfortable |
|---|---|---|
| Issue row, labels | 84 | 96 (12 + 20 title + 6 + 22 chips + 6 + 18 meta + 12) |
| Issue row, no labels | 84 | 68 |
| PR row | 84 | 96 (title, CI pill line, meta line) |
| Extra title line | +20 | +20 |
| List group header | 34 | 40 |
| Pane header | 40 | 48 list, 40 detail, 48 diff; none on the middle PR pane and sidebar |
| List filter row | 36 | 44 |
| Diff file header | 36 | 40 |
| Diff code line | 22 | 22 (code stays dense) |
| Footer | 28 | 28 |

## Named rules

| Rule | Value |
|---|---|
| `measure-body` | Rendered markdown and thread bodies sit in one centred column, 680px (about 80ch at 15px). Pane padding absorbs the rest. |
| `gap-paragraph` | 12px |
| `gap-list-item` | 6px |
| `gap-row-lines` | 6px between title, chips and meta line |
| `chips-max` | 3 label chips, then a neutral `+N` chip. Sidebar shows all. |
| `count-zero` | Comment count shown only above 0, as bubble icon plus number. "no comments" and "no labels" text are dropped. |
| `meta-line` | One muted 12px line: `repo #n · author · age` (PR rows add `· +a -d · N files`). |
| `code-inline` | New token `bgColor-code-inline`: dark `#656c761f` (composited `#181c22`), light `#818b9814`. No border, 1px vertical padding (20px chip on a 24.75px line), 5px side padding, radius 4. |
| `divider-hairline` | New token `borderColor-hairline`: `borderColor-default` at 50%. Replaces card borders and row separators. |
| `sidebar-empty` | An empty section is one muted 14px line: `No milestone · Set`. The action word uses `fgColor-accent`. |
| `sidebar-section` | No border or fill. 20px above and below, hairline between, 12px uppercase muted title, `Edit` link right in `fgColor-accent`. |
| `keycaps` | Hidden on buttons and section actions. Shown on hover, on keyboard focus, and while Alt is held (all at once). Footer and menus keep caps. |
| `footer-keys` | Six keys plus `? all keys`. Issues: `j k`, `Enter`, `c`, `l`, `e`, `x`. PRs: `j k`, `Enter`, `v`, `a`, `r`, `c`. |
| `pane-caption` | None. Pane headers hold actions only and are dropped when empty. |
| `density-setting` | `Comfortable` (default) or `Compact`, a radio group in the bell menu. Stored in `localStorage` key `density`. |

## Judgement calls

- 12px uppercase group titles also apply to the list (`ASSIGNED TO ME 3`), not only the sidebar, so both read the same.
- Markdown column is 680px, slightly over 80ch, so a 15px line holds about 81 characters.
- Inline code fill is `neutral-muted` at 12% instead of 20%, no border. The old fill (`#151b23` plus a border) read as a chip; this reads as a tint.
- Issue list legend (dot, NEW, UPDATED) is removed from the pinned list footer and moves to the `?` help overlay.
- `Reopen` appears only on closed issues. A disabled button plus note on every open issue was noise.
- Sidebar `Comment` and `Edit title` duplicates are dropped from Actions where the composer and header already carry them.
- PR `Checks` rows lose the word "pass" (the check icon carries it, and the section pill says `CI pass`). The Δ legend line becomes a `title` tooltip on the glyph.
