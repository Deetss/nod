# Native navigation feel spec (round 2, layout A)

Issue #37. Mockups: `native-nav-mockup-phone.svg` and `.png` (dark, frames 1 to 7, plus a 2x disc anatomy and the travel curve) and `native-nav-mockup-phone-light.svg` and `.png` (frames 1 and 4). Wireframe: `native-nav-wireframe-A-phone.svg` (picked).

Colour tokens are CSS custom properties from `web/tokens.css` (dark and light blocks). All boxes are x, y, w, h at 412x915. Minimum font is 12px (`constraints.md`). Android first. The round back arrow at top left of sheets belongs to #35 (another branch) and is drawn but not specced here. #35 keeps the drag handle.

## Tokens used

| Token | Dark | Light | Source | Used for |
|---|---|---|---|---|
| `button-default-bgColor-rest` | `#212830` | `#f6f8fa` | `web/tokens.css` | disc fill (same as `.ph-iconbtn`) |
| `borderColor-default` | `#3d444d` | `#d1d9e0` | `web/tokens.css` | disc border, pill border |
| `borderColor-emphasis` | `#656c76` | `#818b98` | `web/tokens.css` | ring track (as `.ph-spinner`), rate-limited dashed border |
| `fgColor-accent` | `#4493f8` | `#0969da` | `web/tokens.css` | ring arc (as `.ph-spinner`) |
| `borderColor-danger-emphasis` | `#da3633` | `#cf222e` | `web/tokens.css` | failed disc border |
| `fgColor-danger` | `#f85149` | `#d1242f` | `web/tokens.css` | failed AlertIcon |
| `fgColor-muted` | `#9198a1` | `#59636e` | `web/tokens.css` | pause bars, pill text |
| `bgColor-muted` | `#151b23` | `#f6f8fa` | `web/tokens.css` | pill fill |
| `borderRadius-full` | `999px` | | `web/tokens.css` | disc, pill |
| `.ph-scrim` colour | `rgb(1 4 9 / 60%)` | `rgb(31 35 40 / 45%)` | `web/phone/phone-actions.css` | scrim behind every sheet |
| `.ph-handle` | 36x4, `borderColor-emphasis` | | `web/phone/phone-sheets.css` | unchanged |
| `--ph-top`, header 112 + 1 | | | `web/phone/phone-shell.css` | disc parks under the header's bottom edge |

Icons: `AlertIcon` (`web/ui.tsx`), `MoreIcon`, `ChevronIcon`, `SearchIcon`, `FilterIcon` (`web/phone/PhoneIcons.tsx`). The pause bars are two rects, not a new icon.

## Pull to refresh

### Disc

| Part | Value | Notes |
|---|---|---|
| Disc | 40x40 round, centred at x 206 | `.ph-pull-disc`. Fill `button-default-bgColor-rest`, `1px solid borderColor-default` |
| Ring | SVG 20x20, circle r 9, stroke 2, round caps | track `borderColor-emphasis`, arc `fgColor-accent`. Arc starts at 12 o'clock, clockwise |
| Arc fill | `stroke-dasharray: 56.55`, `stroke-dashoffset: 56.55 * (1 - progress)` | `progress = min(1, dy / PULL_THRESHOLD)` |
| Parked | bottom edge on the header's bottom (y 113), so fully hidden | z-index 3, under the header (z-index 4) |
| Travel | `translateY(min(56, 0.6 * dy))` | dy is finger travel since touchstart at scrollTop 0 |

The list does not move. The sync line's `marginTop: pullOffset(dy)` goes.

### States

