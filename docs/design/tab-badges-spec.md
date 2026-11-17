# Phone tab badges spec (round 2, layout B)

Issue #38. Mockups: `tab-badges-mockup-phone.svg` and `.png` (dark: PRs, Issues and Activity tabs, every badge state at 2x, the header total at 2x, token key) and `tab-badges-mockup-phone-light.svg` and `.png` (PRs and Activity). Wireframe: `tab-badges-wireframe-B-phone.svg` (picked).

All boxes are in CSS px at 412x915. Colour tokens are CSS custom properties from `web/tokens.css`. Minimum font is 12px (`constraints.md`). The #31 app bar, #32 search pill and filter button, #33 section headers, #34 list rows and #35 pill and round controls are drawn as on main, for context only.

## Behaviour

- Each tab badge counts only what needs you. The full totals move into the screen header as quiet text.
- PRs and Issues show a number. Activity shows a dot, never a number, because its items repeat ones already counted on PRs and Issues.
- No badge at 0. Numbers above 99 read `99+`.
- The badge grows right from a fixed left edge, into the empty part of the tab slot.
- The tab button carries the accessible name. The badge is `aria-hidden`.

## Count rule per tab

| Tab | Counts | Not counted |
|---|---|---|
| PRs | Unseen PRs (`seen !== 'seen'`, not in `seenLocal`) in Needs my review, plus PRs in Mine with `seen === 'updated'` and not in `seenLocal`. Each PR counts once. | Org open, Dependabot, a NEW PR in Mine (you just opened it), read rows |
| Issues | Unseen issues (`seen !== 'seen'`, not in `issueSeen`) in the In progress, Assigned to me and Mentioned sections | With bot, Created, Untriaged, All open |
| Activity | A dot when any group is unseen (an event by someone else after `lastVisit`) and has a `needsMe` event by someone else | Own events. A group with only CI, merge or other non-needsMe events |

Sections are the server's `inbox.data.sections` and `issues.data.sections`, before the search query and the section filters. Issue sections are exclusive (`deriveIssueSections`), so the badge counts what shows under those three headers. Every tab shows no badge while it is loading, as today.

### Functions and files

| File | Change |
|---|---|
| `web/phone/phone-logic.ts` | New `prBadge(sections: readonly Section[], seenLocal: ReadonlySet<string>): number`, `issueBadge(sections: readonly IssueSection[], issueSeen: ReadonlySet<string>): number`, `badgeText(n: number): string \| undefined` (`undefined` at 0 or below, `'99+'` above 99), `tabName(label: string, badge: TabBadge): string`, and `type TabBadge = number \| 'dot'` |
| `web/phone/PhoneApp.tsx` | `unseen` uses `prBadge(inbox.data?.sections ?? [], seenLocal)` and `issueBadge(issues.data?.sections ?? [], issueSeen)`, keeping the `'loading'` guards. `activityUnseen` becomes `activityDot = activityNeedsMe(p.activity.feed, p.activity.lastVisit)`. `TabBar` gets `badges={{ prs, issues, activity: activityDot ? 'dot' : 0 }}`. `AppBar` gets `total` (below) |
| `shared/activity.ts` | New `activityNeedsMe(feed: ActivityFeed \| undefined, lastVisit: number): boolean`. `activityBadge` stays: the desktop segment (`web/App.tsx`) still shows its number, and the phone header uses it for `N new` |
| `web/phone/PhoneBars.tsx` | `TabBar` prop `counts: Record<PhoneTab, number>` becomes `badges: Record<PhoneTab, TabBadge>`. `AppBar` gets `total?: string` |
| `web/phone/phone-shell.css` | `.ph-count` anchor, `.ph-count-dot`, `.ph-apptitle-total`, the label fix |

`activityNeedsMe` reuses the loop rules of `buildActivityView`:

```ts
export function activityNeedsMe(feed: ActivityFeed | undefined, lastVisit: number): boolean {
  if (!feed) return false;
  return feed.groups.some((g) => {
    const theirs = g.events.filter((e) => !isOwnEvent(e, feed.viewer));
    return theirs.some((e) => isUnread(e, lastVisit)) && theirs.some((e) => e.needsMe);
  });
}
```

`lastVisit` is frozen while the Activity tab is open (`web/useActivity.ts`), so the dot stays until you leave the tab, as the count does today.

## Badge

Inside `.ph-tab-icon` (64 x 32, icon centred), so `50%` is the icon centre.

| Property | Value | Token or source |
|---|---|---|
| Box | `left: calc(50% + 4px)`, `top: -2px`, height 18, `min-width: 18px`, `padding: 0 5px`, `box-sizing: border-box`, radius 9 | today `right: 6px`; set `right: auto` |
| At 412 | PRs icon centre x 68.7, Issues 206, Activity 343.3. Badge y 831 to 849 | |
| Widths | `3` 18 (circle), `42` 24, `99+` 31 | 12px 700 digits + 10 |
| Text | 12/18, 700, centred, `tabular-nums` | `--fgColor-onEmphasis` |
| Fill | | `--bgColor-accent-emphasis` (`#1f6feb` dark, `#0969da` light) |
| Ring | `box-shadow: 0 0 0 2px` | `--bgColor-inset` (`#010409`, `#f6f8fa`) |
| Content | `badgeText(n)`; not rendered when `undefined` | |
| A11y | `aria-hidden="true"` | |

On the active tab the ring cuts into the `--bgColor-accent-muted` pill, as today.

### Dot

`<span className="ph-count ph-count-dot" aria-hidden="true" />`:

| Property | Value |
|---|---|
| Box | `left: calc(50% + 4px)`, `top: 0`, `width: 8px`, `min-width: 8px`, `height: 8px`, `padding: 0`, radius 4. At 412 on Activity: x 347.3, y 833 |
| Fill and ring | as the badge |

