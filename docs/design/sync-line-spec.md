# Phone sync status spec (round 2, layout A)

Issue #39. Mockups: `sync-line-mockup-phone.svg` and `.png` (dark, frames 1 to 6, plus a 2x anatomy of the menu status block, the ··· dot and the pull pill) and `sync-line-mockup-phone-light.svg` and `.png` (frames 1 and 2). Wireframe: `sync-line-wireframe-A-phone.svg` (picked).

Colour tokens are CSS custom properties from `web/tokens.css` (dark and light blocks). All boxes are x, y, w, h at 412x915 with `--ph-top` 0 (the TWA). Minimum font is 12px (`constraints.md`). The #34 rows, #33 headers, #32 search pill and filter button, and #35 controls are drawn as on main and not specced here. The pull disc is #37 (`native-nav-spec.md`), which merges first; this build rebases on it.

## Behaviour

- The sync line leaves the PRs, Issues and Activity lists on phone. The first section header (or the banner) sits right under the large title, 28px higher than today.
- The header ··· menu opens with a status block: when it synced, the API budget, the reset time and the last sync cost, and a Sync now pill. Sync now replaces the Refresh row.
- The #37 pull disc gets a pill beside it in every state. The pill takes the texts the sync line used to show during a pull.
- A problem puts a dot on ···. Failed and rate limited also show the existing `SyncFailedBanner`, because sync stops and writes go off. Stale and low budget show only the dot; the menu block explains them.
- `EmptyBlock` ("Nothing needs you") keeps its own sync line. It is not a list row.
- Desktop does not change.

## Removed

| Element | File | Change |
|---|---|---|
| `.ph-syncline` div (and its `pullOffset` margin, spinner and pull texts) | `web/phone/PhoneList.tsx` (`PullList`) | deleted. `PullListProps.syncLine` goes |
| `.ph-syncline` rule | `web/phone/phone-list.css` | deleted |
| `syncLine=` on `PullList` | `web/phone/PhoneInbox.tsx` | dropped. Loading renders `<LoadingLine />` as the first child of `PullList` (a loading state, not the sync line). The `cachedLine` text moves to the menu block |
| `syncLine=` on `PullList` | `web/phone/PhoneActivity.tsx` | dropped. `activitySyncLine(feed, view)` goes to the menu block while Activity is the active tab |
| Refresh menu item | `web/phone/PhoneBars.tsx` (`AppBar`) | replaced by the status block's Sync now |
| `syncText` | `web/phone/phone-logic.ts` | replaced by `syncStatus` (below), deleted if unused |

`EmptyBlock` (`web/phone/PhoneStates.tsx`) keeps its `syncLine` prop and `.ph-empty-sync`. Desktop `ActivityView.tsx` and `Topbar.tsx` keep theirs.

## Reuse