| State | Visual | Sync line (`role="status"`) | Timing | Frame |
|---|---|---|---|---|
| Pulling | partial arc, `progress` of the ring | `syncLine` | follows the finger, no transition | anatomy |
| At threshold | ring closed (full circle) | `Release to refresh` | one `buzz(5)` on crossing 72 upward. Dropping back below re-arms it | 1 |
| Released below 72 | | `syncLine` | travel to 0 in 150ms, `cubic-bezier(0.3, 0, 1, 1)` | |
| Syncing | quarter arc on the track, spinning (`ph-spin` 0.9s linear, as `.ph-spinner`) | `Refreshing…`, without the inline `.ph-spinner` | settles to travel 40 in 180ms, `cubic-bezier(0.2, 0, 0, 1)`. Spins until the refresh settles | 2 |
| Done | ring closed | new `syncLine` | `scale(0)` and `opacity: 0` in 150ms, `cubic-bezier(0.3, 0, 1, 1)`, then travel resets to 0 | anatomy |
| Failed | border `borderColor-danger-emphasis`, `AlertIcon` 16 in `fgColor-danger`, no ring | `Sync failed` | holds 1000ms, then the Done shrink (150ms), then the existing `SyncFailedBanner` shows | 3 |
| Rate limited | border `1px dashed borderColor-emphasis` (3 3), two pause bars 3x10 r 1 in `fgColor-muted`, 4 apart, no ring | `syncLine` | follows the finger, never fills, no tick, no request. Holds 1000ms after release, then the Done shrink | 4 |

Rate-limited pill: `No request sent`, to the right of the disc (x = disc right + 8), 24 tall, padding `0 10px`, `bgColor-muted`, `1px solid borderColor-default`, `borderRadius-full`, 12/16 `fgColor-muted`. It carries `role="status"` and leaves with the disc.

State never rides on colour alone: ring shape, motion, icon, dash and the status text carry it.

### When each state applies

- Syncing: released at `dy >= PULL_THRESHOLD` and not rate limited. Calls `onRefresh()`.
- Failed: `onRefresh()` resolves `false` (the POST rejected or the refetched inbox carries `stale`).
- Rate limited: `rateLimited(stale, now)` is true, so `stale?.kind === 'ratelimit'` and `resetAt` is in the future. The server skips the poll during backoff and answers ok, so the client must decide before sending.
- Scrolling during a sync (`scrollTop > 0`) hides the disc at once. The sync line keeps `Refreshing…`.

## Swipe down to close

| Number | Value | Source |
|---|---|---|
| Drag zone | handle + header row (`.ph-strip`). Buttons inside stay taps (`closest('button')` check, as today) | `PhoneSheet.tsx` |
| Travel | sheet `translateY(dy)`, 1:1, never negative | |
| Scrim | `opacity: max(0, 1 - dy / 240)`, so 0.5 at the line | new `sheetScrimOpacity` |
| Close line | `SWIPE_CLOSE_PX` 120, or a 40px fling within 200ms (unchanged `shouldCloseSwipe`) | `phone-logic.ts` |
| Tick | one `buzz(5)` when dy crosses 120 upward. Re-arms below 120. Not on a fling | |
| Spring back | released below the line: `transform 180ms cubic-bezier(0.2, 0, 0, 1)` to 0, scrim back to 1 | was instant |
| Slide out | released past the line: `translateY(100%)` in 200ms, `cubic-bezier(0.3, 0, 1, 1)`, scrim to 0, then `onClose()` on `transitionend` (fallback timer 240ms) | |
| Busy | no drag while `closeDisabled` or the sheet's `busy` is true | |

Full sheets (`PhoneSheet`) get a scrim behind them, `.ph-sheet-scrim`, same colour as `.ph-scrim`. At rest the sheet covers it.

### Sheets to extend

Each wraps its handle and title in `<div className="ph-strip" {...swipe.bind}>`, spreads `swipe.sheet` (style and `onTransitionEnd`) on the sheet and merges `swipe.scrimStyle` into its scrim. The scrim fades through `--ph-scrim-k`, a registered number its background alpha multiplies by, so the sheet inside stays opaque. `onClose` is the sheet's existing close.

