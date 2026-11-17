# Merge (bypass) spec (round 2, layout A)

Mockups: `bypass-merge-mockup.svg` and `.png` (desktop, dark), `bypass-merge-mockup-phone.svg` and `.png` (412x915, dark), `bypass-merge-mockup-light.svg` and `.png` (desktop bar and phone bar, light). Wireframes: `bypass-merge-wireframe-A.svg` and `-A-phone.svg` (picked).

Tokens are CSS custom properties from `web/tokens.css` (dark and light blocks). No new tokens. Boxes are x, y, w, h at 1660x870 (desktop) and 412x915 (phone), from `constraints.md`. Minimum font is 12px. Sample data is synthetic (`acme-co/orders-api`, `sam-lee`).

## Behaviour

- A PR author can merge their own PR without the required review when a repository ruleset lets them bypass it. Nod shows this as Merge (bypass).
- Merge (bypass) appears only when the gate below passes. It replaces Admin merge and never shows next to it.
- Desktop: a `.btn-danger` in the review bar, right of Auto-merge, key `M`, in the slot Admin merge uses today.
- Phone: on your own PR the disabled Approve pill's slot becomes a Merge (bypass) pill. Comment and the round More stay. The More sheet drops its Admin merge row while the pill shows.
- Confirm is inline. The bar turns into a strip that names what is skipped, the method, branch deletion, and the checks and threads met. No typed number, since the gate already proved checks and threads.
- Busy: every bar button disables, the merge button shows a spinner and `Merging…`.
- Success: the PR shows its merged state, the bar goes, and a toast reads `Merged #372 without review. Branch deleted.`
- Failure: GitHub's text shows in place. Merge (bypass) stays enabled so the user can retry.
- Hidden when checks fail or are pending, threads are unresolved, there is no bypass, or the PR is a draft, conflicting or behind. Hidden states look like today, except for the note row change below.
- The server re-checks the whole gate before it merges.

## Copy

| Where | Text |
|---|---|
| Button | `Merge (bypass)` |
| Tooltip (`title`) | `Skips the required review. ` + method sentence: `Squash and merge.`, `Merge commit.` or `Rebase and merge.` |
| Own-PR note, bypass available | `Your PR: you can't approve it, but you may skip review` |
| Own-PR note, busy | `Merging #372 without review…` |
| Own-PR note, otherwise | `Your PR: GitHub only allows comments` (`OWN_PR_HINT`, unchanged) |
| Strip title | `Merge #372 without review?` |
| Strip line 1 | `Skips the required review (0 of 1 approvals).` Count is approvals so far of the highest `required_approving_review_count`. |
| Strip line 2 | squash: `Squash and merge, then delete {head}.` merge: `Merge commit, keeps {head}.` rebase: `Rebase and merge, then delete {head}.` A merge commit says `then delete {head}` when `deleteBranchOnMerge` is true. |
| Strip line 3 | `6 of 6 checks passed · 3 of 3 threads resolved` |
| Desktop strip buttons | `Cancel` (Esc), `Merge (bypass)` (Enter) |
| Phone strip buttons | `Cancel`, `Merge now` |
| Busy button | `Merging…` |
| Toast | `Merged #372 without review.` plus ` Branch deleted.` when the branch was deleted |
| Failure | GitHub's text (`githubErrorText()` or `gh` stderr, max 200 chars). Phone adds `GitHub refused the merge. Nothing changed.` |

## Desktop elements

Detail pane is 480 wide at x 401 (`pane-widths.ts` three: 400, 480). The bar is pinned under the pane scroll (`.review-bar`, `web/pr-detail.css`). At 480 the container query under 600px hides `.merge-method`, so the method lives in the tooltip and the strip.

