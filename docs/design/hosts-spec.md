# Orca hosts and hub: redline spec

Round 2 for the approved layouts: picker B, chip A, settings A, banner A. Mockup: `hosts-mockup.svg` / `.png`. Tokens from `docs/design/tokens.md`; dark shown, light uses the same names. Data comes from slice 3 (`GET /api/orca/hosts`, `host` on sessions) and slice 2 (Hub URL, device role).

## D1 Send to list (dispatch dialog, send dialog, issue dispatch)

- Dialog unchanged: 560 wide, `bgColor-default`, `borderColor-default`, radius 6, 20 padding.
- One list across hosts, grouped RELATED / POSSIBLE as today. Rows stay 50 high, sorted as today; host does not change the order.
- Host tag on every row whose host is not `local`: pill 20 high, radius full, `bgColor-neutral-muted` fill, `borderColor-default` 1px, `text-caption` `fgColor-default`, 8px padding, right aligned 12px left of the state text (`working`, `done`). The tag never truncates; the branch line truncates first.
- Local rows show no tag, so a one-machine setup looks exactly like today.
- Offline hosts: their sessions are not listed. One `text-caption` muted line under the list: `<host> is offline (seen <ago>), so its sessions are not listed.` One line per offline host, max 2, then `and N more`.
- New worktree row: `New worktree` (mono semibold) then `on` caption then a select 150x26, `button-default-bgColor-rest`, radius 6, chevron. Default value: repo host pref, then default host, then `local`. Local reads `local (hub)` when this Nod is a hub with paired hosts, else `This machine`.

## D2 Host menu

- Anchored under the select, 220 wide, `bgColor-muted`, radius 8, `borderColor-default`.
- Rows 30 high: online hosts first in host-list order, selected row `bgColor-neutral-muted` with a check.
- Divider, then offline hosts: dashed-ring mark, muted name, `offline · <ago>` right aligned, not focusable. Footer note `Offline hosts cannot be picked.` caption muted.
- Keyboard: arrows move, Enter picks, Esc closes the menu only.
- Picking a host for a new worktree stores it as the repo's host pref (same as Settings).

## D3 Preferred host offline

- Select falls back to `local (hub)` and a `fgColor-attention` caption line with AlertIcon: `This repo usually runs on <host>, which is offline (seen <ago>).` Nothing is queued.

## C1 Session chip (PR row, detail card, issue strip)

- Chip unchanged for `local` sessions.
- Other hosts: `<host>` in `text-caption-semibold`, then ` · ` and the state word. Chip widens to fit; max 180, the state word ellipses first, never the host.
- Offline host (last state known): dashed ring mark, dashed `borderColor-default` border, muted text `<host> · offline <ago>`. Send is disabled with title `Orca host <host> is offline`.
- Detail card header gains `on <host>` caption after the worktree name for non-local hosts.

## P1 Phone

- Bottom sheet rows 60 high, radius 8, gap 8. Tag pill right aligned at 16 from the row edge, vertically on the name line.
- New worktree row grows to 103 with a full-width select (40 high, radius 8): `Run on` caption then the host. Opens the existing phone picker sheet with the same online/offline grouping as D2.
- Offline note as D1, under the list.

## S1 Settings > Hub (880x640)

- New nav item `Hub` after GitHub.
- Hub URL: input 440x32 mono, `Check` button 80x32. Status pill under it, 22 high, success/attention/danger tones from `conn-pill`: `Reachable · paired as admin · v0.2.32`, `Reachable · not paired`, `Unreachable`.
- `Pair this desktop` button only while not paired; it opens the hub's pair page in the default browser and waits for the device cookie.
- Orca hosts section: `Default host` select 200x28; per-repo table (repos seen in the inbox), HOST column select 160x24 with `Default` muted. An offline chosen host stays selected with a dashed border and `· offline`.
- Footer note: `Saved on the hub. Admin desktops only.` A desktop-role device sees the section read only with `Ask an admin device to change this.`
- Empty Hub URL hides the Orca hosts section unless this machine has paired environments itself.
- The pane never scrolls at 640; the repo table scrolls inside itself past 5 rows.

## B1 Hub unreachable

- Banner under the top bar, full width, 48 high, `bgColor-attention-muted`, bottom border `borderColor-attention-emphasis`. AlertIcon outline, label `text-caption-semibold` `fgColor-attention`, detail `text-caption` `fgColor-default` 16px after the label, `Retry` button right, 68x28.
- Connections chip shows attention tone `Local mode · hub down`.
- Shown only on a desktop with a Hub URL whose hub stops answering for 2 health checks (10 s apart). Hidden when the hub answers; then the toast `Back on the hub. N seen marks sent.` (4 s, bottom right, success check).
- Phones never show it (they have no fallback).

## States checklist

| Surface | States |
|---|---|
| D1 | one host only (no tags, today), mixed hosts, offline host note, no sessions anywhere (New worktree only) |
| D2 | closed, open, only local online |
| C1 | local, remote working/waiting/done, remote offline |
| S1 | URL empty, checking, reachable+admin, reachable not paired, unreachable, desktop role read only |
| B1 | hidden, shown, retrying (spinner in Retry), reconnect toast |

## Constraints check

- Min font 12px. State is never colour alone: tags carry the host name, offline uses dashed ring and words, banner has an icon and words.
- Keyboard: every select and menu works with arrows, Enter, Esc. No new global keys.
- Sample data synthetic (`acme-co`, `hub.example.ts.net`, hosts `laptop`, `desktop`).