| Sheet | File | Container | Drag zone |
|---|---|---|---|
| Action sheet | `web/phone/PhoneActionSheet.tsx` (`PhoneActionSheet`) | `.ph-asheet` in `.ph-scrim` | `.ph-handle` + `.ph-asheet-title` (60 tall) |
| Confirm | `web/phone/PhoneActionSheet.tsx` (`PhoneConfirm`) | `.ph-confirm` in `.ph-scrim.is-center` | none. Centred dialogs do not swipe; Cancel and Back close them |
| Bot split | `web/phone/PhoneBotSplit.tsx` | `.ph-asheet` | `.ph-handle` + `.ph-split-heading` |
| Edit title | `web/phone/PhoneEditTitle.tsx` | `.ph-etitle` | `.ph-handle` + `.ph-etitle-head` |
| Notify | `web/phone/PhoneNotifySheet.tsx` | `.ph-asheet` | `.ph-handle` + `.ph-asheet-title` |
| Sub-issue row | `web/phone/PhoneSubIssues.tsx` (`PhoneSubRowSheet`) | `.ph-asheet` | `.ph-handle` + `.ph-asheet-title` |
| Remove sub-issue | `web/phone/PhoneSubIssues.tsx` (`PhoneRemoveSub`) | `.ph-confirm` in `.ph-scrim.is-center` | none, as Confirm |

`PhoneFitSheet` and `PhoneCreateSubIssue` already render `PhoneSheet` and pick up the new springs and scrim with no change.

## Reduced motion

Under `prefers-reduced-motion: reduce`:

- Finger tracking (disc and sheet) stays, since it is direct manipulation.
- Settle, spring back, slide out and shrink take 0ms. The sheet closes on release.
- The syncing disc does not spin. It shows the static quarter arc (as `.ph-spinner` today), and `Refreshing…` carries the state.
- Haptics are unchanged.

## Haptics

New `web/phone/haptics.ts`:

```ts
export const BUZZ = { success: 10, tick: 5 } as const;

/** Vibrates where Android Chrome allows it: the API exists and the page has had a tap. */
export function buzz(ms: number): void {
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  if (typeof nav.vibrate !== 'function') return;
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
  nav.vibrate(ms);
}
```

| Event | Call | Where |
|---|---|---|
| Approve succeeds | `buzz(BUZZ.success)` | `usePhoneWrites.ts` `review`, when `event === 'APPROVE'` and the run returns ok |
| Resolve succeeds | `buzz(BUZZ.success)` | `web/useFindings.ts` `resolve` success branch, only when `phone` is true |
| Dispatch succeeds | `buzz(BUZZ.success)` | `PhoneSheets.tsx`, each `Dispatched to <worktree>` success path |
| Pull reaches 72 | `buzz(BUZZ.tick)` | `PullList` |
| Sheet drag crosses 120 | `buzz(BUZZ.tick)` | `useSwipeClose` |
| Any failure, including dispatched with Start work failed | none | |

iOS Safari and desktop have no `vibrate`, so the check makes them silent. No bridge or manifest change: the TWA runs in Chrome, which holds the permission.

## Back stack

Unchanged. `useSheetStack` gives each level and layer one History entry, and Back closes one at a time:

dispatch sheet → PR sheet → search, filter or menu layer → Issues or Activity tab layer → PR list → leaves Nod.

There is no "press back again to exit". Swipe close and Close call the same `onClose`, which goes through `sheets.pop()` and `history.back()`, so all three agree. A sheet closed by the Back gesture leaves without the slide out, as today.

## Reuse