| Element | Source | Box at 1660 | Type | Tokens and states |
|---|---|---|---|---|
| Review bar | `.review-bar` | 401, 720, 480, 122 (bypass, busy, hidden) | | fill `bgColor-muted`, top border `borderColor-default`. Padding 12 16, row gap 8 |
| Approve | `.btn.btn-primary`, disabled | 417, 732, 110, 32 | 14/20 600 | disabled: transparent, `1px dashed borderColor-emphasis`, `fgColor-muted` |
| Request changes | `.btn`, disabled | 535, 732, 164, 32 | 14/20 400 | as Approve |
| Comment | `.btn` | 707, 732, 117, 32 | 14/20 400 | `button-default-bgColor-rest`, `borderColor-default`, `fgColor-default`. Busy: disabled |
| Own-PR note | new `.review-bar-note` (`muted small`) | 417, 772, 448, 18 | 12/18 | `fgColor-muted`. `flex: 0 0 100%`, one line, ellipsis |
| Auto-merge | `AutoMergeBtn` | 568, 798, 131, 32 | 14/20 400, `.kbd` m | unchanged. Busy: disabled |
| Merge (bypass) | `.btn.btn-danger`, `Btn keyHint="M"` | 707, 798, 158, 32 | 14/20 600, `.kbd` M | fill `bgColor-danger-muted`, border `borderColor-danger-emphasis`, label `fgColor-danger`. Hover: fill `borderColor-danger-emphasis`, label `fgColor-onEmphasis` (existing rule). Focus: global ring |
| Busy merge button | `.btn.is-busy`, disabled, `aria-busy` | same box, `min-width` 158 | 14/20 600 | dashed disabled look, 12px `.spinner` then `Merging…` |
| Tooltip | native `title` | below the cursor | OS | |
| Confirm strip | `.review-bar.is-confirm` | 401, 700, 480, 142 | | fill `bgColor-attention-muted` over `bgColor-muted`, top border `borderColor-attention-emphasis` |
| Strip icon | alert glyph | 417, 714, 16, 16 | | `fgColor-attention` |
| Strip title | | 441, 712, 20 tall | 14/20 600 | `fgColor-default` |
| Strip lines | | 441, 736, three lines of 18 | 12/18 | line 1 `fgColor-default`, lines 2 and 3 `fgColor-muted`. Wrap allowed, no clamp |
| Strip Cancel | `.btn`, `keyHint="Esc"` | 562, 798, 109, 32 | 14/20 | default button |
| Strip Merge (bypass) | `.btn.btn-danger`, `keyHint="Enter"` | 679, 798, 186, 32 | 14/20 600 | as Merge (bypass). Takes focus when the strip opens |
| Failure row | `.thread-error` look (`web/diff.css`), new `.review-bar-error` | 417, 692, 448, 32 (bar 401, 680, 480, 162) | 12/18, padding 6 8, radius 6 | fill `bgColor-danger-muted`, border `borderColor-danger-emphasis`, text and x-circle `fgColor-danger`. `flex: 0 0 100%`, `role="alert"` |
| Toast | `.toast` (`web/detail.css`) | 1291, 784, 353, 42 (right 16, bottom 44) | 14/20 | fill `bgColor-success-muted`, border `borderColor-success-emphasis`, check `fgColor-success`. Uses the existing toast lifetime |
| Merged pill | header pill | 417, 140 | 12 600 | `bgColor-done-emphasis`, `fgColor-onEmphasis` |

The own-PR note moves out of `.review-bar-side` into its own full-width row (`.review-bar-note`) whenever `ownPr` is true. Today it shares the review row and wraps word by word at 480. This is the only visible change to hidden states.

Scroll owner stays `.detail-scroll`. The bar and strip never scroll and the pane never page-scrolls.

## Phone elements

Bar is `.ph-actionbar` (`web/phone/phone-sheets.css`): `bgColor-inset`, top border `borderColor-default`, padding `14px 16px calc(14px + var(--ph-bottom))`. Pills follow `round-controls-spec.md`.

| Element | Source | Box at 412x915 | Type | Tokens and states |
|---|---|---|---|---|
| Action bar | `.ph-actionbar` | 0, 815, 412, 100 | | unchanged |
| Merge (bypass) pill | `.ph-btn` + new `.is-bypass` | 16, 829, 158, 48 | 15 600, nowrap | fill `bgColor-danger-muted`, border `borderColor-danger-emphasis`, label `fgColor-danger`, radius `borderRadius-full`. Pressed: fill `borderColor-danger-emphasis`, label `fgColor-onEmphasis` |
| Busy pill | `.ph-btn.is-bypass.is-busy`, `aria-busy`, `aria-disabled` | same | 15 600 | fill kept, 14px `.spinner` then `Merging…`, gap 8 |
| Comment | `.ph-btn` | 182, 829, 158, 48 | 15 400 | busy: disabled (`1px dashed borderColor-default`, `fgColor-muted`) |
| More | `.ph-btn.is-narrow.is-round` | 348, 829, 48, 48 | | unchanged, stays enabled while busy |
| Own-PR note | `.ph-meta` | 16, 202, 380, 20 | 14/20 | `fgColor-muted`, nowrap with ellipsis (the bypass text is 353px, so it fits) |
| Confirm bar | `.ph-actionbar` | 0, 707, 412, 208 | | grows upward; More hides while it is open |
| Confirm strip | `.ph-pending-bar` (attention, unchanged) | 16, 721, 380, 100 | strong 15/22 600, lines 13/18 | `bgColor-attention-muted`, `borderColor-attention-emphasis`, radius 12. Line 1 `fgColor-default`, lines 2 and 3 `fgColor-muted` |
| Cancel | `.ph-btn` | 16, 829, 186, 48 | 15 400 | default pill. Android back does the same |
| Merge now | `.ph-btn.is-danger` | 210, 829, 186, 48 | 15 600 | `bgColor-danger-emphasis` fill and border, `fgColor-onEmphasis`. In the bar: `margin: 0; box-shadow: none` so it matches Cancel |
| Failure strip | `.ph-pending-bar` + new `.is-error` | 16, 757, 380, 64 (bar 0, 743, 412, 172) | strong 15/22 600 one line with ellipsis, sub 13/18 | `bgColor-danger-muted`, `borderColor-danger-emphasis`, 16px x-circle `fgColor-danger`, `role="alert"` |
| Toast | `.ph-toast` | 16, 751, 380, 44 | 15 | `bgColor-neutral-emphasis`, `fgColor-onEmphasis`, radius 10 |
| Merged pill | `.ph-pill.is-done` | 16, 172 | 13 600 | `bgColor-done-emphasis` |