| Part | Reuse | Source |
|---|---|---|
| Menu | `.ph-menu`, `.ph-menu-scrim` (transparent, unchanged), `.ph-menu button` rows | `web/phone/phone-shell.css` |
| Sync now | `.ph-btn` (#35 pill, 48 tall) | `web/phone/phone-states.css` |
| Sync now busy | `.ph-btn.is-busy` plus `.ph-spinner`, `disabled` (dashed, muted) | `web/phone/phone-picker.css`, `web/phone/phone-states.css` |
| ··· button | `.ph-iconbtn` (44 round), `MoreIcon` | `web/phone/phone-shell.css`, `web/phone/PhoneIcons.tsx` |
| Block icons | `ClockIcon`, `AlertIcon` (16 grid) | `web/ui.tsx` |
| Banner | `SyncFailedBanner` on `ErrorBanner` (`.ph-error`), unchanged | `web/phone/PhoneStates.tsx`, `web/phone/phone-states.css`, `web/connection.css` (`.ph-error-note`) |
| Disc and pill | `.ph-pull-disc`, `.ph-pull-pill`, `PullDisc.tsx` | `web/phone/phone-pull.css` (#37) |
| Times | `ago` (relative), `clock` (HH:MM) | `web/phone/phone-logic.ts`, `web/activity-ui.ts` |

No new icon. The wireframe's sync glyph on the pill is dropped: the app has no refresh icon, and the busy spinner already carries the state.

## Tokens used

| Token | Dark | Light | Source | Used for |
|---|---|---|---|---|
| `bgColor-muted` | `#151b23` | `#f6f8fa` | `web/tokens.css` | menu fill, pull pill fill |
| `borderColor-default` | `#3d444d` | `#d1d9e0` | `web/tokens.css` | menu border, Sync now border, pill border |
| `borderColor-hairline` | `#3d444d80` | `#d1d9e080` | `web/tokens.css` | block bottom, row dividers |
| `button-default-bgColor-rest` | `#212830` | `#f6f8fa` | `web/tokens.css` | Sync now fill, ··· fill |
| `fgColor-default` | `#f0f6fc` | `#1f2328` | `web/tokens.css` | block title, menu rows, Sync now label |
| `fgColor-muted` | `#9198a1` | `#59636e` | `web/tokens.css` | API and reset lines, healthy clock, pill text |
| `fgColor-attention` | `#d29922` | `#7d4e00` | `web/tokens.css` | dot and AlertIcon: stale, low |
| `fgColor-danger` | `#f85149` | `#d1242f` | `web/tokens.css` | dot and AlertIcon: failed, limited, can't reach |
| `bgColor-inset` | `#010409` | `#f6f8fa` | `web/tokens.css` | 2px ring round the dot (header fill) |
| `borderColor-emphasis`, `fgColor-accent` | | | `web/tokens.css` | `.ph-spinner` track and arc |
| `borderRadius-full` | `999px` | | `web/tokens.css` | Sync now, pill, dot |

## Menu status block

`.ph-menu` grows to `min-width: 288px` (was 220), so it spans x 116 to 404, top 52. The block is the menu's first child, `.ph-menu-status`.

| Element | Box (menu-local) | Type | Colour | Notes |
|---|---|---|---|---|
| `.ph-menu-status` | 0, 0, 288, 148 + 1 | | | padding `12px 16px 16px`; `border-bottom: 1px solid var(--borderColor-hairline)`; grid: 16 icon column, 8 gap, text |
| Icon | 16, 15, 16, 16 | | `fgColor-muted` (healthy), else the tone token | `ClockIcon`, or `AlertIcon` when a problem leads |
| Title `.ph-menu-status-title` | 40, 12, 232, 22 | 15/22, 600 | `fgColor-default` | one line, ellipsis |
| API line | 40, 34, 232, 20 | 13/20, 400 | `fgColor-muted` | one line, ellipsis. Omitted with no `rate` |
| Reset line | 40, 54, 232, 18 | 12/18, 400 | `fgColor-muted` | one line, ellipsis. Omitted with no `rate` |
| Sync now | 16, 84, 256, 48 | 15/22, 400, centred | `.ph-btn` | 12 above, 16 below. With no `rate` the pill moves up 38 |
| Menu rows | from y 149, 48 + 1 each | 15/22 | unchanged | Density, Theme, Notifications, Open on GitHub, Check for updates |

The longest healthy title, `Synced 14:02 · 10 items moved` (Activity), measures 225 at 15px 600, inside the 232 text column. Menu bottom with every row is y 447, clear of the search pill (764).

### States

The block reads `syncStatus(input, now)` (new, `web/phone/phone-logic.ts`), which returns `{ problem, title, api, reset }`. The first matching row leads.

| # | Problem | Rule | Icon, tone | Title | API line | Reset line | Sync now |
|---|---|---|---|---|---|---|---|
| 1 | `unreachable` | `inbox.error` (Can't reach Nod) | AlertIcon, danger | `Cached 14:02 · actions off` (`cachedLine`) | as healthy, if known | as healthy | enabled (retry) |
| 2 | `limited` | `rateLimited(stale, now)` (#37) | AlertIcon, danger | `Rate limited` | `API 0 of 5,000 left` | `Resets 14:40, in 22m.` | disabled, dashed. No request |
| 3 | `failed` | `stale?.kind === 'error'`, or `ratelimit` with `resetAt` past | AlertIcon, danger | `Sync failed` | `Cached 14:02 · actions off` | `API 4,812 of 5,000 left` | enabled |
| 4 | `stale` | `now - syncedAt >= STALE_SYNC_MS` | AlertIcon, attention | `Synced 47m ago · Stale` | `API 4,790 of 5,000 left` | `Resets 14:40 · last sync cost 12` | enabled |
| 5 | `low` | `remaining < limit * LOW_API_RATIO` | AlertIcon, attention | `API 312 of 5,000 left · Low` | `Resets 14:40, in 22m.` | `Synced 1m ago · last sync cost 12` | enabled |
| 6 | none | otherwise | ClockIcon, muted | `Synced 2m ago`; Activity tab: `activitySyncLine` (`Synced 14:02 · 10 items moved`) | `API 4,812 of 5,000 left` | `Resets 14:40 · last sync cost 12` | enabled |
| | not synced | no `syncedAt` | ClockIcon, muted | `Not synced yet` | as healthy, if known | as healthy | enabled |

- Numbers use `toLocaleString('en-US')`. `Resets` uses `clock(rate.resetAt)`; `in 22m` uses `ago`. ` · last sync cost N` is omitted when `rate.cost` is undefined.
- Syncing (any state): Sync now becomes `.ph-btn.is-busy`, disabled, `.ph-spinner` plus `Syncing…`, `aria-busy="true"`. The title keeps its text until the refresh settles.
- Sync now does not close the menu. It calls `onRefresh()` (a `Promise<boolean>` after #37) and the block updates in place: `Synced just now` on success, row 3 on failure (the banner then shows behind the menu).

```ts
/** No sync for this long marks the data stale. */
export const STALE_SYNC_MS = 15 * 60_000;
/** Remaining API points under this share of the limit count as low. */
export const LOW_API_RATIO = 0.1;
```

Both live in `web/phone/phone-logic.ts`. The `stale` problem is not the `Stale` type in `shared/types.ts`, which means a failed sync (rows 2 and 3).

## The ··· dot

| Part | Value |
|---|---|
| Element | `<span className="ph-sync-dot" data-tone="attention" aria-hidden="true" />` inside the ··· `.ph-iconbtn` (which gains `position: relative`) |
| Box | 10x10, `top: 2px; right: 2px` inside the 44 button, so x 392, y 8 at 412 |
| Fill | `fgColor-attention` (`data-tone="attention"`: stale, low) or `fgColor-danger` (`data-tone="danger"`: unreachable, limited, failed) |
| Ring | `box-shadow: 0 0 0 2px var(--bgColor-inset)` |
| Shape | `border-radius: var(--borderRadius-full)` |
| Rule | shows when `syncStatus(...).problem` is not `none`. Clears on the next good sync, or when `now` drops the stale and low rules |
| Collapsed header | unchanged: the button stays 44 when `--ph-p` is 1 |

Colour only repeats the problem. The dot's presence says "open the menu", and the block's icon and title name the problem.

## Pull disc pill

The sync line no longer exists to carry pull texts, so the #37 pill (`.ph-pull-pill`, `role="status"`) shows in every disc state, not only rate limited. Box, type and tokens are as #37: 8 right of the disc, 24 tall, padding `0 10px`, `bgColor-muted`, `1px solid borderColor-default`, `borderRadius-full`, 12/16 `fgColor-muted`, vertically centred on the disc and moving with it. The widest text, `Release to refresh`, ends at x 362.

| Disc state (#37) | Pill text | Timing |
|---|---|---|
| Pulling | `Synced 2m ago` (title of row 6, Activity included) | follows the finger |
| At threshold | `Release to refresh` | from the 72 crossing |
| Syncing | `Refreshing…` | until the refresh settles |
| Done | `Synced just now` | holds 1000ms, then the #37 shrink (150ms) with the disc |
| Failed | `Sync failed` | holds 1000ms, shrink, then the banner (as #37) |
| Rate limited | `No request sent` | as #37 |

Change to `native-nav-spec.md`: its "Sync line" column becomes the pill text above, and Done gains the 1000ms hold (#37 shrinks at once). Name the hold `PULL_DONE_HOLD_MS = 1000` beside `PULL_THRESHOLD`; Failed and Rate limited reuse it. Under reduced motion the hold stays (it is reading time, not motion) and the shrink is 0ms.

## Accessibility

- ··· `aria-label` is `More` when healthy and `More, sync problem` while the dot shows. `aria-expanded` stays.
- The block is `role="group"` with `aria-labelledby` on its title. Sync now is `role="menuitem"`, the first focusable item. The title and lines are plain text inside the group.
- The block title is also mirrored into a visually hidden `role="status"` region outside the menu, so a finished Sync now is announced (`Synced just now`, `Sync failed`).
- The pill keeps `role="status"`; it is the only live region during a pull.
- `SyncFailedBanner` keeps `role="alert"`.
- State never rides on colour: the dot is announced in the label, the block switches ClockIcon for AlertIcon and names the problem in words.

## Tests

| File | Covers |
|---|---|
| `tests/phone-logic.test.ts` | `syncStatus` per row above, priority (limited beats stale), `STALE_SYNC_MS` edge (14m59s none, 15m stale), `LOW_API_RATIO` edge (500 of 5,000 not low, 499 low), cost omitted, no `rate` drops both lines, Activity title |
| new `tests/phone-sync-menu.test.ts` (jsdom) | menu opens with the block first and no Refresh row; Sync now calls `onRefresh` once, shows `Syncing…` disabled, keeps the menu open, then shows `Synced just now`; limited disables Sync now and sends nothing; the dot and `More, sync problem` show for stale, low, failed and limited, and neither shows when healthy |
| `tests/phone-section-header.test.ts` | drop `syncLine` from the `PullList` props; no `.ph-syncline` renders; the first section header is the list body's first child with no banner |
| `tests/phone-pull.test.ts` (#37) | pill text per disc state; Done holds `Synced just now` for 1000ms, then disc and pill leave (fake timers) |
| new `tests/phone-empty-block.test.ts` (jsdom) | `EmptyBlock` still renders its sync line (no test covers it today) |

## Checks against constraints.md

- Frames are 412x915. Smallest text is 12px (reset line, pill, captions).
- State is never carried by colour alone: icon shape, title words, the banner, and the ··· label.
- Every action keeps a visible button: Sync now replaces Refresh, Retry and Details stay on the banner.
- No new service or endpoint. Sync now reuses `POST /api/refresh` through `onRefresh`.
- Sample data is synthetic: `acme-co/orders-api`, `acme-dev/tools`, authors `acme-dev`, `build-bot`, `sam-lee`.

## Invented copy

- `· Stale`, `· Low`, `Rate limited`, `Resets 14:40, in 22m.`, `Syncing…`, `Synced just now`.
- `More, sync problem` (from the brief).

## Decisions

- Sync now keeps the menu open so its result shows in place. The old Refresh closed it.
- Two dot tones (attention, danger) for one dot shape; the block names the problem.
- Unreachable (Can't reach Nod) also gets the danger dot; its `ReachBanner` is unchanged.
- The menu scrim stays transparent, as today.