| Code | Today | Change |
|---|---|---|
| `PULL_THRESHOLD` (`phone-logic.ts`) | 72 | unchanged. Also drives `pullProgress` |
| `shouldRefresh` | `dy >= 72` | unchanged |
| `pullOffset` | sync line margin, `min(72, 0.6 * dy)` | replaced by `discTravel(dy) = dy <= 0 ? 0 : min(DISC_MAX, 0.6 * dy)`, with `DISC_MAX = 56` and `DISC_REST = 40` |
| new `pullProgress(dy)` | | `clamp(dy / PULL_THRESHOLD, 0, 1)` |
| new `crossedUp(prev, next, line)` | | `prev < line && next >= line`, for both ticks |
| new `sheetScrimOpacity(dy)` | | `max(0, 1 - dy / 240)` |
| new `rateLimited(stale, now)` | | as above |
| `SWIPE_CLOSE_PX`, `shouldCloseSwipe` | 120, fling 40 in 200ms | unchanged |
| `PullList` (`PhoneList.tsx`) | moves the sync line, swaps its text | returns a fragment: `.ph-pull-disc` plus the scroller. Owns the disc state (`idle`, `pulling`, `syncing`, `done`, `failed`, `limited`). `onRefresh` becomes `() => Promise<boolean>`. New prop `limited`. Drops the inline `.ph-spinner` while the disc shows |
| `PhoneApp.tsx` | `onRefresh` returns void | returns the reload promise as ok or failed. Passes `limited={rateLimited(stale, now)}` |
| `useInbox` `reload(true)` | void | returns `Promise<boolean>` |
| `PhoneSheet` (`PhoneSheet.tsx`) | drag state inline, instant snap back | drag moves to new `useSwipeClose(onClose, { disabled })`, returning `{ bind, sheet, scrimStyle }`. Adds the scrim, springs and tick. Springs are inline transitions; reduced motion skips them in the hook |
| `useSheetStack` | Back, Close and swipe agree | unchanged |
| `phone-actions.css` | `.ph-scrim` | background alpha times `--ph-scrim-k` (registered with `@property`), shared by the new `.ph-sheet-scrim` |
| new `phone-pull.css` | | `.ph-pull-disc` and its states, ring, pause bars, `.ph-pull-pill`, and a reduced-motion block. The disc logic lives in new `PullDisc.tsx` (`usePullToRefresh`) |

## Tests

| File | Covers |
|---|---|
| `tests/phone-logic.test.ts` | `discTravel` (0, 50 → 30, 72 → 43.2, 100 → 56), `pullProgress`, `crossedUp` (fires once, re-arms below), `sheetScrimOpacity` (0 → 1, 120 → 0.5, 300 → 0), `rateLimited` (kind, past and future `resetAt`) |
| new `tests/phone-haptics.test.ts` | no `vibrate` → no call. `userActivation.hasBeenActive` false → no call. Active → `vibrate(ms)` |
| new `tests/phone-pull.test.ts` (jsdom) | touch at scrollTop > 0 does nothing. Crossing 72 buzzes once. Release past 72 calls `onRefresh`. Resolve `false` shows `Sync failed`, then the disc leaves after 1s (fake timers). `limited` never calls `onRefresh` and shows `No request sent` |
| new `tests/phone-swipe-close.test.ts` (jsdom) | drag from a button does nothing. Release at 100 springs back and keeps the sheet. Release at 140 calls `onClose` once after the slide. Crossing 120 buzzes once. Busy blocks the drag. Each sheet in the table above wires its strip |
| `tests/phone-back.test.ts` | new chain case: dispatch sheet, PR sheet, search layer, Issues tab layer; each Back closes one, and the last leaves history at depth 0 with no extra entry |
| haptic call sites | approve ok buzzes 10, approve failed does not. Dispatch success buzzes, `Start work failed` does not |

## Checks against constraints.md

- Frames are 412x915. Smallest text is 12px (pill, meta, badges).
- State is never carried by colour alone (ring shape, icon, dash, motion, status text).
- Every action keeps a visible button: Close or back, Retry, the action sheet rows. Gestures add to them.
- Sample data is synthetic: `acme-co/orders-api`, `acme-dev/tools`, authors `acme-dev`, `build-bot`, `sam-lee`.
- No new service or endpoint. Pull reuses `POST /api/refresh`.

## Invented copy

- `No request sent` (from the brief).
- `Sync failed` in the sync line for the 1s failed hold.

## Decisions

- Centred confirm dialogs do not swipe. Back and Cancel still close them. Swipe applies to bottom sheets only.
- The syncing disc rests at travel 40, flush under the header edge.
- There is no "press back again to exit".
- A banner that arrives with a failed refresh waits until the failed disc has left, so the list holds still during the 1s hold.