Scroll owner is `.ph-sheet-body`. The bar and strip never scroll.

## Default and other states

| State | Desktop | Phone |
|---|---|---|
| Bypass available (default on such a PR) | bar with Merge (bypass) | Merge (bypass) pill in the Approve slot |
| Confirm | strip, focus on Merge (bypass) | strip over the pills, Cancel and Merge now |
| Busy | all bar buttons disabled, spinner | pill spinner, Comment disabled |
| Success | merged pill, no bar, `.toast` | merged pill, no bar, `.ph-toast` |
| Failure | error row first, normal rows below, retry enabled | error strip, normal pills, retry enabled |
| Hidden | today's bar plus the note row | today's bar |
| Writes off (`disabled`) | button disabled like the others | pill `.is-off` |

## Keys

| Key | Where | Action |
|---|---|---|
| `M` | review bar, bypass shown | open the confirm strip |
| `M` | review bar, Admin merge shown | Admin merge dialog (unchanged). The two never coexist |
| `Enter` | confirm strip | merge |
| `Esc` | confirm strip | cancel, focus back on Merge (bypass) |
| `a` `r` `c` `m` | while the strip is open or busy | inert |

## Gate

A pure function in `shared/pr-actions.ts`. All of these must hold:

| Field | Source | Must be |
|---|---|---|
| `author.login` vs `viewer.login` | detail query | `isOwnPr()` true (the author, not the latest pusher) |
| `state` | detail query | `OPEN` |
| `isDraft` | detail query | `false` |
| `mergeable` | detail query | `MERGEABLE` |
| `mergeStateStatus` | detail query | `BLOCKED` (so `BEHIND`, `DIRTY`, `UNSTABLE` hide it) |
| `commits.nodes[0].commit.statusCheckRollup.state` | detail query | `SUCCESS` (`ciFromRollup` gives `pass`) |
| `reviewDecision` | `PR_FIELDS` | `REVIEW_REQUIRED` |
| `reviewThreads` | detail query | zero with `isResolved: false`, and `totalCount` at most 50 |
| ruleset bypass | REST, below | `true` |

```ts
export type BypassInput = AdminInput & {
  state: string; mergeable?: string; mergeStateStatus?: string;
  reviewDecision?: string; unresolvedThreads: number; threadsComplete: boolean;
  rulesetBypass: boolean;
};
export function canBypassMerge(d: BypassInput): boolean;
```

`ReviewAccess` gains `bypass: boolean`. When it is true, `admin` is forced to `hidden`. The ruleset lookup runs only when every other row holds, so most PRs cost no REST call.

## REST calls

1. `GET /repos/{owner}/{repo}/rules/branches/{base}` with `base` URL-encoded. Keep rules with `type: "pull_request"` and `parameters.required_approving_review_count >= 1`. Collect their distinct `ruleset_id`. None kept means no bypass (classic branch protection stays with Admin merge).
2. `GET /repos/{owner}/{repo}/rulesets/{ruleset_id}` for each kept id. Bypass is true only if every kept ruleset has `current_user_can_bypass` of `always` or `pull_requests_only`. `never`, `exempt` or a missing field means false.

Caching and errors:

