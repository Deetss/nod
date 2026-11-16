# Phone list rows spec (round 2, layout B)

Issue #34. Mockups: `list-rows-mockup-phone.svg` and `.png` (dark: PRs at rest, worst case at 412 and 360, Issues, Activity, glyph legend, 2x anatomy) and `list-rows-mockup-phone-light.svg` and `.png` (PRs and Issues). Wireframe: `list-rows-wireframe-B-phone.svg` (picked).

All boxes are x, y, w, h in CSS px at 412x915. Colour tokens are CSS custom properties from `web/tokens.css` (dark and light blocks). Minimum font is 12px (`constraints.md`). The large-title header (#31), the 44px section headers (#33) and the bottom search pill and filter button (#32) are drawn for context and not specced here.

## Behaviour

- One shared row, `ListRow` with class `.ph-lrow`, replaces the PR row, the issue row and the Activity row.
- Three lines. Line 1 is the title (up to 2 lines), the NEW or UPDATED badge and the relative time. Line 2 is a 16px status glyph and a muted sentence. Line 3 is chips with icons on the left and the size and comment count pinned right.
- One glyph per row shows the worst state. The shape carries the state; colour only repeats it.
- The sentence names both the CI and the review state, so the state the glyph does not show is still in the row.
- Tapping a PR or issue row opens its sheet, as today. Tapping an Activity row expands its timeline, as today.

## Reuse

| Part | Reuse or new | Source |
|---|---|---|
| Row | New `ListRow` component, class `.ph-lrow` | `web/phone/ListRow.tsx` (new), `web/phone/phone-list.css` |
| PR, issue, Activity rows | `PrRow`, `IssueRow` and Activity `Row` render `ListRow` | `web/phone/PhoneList.tsx`, `web/phone/PhoneActivity.tsx` |
| Unread dot | `.ph-dot` (9px, `fgColor-accent`) | `phone-list.css` |
| Badge | `Badge` and `.ph-badge-new` / `.ph-badge-updated` | `PhoneList.tsx`, `phone-list.css` |
| Label chips | `LabelChip` (`.chip.label-chip`), `+N` as `.chip.chip-more`, `splitChips` with `PHONE_CHIPS_MAX` | `web/issues/parts.tsx`, `web/issues.css`, `web/row-format.ts` |
| `#number` weight | `.row-num` (700) | `web/inbox.css` |
| Repo label | `repoLabel` | `web/repo-label.ts` |
| Time | `formatAge` (PR, issue), `activityAge` (Activity) | `web/ui.tsx`, `web/activity-ui.ts` |
| Diff text | `+a -d` with `num()`, as in `formatMeta` | `web/row-format.ts` |
| Comment label for issues | `commentsLabel` stays in the sheet; the row shows the bare count | `web/issues/issue-utils.ts` |
| Icons reused | `CheckIcon`, `RingIcon` (static, no `motion`), `BubbleIcon` from `web/ui.tsx`; `PrIcon`, `CircleDotIcon` from `web/issues/parts.tsx` | |
| Pressed fill | `bgColor-neutral-muted` on `:active`, as `.ph-row:active` today | `phone-list.css` |

## New icons

All drawn on the 16 grid (`viewBox="0 0 16 16"`), stroke 1.6, round caps and joins, like `glyph` in `web/ui.tsx`. Put them in a new `web/status-glyphs.tsx`. Filled glyphs cut their mark out with an SVG `<mask>`, so the row fill (including the pressed fill) shows through.

| Icon | Drawing | Used for |
|---|---|---|
| `CiFailGlyph` | filled octagon `M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2Z`, cross `M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6` cut, width 1.8 | PR: CI failing |
| `ChangesGlyph` | filled triangle `M8 1.6 14.9 13.9H1.1Z` (1.2 round-join stroke), bang `M8 6v3.4` + dot r1 at 8,11.7 cut | PR: changes requested |
| `RunningGlyph` | open ring `M8 2a6 6 0 1 1-6 6` (270 degrees, gap top left) | PR: CI running |
| `ReviewGlyph` | diamond `M8 1.6 14.4 8 8 14.4 1.6 8Z`, dot r1.9 filled | PR: needs review, no reviews yet |
| `ApprovedGlyph` | filled disc r7, tick `M4.9 8.2l2.1 2.1 4.1-4.5` cut, width 1.8 | PR: approved; issue: Done |
| `DashGlyph` | `M4 8h8`, width 1.8 | No CI (sheet and filters), issue: No project status |
| `ReadyGlyph` | ring r6 | issue: Ready |
| `ProgressGlyph` | ring r6 + right half disc `M8 4.4a3.6 3.6 0 0 1 0 7.2Z` | issue: In progress |
| `InReviewGlyph` | ring r6 + three-quarter disc `M8 8V4.4a3.6 3.6 0 1 1-3.6 3.6Z` | issue: In review |
| `PersonIcon` | head r2.6 at 8,5.4, shoulders `M2.9 13.8c0-2.9 2.3-4.6 5.1-4.6s5.1 1.7 5.1 4.6`, stroke 1.4 | line 3 author |
| `FileIcon` | `M4 1.8h5l3.5 3.5v8.9H4Z` + fold `M9 1.8v3.5h3.5`, stroke 1.4 | line 3 files |

Backlog reuses `RingIcon` (dotted ring) and CI passing reuses `CheckIcon`.

## Glyph states and colour

PR order, worst first. The first rule that matches leads.

| # | State | Rule | Glyph | Colour token | Dark | Light |
|---|---|---|---|---|---|---|
| 1 | CI failing | `ci === 'fail'` | `CiFailGlyph` | `fgColor-danger` | `#f85149` | `#d1242f` |
| 2 | Changes requested | `reviewStatus === 'changes requested'` | `ChangesGlyph` | `fgColor-attention` | `#d29922` | `#7d4e00` |
| 3 | CI running | `ci === 'running'` | `RunningGlyph` | `fgColor-accent` | `#4493f8` | `#0969da` |
| 4 | Needs review | `reviewStatus` is `needs review` or `no reviews yet` | `ReviewGlyph` | `fgColor-done` | `#ab7df8` | `#8250df` |
| 5 | Approved | otherwise (`n approval(s)`) | `ApprovedGlyph` | `fgColor-success` | `#3fb950` | `#1a7f37` |

CI passing (`CheckIcon`) and No CI (`DashGlyph`), both `fgColor-muted`, never lead a row, because every open PR also has a review state that ranks above them. They stay for the sheet and filters.

Issue project status (the existing `.status-*` colours in `web/issues.css`):

| Status | Glyph | Colour token |
|---|---|---|
| Backlog | `RingIcon` | `fgColor-muted` |
| Ready | `ReadyGlyph` | `fgColor-accent` |
| In progress | `ProgressGlyph` | `fgColor-attention` |
| In review | `InReviewGlyph` | `fgColor-done` |
| Done | `ApprovedGlyph` | `fgColor-success` |
| No project status | `DashGlyph` | `fgColor-muted` |

`No project status` shows only when the org project is configured (`showStatus`, from `projectStatus`). With no project set up, issue rows have no status line: line 2 is omitted and the row is 22 shorter.

Activity: `PrIcon` or `CircleDotIcon` by `item.kind`, `fgColor-muted`.

The cut-outs in filled glyphs use the row fill, never a fixed colour.

## Sentence (line 2)

| Row | Sentence | Example |
|---|---|---|
| PR | `[Draft ·] lead · other [· updatedNote]`. For glyphs 1 and 3, CI comes first; otherwise review comes first. First letter capitalised. CI words: `CI failing`, `CI running`, `CI passing`, `No CI` | `CI failing · needs review · 2 commits since you looked`, `1 approval · CI passing`, `Draft · no reviews yet · No CI` |
| Issue | `status name [· updatedNote]`; no line without a configured project | `In progress · 1 new comment` |
| Activity | `rowMeta` tail (actor and verb, or the event sentence) `[· n updates]` when `updates > 1` | `sam-lee requested changes · 3 updates` |

`updatedNote` shows only when `seen === 'updated'`, as today. The Draft chip on line 1 goes; `Draft` leads the sentence instead. The `N updates` pill on Activity goes into the sentence.

## Row boxes at 412

Row-local y. Content runs from x 32 to x 396 (364 wide).

| Element | Box | Type | Colour token | Notes |
|---|---|---|---|---|
| `.ph-lrow` | 0, 0, 412, 99 (98 + 1px hairline); 121 with a 2-line title | | fill `bgColor-default`; `border-bottom: 1px solid var(--borderColor-hairline)` | padding `var(--row-pad-y) 16px var(--row-pad-y) 32px`; `gap: var(--gap-row-lines)`; `display: flex; flex-direction: column`. Last row of a section: no border (#33 rule), 98 |
| Pressed | whole row | | `bgColor-neutral-muted` | `:active` |
| `.ph-dot` | 12, 18, 9, 9 | | `fgColor-accent` | unread only, unchanged |
| Line 1 `.ph-lrow-top` | 32, 12, 364, 22 (44) | | | flex, `align-items: flex-start`, gap 8 |
| Title `.ph-lrow-title` | 32, 12, to fill, 22 per line | 15/22; 600 unread, 400 read | `fgColor-default` | `flex: 1; min-width: 0`; clamp 2 with `-webkit-line-clamp`; wraps at word breaks only (`overflow-wrap: normal`) |
| Badge `.ph-badge` | before the time, 8 gap, y 13, w text + 12, 20 | 12/16, 700 | text `fgColor-muted`, inset 1px `borderColor-default` | radius 4, `flex: none`. Unchanged class |
| Time `.ph-lrow-time` | right edge 396, y 12, to fit, 22 | 12/22, 600, `tabular-nums` | `fgColor-muted` | `flex: none`, never shrinks |
| Line 2 `.ph-lrow-status` | 32, 40, 364, 20 (y + 22 with a 2-line title) | | | flex, `align-items: center`, gap 8 |
| Glyph `.ph-lrow-glyph` | 32, 42, 16, 16 | | per state, above | `flex: none`, `aria-hidden` |
| Sentence `.ph-lrow-sentence` | 56, 40, 340, 20 | 13/20, 400 | `fgColor-muted` | one line, ellipsis at the end |
| Line 3 `.ph-lrow-meta` | 32, 66, 364, 20 | 12/20, 400 | `fgColor-muted` | flex, gap 12, `white-space: nowrap` |
| Labels (issues) | from x 32, each chip 20 high, 6 apart, 8 before the repo | 12/20 | `.chip.label-chip` tokens | `PHONE_CHIPS_MAX` (2 comfortable, 1 compact), then `+N` |
| Repo + number | after labels | 12/20; `#n` 700 | `fgColor-muted` | name `min-width: 0`, ellipsis; `#n` `flex: none`, 4 after the name |
| Author | 12 after `#n` | icon 14 + 4 + login | `fgColor-muted` | PR and issue rows |
| Files | 12 after author | icon 14 + 4 + count | `fgColor-muted` | PR rows |
| Right group `.ph-lrow-end` | right edge 396 | 12/20, `tabular-nums` | `fgColor-muted` | `margin-left: auto; flex: none`, at least 12 from the left group |
| Diff | in right group | `+a -d` | `fgColor-muted` | PR rows |
| Comments | 12 after diff | `BubbleIcon` 14 + 4 + count (`formatNum`) | `fgColor-muted` | hidden at 0 |

Line 3 icons are 14px, vertically centred in the 20px line.

Compact density keeps the same structure: `--row-pad-y` 8 and `--gap-row-lines` 0 give 78 + 1 hairline, plus 22 per extra title line.

Frame 1 positions (list top padding 113, 44px headers): sync line 113, `Needs my review` 141, rows 185 and 284, `Mine` 382, rows 426, 525 and 624, `Org open` 722, next row 766.

## Squeeze order on line 3

Time, badge, diff and comment count never shrink. When the left group does not fit, take these steps in order and stop at the first that fits:

1. Drop the author.
2. Let the repo name ellipsize, down to 64px. `#number` always stays whole.
3. Drop the files count (PR) or fold label chips into `+N` one at a time, last label first (issue).
4. The repo name takes what is left, never under 64px.

CSS cannot drop items in this order, so a small DOM step does it. `web/phone/row-squeeze.ts` exports `squeezeMeta(el)`. It clears the classes, then checks `el.scrollWidth > el.clientWidth` and adds `is-no-author`, then `is-squeezed` (repo name `flex: 0 1 auto; min-width: 64px`), then `is-no-files` or a lower label count, re-measuring after each. Before step 2 the repo name is `flex: none`. `ListRow` runs it in a `useLayoutEffect`. One `ResizeObserver` on `.ph-list` re-runs it for every row on width change. Rows that fit cost one measurement.

Frame 2 (412) and frame 3 (360) show the steps on the long rows. The approved order puts author first, so the visible gain comes from the repo name.

## States

| State | Dot | Title | Badge | Frame |
|---|---|---|---|---|
| Unread, new | yes | 600 | NEW | 1, row 2 |
| Unread, updated | yes | 600 | UPDATED; sentence ends with `updatedNote` | 1, row 1 |
| Read | no | 400 | none | 1, rows 3 to 5 |
| Pressed | as above | | | `bgColor-neutral-muted` |
| Activity unread | yes | 600 | none | 5, rows 1 and 2 |
| Activity expanded | | | | `.ph-lrow-wrap.is-open` keeps `bgColor-muted` and the timeline below, as `.ph-arow-wrap.is-open` today |

Read and unread differ by the dot, the weight and the badge, never by colour alone.

## The button and `.phone button { font: inherit }`

PR and issue rows are `<button type="button">`; the Activity row is a button inside `.ph-lrow-wrap`. `.phone button { font: inherit; color: inherit }` in `phone-shell.css` has specificity 0,1,1, which beats a single class. So:

- `.ph-lrow` itself sets no `font`, `font-size`, `line-height` or `color`. It inherits 15/22 and `fgColor-default` from `.phone`.
- Every size above is set on the child spans (`.ph-lrow-title`, `-time`, `-sentence`, `-meta`, `.ph-badge`). Spans are not matched by `.phone button`, so their sizes apply.
- Any rule that must style the button element uses `.phone .ph-lrow` (0,2,0).

## Accessibility

The row's `aria-label` reads the full status, starting with the title.

```
PR:       "<title>, <New|Updated|unread when Activity>, <sentence>, <repo> number <n> by <author>, <files> files, plus <a> minus <d>, <c> comments, <age words>"
Issue:    "<title>, <New|Updated>, <sentence>, labels <l1>, <l2>, <repo> number <n> by <author>, <c> comments, <age words>"
Activity: "<title>, unread, <PR|Issue> <repo> number <n>, <sentence>, <age words>"
```

- Example: "fix: reject unsigned vendor calls, Updated, CI failing, needs review, 2 commits since you looked, acme-co/orders-api number 372 by build-bot, 4 files, plus 42 minus 8, 3 comments, 2 hours ago".
- The label always holds every item the squeeze dropped, and every label, not only the shown ones.
- New helper `ageWords(iso)` beside `formatAge` in `web/ui.tsx`: `5 minutes ago`, `2 hours ago`, `3 days ago`.
- The glyph, dot and icons are `aria-hidden`. The Activity button keeps `aria-expanded`.
- Tap target is the whole row, at least 98 high.

## CSS and files

Remove:

| File | Rules |
|---|---|
| `web/phone/phone-list.css` | `.ph-row`, `.ph-row:active`, `.ph-titleline`, `.ph-title`, `.is-unseen .ph-title`, `.ph-ci`, `.ph-status`, `.ph-meta`, `.ph-row-chips` and its `.chip`, `.chip-more` and compact rules, `.ph-arow-wrap`, `.ph-arow-wrap.is-open`, `.ph-arow` (the Activity grid), `.ph-arow .ph-dot`, `.ph-aicon`, `.ph-atitle`, `.is-unread .ph-atitle`, `.ph-atext`, `.ph-updates`, `.ph-ameta`, `.ph-aage` |
| `web/phone/phone-list.css` | the `.ph-arow:active` selector in the shared pressed rule |

Keep `.ph-arow` in `phone-actions.css` (line 208) as the action-sheet row. With the Activity rule gone, the clash ends and `sub-issues.css` `.ph-arow.ph-arow-danger` keeps working. Keep `.ph-dot`, `.ph-badge*`, `.ph-atimeline`, `.ph-aopen`, `.ph-askel*`.

Add to `phone-list.css`: `.ph-lrow`, `.ph-lrow:active`, `.ph-lrow-wrap`, `.ph-lrow-wrap.is-open`, `.ph-lrow-top`, `.ph-lrow-title`, `.is-unread .ph-lrow-title`, `.ph-lrow-time`, `.ph-lrow-status`, `.ph-lrow-glyph`, `.ph-lrow-sentence`, `.ph-lrow-meta`, `.ph-lrow-repo`, `.ph-lrow-author`, `.ph-lrow-files`, `.ph-lrow-end`, `.ph-lrow-meta .chip` (height 20), and the squeeze classes. Update the #33 rule to `.ph-section-group > .ph-lrow:last-child { border-bottom: 0 }`.

| File | Change |
|---|---|
| `web/phone/ListRow.tsx` | new shared row |
| `web/phone/row-squeeze.ts` | new squeeze step, with unit tests in `tests/` |
| `web/status-glyphs.tsx` | new glyphs and `prGlyph(pr)`, `prSentence(pr)`, `issueGlyph(status)` |
| `web/phone/PhoneList.tsx` | `PrRow` and `IssueRow` render `ListRow`; `Badge` moves into `ListRow` |
| `web/phone/PhoneActivity.tsx` | `Row` renders `ListRow` inside `.ph-lrow-wrap`; `RowIcon` goes |
| `web/phone/phone-list.css` | rules above |
| `web/ui.tsx` | `ageWords` |
| `shared/types.ts`, `server/queries.ts`, `server/github-map.ts`, `server/fixture-data.ts` | the new field below |

The desktop rows and `RowMeta` are unchanged.

## New server field: PR comment count

| Where | Change |
|---|---|
| `server/queries.ts`, `PR_FIELDS` | add `commentCount: comments { totalCount }` (GraphQL `PullRequest.comments`, `IssueCommentConnection.totalCount: Int!`) |
| `server/github-map.ts`, `RawPr` | `commentCount?: { totalCount: number }` |
| `server/github-map.ts`, `toSummary` | `...(raw.commentCount ? { commentCount: raw.commentCount.totalCount } : {})` |
| `shared/types.ts`, `PrSummary` | `commentCount?: number`, documented as conversation comments; absent on rows cached before the field existed |
| `server/fixture-data.ts` | `PrSeed.comments?: number`, mapped to `commentCount` |

The row hides the count when it is 0 or absent. This counts conversation comments only, the same connection issues use (`server/issue-map.ts`). Review-thread comments are not in it.

`FOLLOW_QUERY` and other queries that spread `PR_FIELDS` pick the field up too. The added cost per search page is one connection count.

## Checks against constraints.md

- Smallest text is 12px (badge, time, line 3). Title 15, sentence 13.
- Phone frame is 412x915; the long rows are also drawn at 360.
- State is never carried by colour alone: every glyph has its own shape, and the sentence names the state in words.
- Every colour is a `web/tokens.css` token. Label dots use the label's own GitHub colour, as `LabelChip` does today.
- Sample data is synthetic: `acme-co/orders-api`, `acme-dev/tools`, `acme-dev/platform-integration-tools` (from the approved wireframe), authors `acme-dev`, `build-bot`, `sam-lee`.

## Invented copy

- CI words in the sentence: `CI failing`, `CI running`, `CI passing`, `No CI`.
- `No project status`.
- The `aria-label` patterns and `ageWords` output.

## Open questions

- Needs review is drawn in `fgColor-done` (purple), which the app already uses for In review. Accent would clash with the unread dot and CI running.
- Issues with no project configured would all read `No project status`. Decided: they show no status line, as main does today; the dash shows only when a project is configured.
- The wireframe drew Today and Earlier headers on Activity. Activity has no groups today, so the mockup keeps a flat list.
- Should the PR comment count include review-thread comments (`reviewThreads` totals)? That costs more per search page.
