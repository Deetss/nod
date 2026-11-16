# Phone PR Dispatch with Orca spec (round 2, layout A)

Mockup: `pr-dispatch-mockup-phone.svg` (dark, 412x915). Wireframes: `pr-dispatch-wireframe-A-phone.svg` (picked), `-B-phone.svg`.
Colour and type tokens come from `tokens.md`; the 12px minimum is from `constraints.md`. No new tokens, no new CSS.

## Behaviour

- Phone only. The PR More sheet gets a `Dispatch with Orca…` row; the desktop is unchanged.
- The row sits after `Fix checks…` (or after `Fix conflicts…`, `Admin merge`, `Ready for review`, `Auto-merge`, whichever comes last) and before `Comment`, the same slot it has on issues.
- Tapping opens the existing `PhoneFixDispatch` dialog (`web/phone/PhoneFix.tsx`, unused today) over the sheet. It is not changed.
- The dialog posts `orcaDispatch({ repo, number, agent, name, prompt, baseBranch: headRef, pr: true })`.
- Success: close the dialog and the sheet, toast `Dispatched to <worktree>`. Failure: the error shows in the dialog, which stays open.

## Defaults in the dialog

| Field | Value |
|---|---|
| Subject line | `<repo> #<number> · <title>`, one line, ellipsis |
| Agent | `DEFAULT_AGENT` when listed, else the first configured agent |
| Worktree name | `pr-<number>` |
| Head branch | the PR head ref, locked (existing behaviour) |
| Prompt | `Work on <repo>#<number> "<title>" on its branch. Read the PR, its threads and checks first. Push to the PR.` The server appends its wrap-up, as for issues. |

## Elements

| Element | Source | Box at 412 | Font | Colour tokens |
|---|---|---|---|---|
| Row | `.ph-arow`, `web/phone/phone-actions.css` | full width, min-height 56, 64 with sub | title 15/600, sub 13/18 400 | title `fgColor-default`, sub `fgColor-muted`, bottom rule `borderColor-muted` |
| Row title | `Dispatch with Orca…` | one line | as above | as above |
| Row sub | `Starts an agent on <headRef>`, one line, ellipsis | | 13/18 | `fgColor-muted` |
| Dashed row (held) | `.ph-arow.is-dashed` | inset 16, radius 10 | as above, title muted | `borderColor-emphasis` dashed |
| Dialog | `.ph-confirm` in `.ph-scrim.is-center`, existing | width 412 - 48, max-height 80%, body scrolls | h2 18/28 600 | `bgColor-muted`, `borderColor-default` |

The blue bar beside the row in the mockup only marks the new row for review; it is not built.

## States

| State | Row |
|---|---|
| Orca reachable, repo cloned in Orca, head not a fork, PR open | `Dispatch with Orca…`, enabled |
| A live session is linked to this PR (`byPr[prId].related` or `chosen`) | dashed `In Orca`, sub `A session already works on this PR`, disabled |
| Dispatch in flight | dashed `Dispatching…`, sub `Waiting for Orca`, disabled |
| Offline (`writesOff`) | enabled look, disabled with sub `Offline`, as other write rows |
| Orca off or unreachable, repo not in Orca, fork head, PR closed or merged | row hidden |

## Scroll owner

Unchanged. The action sheet body scrolls under its pinned title and Cancel; the dialog body scrolls inside `.ph-confirm`. The page never scrolls.