`.ph-count-dot` follows `.ph-count` in the file so its box wins at equal specificity.

## Header total

| Element | Box | Type | Colour token | Notes |
|---|---|---|---|---|
| `<span className="ph-apptitle-total">` inside `h1.ph-apptitle`, after the title text | inline, `margin-left: 8px` | 13px, 400 | `--fgColor-muted` | sits on the title baseline; shares the h1's nowrap and ellipsis |
| Expanded | title 28/36 600, baseline at y 87; total starts 8 after the title | | | `Pull requests 14 open` |
| Collapsed | title 17/24; total stays 13px | | | the total does not scale with `--ph-p` |

Text per tab, from `PhoneApp.tsx`:

| Tab | Text | Source | Hidden when |
|---|---|---|---|
| PRs | `N open` | `prAllTotal(inbox.data.sections)` | PRs loading |
| Issues | `N open` | the `all` section `count` of `issues.data.sections` | Issues loading |
| Activity | `N new` | `activityBadge(feed, lastVisit)` | no feed, or 0 |

The total ignores the search query and the section filters. `formatNum` (`web/ui.tsx`) formats it (`1,204 open`).

## Accessibility

| Badge | Tab button `aria-label` |
|---|---|
| none | no `aria-label`; the name comes from the label text (`Issues`) |
| 1 to 99 | `Issues, 3 need you` |
| above 99 | `Issues, more than 99 need you` |
| dot | `Activity, new items need you` |

- `tabName(label, badge)` builds the string, and `TabBar` sets `aria-label={badge ? tabName(label, badge) : undefined}`.
- The badge and dot are `aria-hidden`. Today's `aria-label="N unseen"` on the span goes.
- `aria-current="page"` stays on the active tab.
- The header total is read as part of the heading: `Pull requests 14 open`.
- State is carried by shape (a number, a dot or nothing), never by colour alone.

## Tab label fix

`.phone button { font: inherit }` (0,1,1) beats `.ph-tab` (0,1,0), so tab labels render at 15/22 instead of 13/18. In `phone-shell.css`, select the tab rule as `.phone .ph-tab` (0,2,0), as #33 did with `.phone .ph-section`. `.ph-tab.is-active` (0,2,0) comes after it and keeps the 600 weight. Every frame in the mockup draws labels at 13px.

## CSS

| File | Change |
|---|---|
| `web/phone/phone-shell.css` | `.ph-tab` becomes `.phone .ph-tab` |
| | `.ph-count`: `right: 6px` becomes `left: calc(50% + 4px); right: auto`; add `font-variant-numeric: tabular-nums`. Everything else unchanged |
| | Add `.ph-count-dot { top: 0; width: 8px; min-width: 8px; height: 8px; padding: 0; border-radius: 4px; }` |
| | Add `.ph-apptitle-total { margin-left: 8px; font-size: 13px; font-weight: 400; color: var(--fgColor-muted); }` |

No new tokens.

## Tests

| File | Test |
|---|---|
| `tests/phone-logic.test.ts` | `prBadge`: unseen in Needs counts; updated in Mine counts; NEW in Mine, Org open and Dependabot do not; a `seenLocal` id drops out; a PR in two counted sections counts once |
| | `issueBadge`: unseen in progress, assigned and mentioned count; created, untriaged, bot and all do not; an `issueSeen` id drops out |
| | `badgeText`: 0 is `undefined`, 9 is `'9'`, 99 is `'99'`, 100 is `'99+'` |
| | `tabName`: number, `99+` and dot wordings |
| `tests/activity-logic.test.ts` | `activityNeedsMe`: false with no feed; true for an unseen group with a needsMe event; false when the only unread event is own; false for an unseen CI-only group; `activityBadge` unchanged |
| `tests/phone-activity.test.ts` | `puts the unseen count on the Activity tab` becomes a dot test: `.ph-count-dot` present with a needsMe fixture, absent without one, and the tab's `aria-label` is `Activity, new items need you`. The B5 loading test checks `.ph-count` and `.ph-count-dot` are both absent |
| | The header shows `N new` after the title, and nothing while loading |
| New `tests/phone-tab-badges.test.ts` | Mounted `PhoneApp` with fixtures: PRs badge 3 where today's rule gives 12; Issues badge 3 with 153 open; `153 open` in the Issues heading; badge `aria-hidden`; tab `aria-label` `Issues, 3 need you`; no badge and no `aria-label` at 0; `99+` above 99 |
| | Label fix: `getComputedStyle` of `.ph-tab` gives `font-size: 13px` with `phone-shell.css` loaded, if the jsdom setup loads CSS; otherwise assert the selector text `.phone .ph-tab` in the stylesheet |

## Checks against constraints.md

- Smallest text is 12px (badge digits). Header total and tab labels 13.
- Phone frame is 412x915.
- State is never carried by colour alone: number, dot or nothing.
- Every colour is a `web/tokens.css` token, in both themes. The pink redlines are annotation only.
- Sample data is synthetic: `acme-co/orders-api`, `acme-dev/tools`, authors `acme-dev`, `build-bot`, `sam-lee`.

## Invented copy

- `N open`, `N new`.
- `Issues, 3 need you`, `Issues, more than 99 need you`, `Activity, new items need you`.

## Open questions

- The Activity dot follows the approved wording: an unseen group with any needsMe event. An old review request on an item that just got a CI run lights it too. The stricter rule (the unread event itself is needsMe) is a one-line change.
- Issue sections are exclusive, so an issue assigned to you that also has the bot label sits in With bot and does not count. Count by `inIssueSection` predicates instead?