- New `server/ruleset-bypass.ts`. Key `${repo}@${base}`, memory plus disk (`ruleset-bypass/<fileKey>.json`, the `repo-meta` pattern in `server/issue-cache.ts`), TTL 1 hour.
- Each path keeps its ETag. Calls go through `client.restConditional()`, which sends `If-None-Match`; a 304 costs nothing and reuses the body.
- 403 or 404 on either call caches `false` for the TTL.
- 5xx, network errors and rate-limit errors return `false` and are not cached, so the next detail load retries.
- Uses the REST core budget (5,000 an hour), not GraphQL points. Worst case is about 2 calls per repo and base per hour.
- A merge refused with 403, 405 or 422 drops the cache entry.

## Send path

- `POST /api/bypass-merge` in `server/app.ts`, body `{ repo, number }` (zod). No `confirm` field. Response goes through `notify()` with kind `bypass-merge`.
- `web/api.ts` `bypassMerge(repo, number)`. Phone `usePhoneWrites` gains `bypassMerge(pr)`.
- `GithubProvider.bypassMerge(ref)` in `server/github-provider.ts`:
  1. Re-read `MERGE_STATE_QUERY`, extended with `mergeable`, `reviewThreads(last: 50) { totalCount nodes { isResolved } }` and the repository's `squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed deleteBranchOnMerge`.
  2. Run `canBypassMerge()` on the fresh fields. The ruleset step skips the TTL but still sends `If-None-Match`.
  3. On failure return `{ ok: false, message: 'Merge (bypass) refused: <reason>' }` with the first failed row as the reason.
  4. Otherwise run `gh` with `bypassMergeArgs()` (`pr merge --admin --repo <repo> <n>` plus method flags), then `store.invalidate`, `follow`, `setFollow(ref, 'merging')`, as `adminMerge` does.
- `DETAIL_QUERY` adds the same four repository fields and `totalCount` on `reviewThreads`.

Method choice, `bypassMergeFlags(refs, allowed, settings)` in `shared/pr-actions.ts`:

| Preferred (`mergeMethodFor`) | First allowed in order | Flags |
|---|---|---|
| `squash` | squash, merge, rebase | squash: `--squash --delete-branch`. merge: `--merge`. rebase: `--rebase --delete-branch` |
| `merge` (release rule) | merge, squash, rebase | same mapping |

No method allowed refuses with `no merge method is allowed on this repository`. The UI reads the same function for the tooltip, strip line 2 and the toast.

## Tests to add

- `tests/bypass-merge-gate.test.ts`: truth table for `canBypassMerge`. One passing row, then one row per failing field: not own PR, CLOSED, MERGED, draft, CONFLICTING, UNKNOWN mergeable, BEHIND, DIRTY, UNSTABLE, CLEAN, rollup FAILURE, PENDING, missing rollup, APPROVED, CHANGES_REQUESTED, one unresolved thread, `totalCount` 51, no bypass. Also: `reviewAccess` forces `admin` to `hidden` when `bypass` is true.
- `tests/ruleset-bypass.test.ts` with a fake client: `always` and `pull_requests_only` pass; `never` and `exempt` fail; two rulesets need both; count 0 rules ignored; no pull_request rule gives false; 403 and 404 cached for an hour; 500 not cached; a 304 reuses the body and costs no call; the TTL expiry sends `If-None-Match`; `base` with a slash is encoded.
- `tests/pr-actions.test.ts`: `bypassMergeFlags` for each allowed combination, the release rule, rebase-only, and none allowed.
- `tests/admin-merge.test.ts` (or a new bypass file): the server re-check refuses when fresh data fails any row, and runs `gh pr merge --admin` with the chosen flags when it passes.
- UI: `ReviewBar` shows Merge (bypass) and not Admin merge; strip opens on `M`, Enter merges, Esc cancels; busy disables every button; failure keeps retry. Phone: pill takes the Approve slot, More sheet has no Admin merge row.

## Docs to update

- `docs/behaviour.md`: new Merge (bypass) bullets beside Admin merge (gate, REST calls, cache, re-check, method choice), and the review bar line naming Merge (bypass).
- `docs/keys.md`: `M` reads `admin merge, or merge (bypass) on your own PR`. Same label in `web/keys.ts` (both entries).
- `docs/phone.md`: the Approve slot becomes Merge (bypass) on your own PR, and the sentence on Admin merge.

## Decisions (were open questions)

1. A 403 or 404 from either ruleset endpoint, or a missing `current_user_can_bypass` (for example an org ruleset read by a non-admin), means no bypass and hides the action.
2. `always`, `pull_requests_only` and `exempt` count as allowed. Anything else does not. This replaces the `exempt` row in REST calls step 2 above.
