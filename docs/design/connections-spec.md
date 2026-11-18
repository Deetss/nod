# Connections: redline spec

Round 2 for layout B (top-bar chip + popover). Mockups: `connections-mockup-desktop.svg`, `connections-mockup-phone.svg`, `connections-mockup-states.svg`. Tokens from `docs/design/tokens.md`, dark shown; light uses the same token names.

## What it shows

How the Nod this window talks to reaches GitHub, Tailscale, paired devices and Orca. Read only, except Copy, Rename, Pair device, Check now and Fix links.

## Data

| Link | Source | Exists today |
|---|---|---|
| GitHub | `useConnection` (scopes, login) + sync status + API budget | yes |
| This Nod | `/api/health` build, attach result from `service.ts` (`attached`), port | partly; mode and port need a field |
| Tailscale | `phoneUrl` from `/api/devices`, Serve state | URL yes; Serve state needs `tailscale serve status --json` on the server |
| Devices | `/api/devices` list (name, lastSeen, push) | loopback only |
| Orca | `/api/orca` status, repos, session count | yes |

New: `GET /api/connections` aggregates the above, cached 20 s like Orca sessions, behind the existing guards. Desktop gets the full body. A paired phone gets its own device row and the other devices' names and last-seen only (see Decisions).

## Desktop (1660x870)

### Chip

- Box: x 1300, y 10, 168x28. Sits after the API budget, before the sync text. Width hugs text, min 120, max 220.
- Type: `text-caption-semibold`, ellipsis past max width.
- Shape: `borderRadius-full`, `borderWidth-thin` 1.5px ring.
- Icon: 12px mark left, 12px inset; text 8px after icon.
- Tones (reuse `conn-pill` `is-<tone>`):
  - ok: `bgColor-success-muted`, `borderColor-success-emphasis`, `fgColor-success`, CheckCircleFill.
  - neutral: `button-default-bgColor-rest`, `borderColor-default`, `fgColor-default`, ring mark.
  - attention: `bgColor-attention-muted`, `borderColor-attention-emphasis`, `fgColor-attention`, AlertFill.
  - danger: `bgColor-danger-muted`, `borderColor-danger-emphasis`, `fgColor-danger`, circled `!` (existing custom icon).
  - checking: neutral with dashed ring and dashed border.
- Label: worst state wins. ok: `Service · N devices` or `Local · N devices`. Neutral: `This machine only`. Attention: `N warning(s)`. Danger: the broken link, `Sync failing`, `Tailscale off`, `Orca unreachable`.
- Key: `c` toggles the popover. Footer key hint list gains `c connections`.
- Below 1500 wide the label drops to the mark plus count, for example `2`, with the full label as `title`.

### Popover

- Box: 520x548, top 52, right edge aligned to the chip's right edge. Arrow 16x8 centred on the chip.
- Fill `bgColor-muted`, border `borderColor-default`, radius 12, shadow as NotifyMenu.
- Padding 16. Header: `text-body-medium-semibold` title, `text-caption` muted subtitle 20 below. Esc key cap top right, 34x22.
- Closes on Esc, outside click, chip click, `c`. Focus trap like NotifyMenu; focus starts on the first row action.
- Never scrolls at 1660x870. With more than 4 devices, the device rows collapse to `N more devices` and the popover gains a scroll region over the rows only (max 6 rows visible).

### Strip

- Starts y 68. Nodes 58 high: GitHub 104, This Nod 112, Tailscale 104, Devices 84 wide; gaps 28. Orca 112x48 hangs 28 under This Nod.
- Node fill `bgColor-default`, border `borderColor-default`, radius 6. This Nod uses `bgColor-accent-muted` and `borderColor-accent-emphasis` 1.5px, as "you are here".
- Text: name `text-body-medium-semibold`, detail `text-caption` muted, 12 inset, one line, ellipsis.
- Links 2px. Working: `fgColor-success` solid. Off or idle: `borderColor-default` dashed 3 3. Broken: `fgColor-danger` dashed 5 3, and the far node takes the danger fill and border.
- Off nodes keep a dashed border and muted text.

### Rows

- Start y 220, each 46 high, divider `borderColor-muted` between.
- Mark at x 26 (12px). Name x 42, `text-body-medium-semibold`, never truncates (column 130). Detail x 176, `text-caption` muted, ellipsis at the action column. Action right aligned at 504, `text-caption` `fgColor-accent`.
- Row order: GitHub, This Nod, Tailscale, each device (most recently seen first), Orca.
- Actions: GitHub `Details` (opens Settings > GitHub; `Fix` when broken). Tailscale `Copy` (URL; toast as copy-link). Device `Rename` (inline, as the Pair dialog). Tailscale off: `Set up a hub` opens `docs/hub.md` on GitHub.
- Detail text by state is in the states mockup.

### Footer

- y 508: `Pair device` primary (opens the existing Pair phone dialog), `Check now` default. `Checked <time>` caption right aligned.
- Check now re-runs every probe; while it runs the button shows the spinner and the marks keep their last state.

## Phone (412x915)

- Entry: the `···` menu gains a `Connections` row above Sync now, with the same mark as the chip. The dot on `···` also lights for a danger state.
- Bottom sheet `ph-asheet` (as `PhoneConnectionSheet`), top 235, radius 16, drag handle, closes on drag past 120px, Back, or Close.
- Title `text-title-small`, subtitle caption.
- Rail list: rows 68 high, mark centred at x 28, 2px link between marks in the link colour. Order is the path the phone uses: This phone, Tailscale, Hub, GitHub, Orca on the hub. Hub mark is the accent ring.
- Other devices sit below a divider under a `text-caption-semibold` muted label, with no rail.
- Pinned footer: Close and Check again, 184x48 pills, 12 gap, `Checked <time>` caption 12 above.
- Sheet body scrolls; footer never does.

## States

| State | Chip | Popover |
|---|---|---|
| Checking (first load) | dashed, `Checking…` | marks dashed, details `Checking…` |
| All good, service | ok, `Service · N devices` | as desktop mockup |
| All good, own server | ok, `Local · N devices` | This Nod detail `Own server on port N` |
| Phone access off | neutral, `This machine only` | Tailscale and Devices off, `Set up a hub` |
| Warning | attention, `N warnings` | row with triangle and the reason |
| Broken | danger, link name | broken row first, `Fix` action |
| No devices | as above with `0 devices` | Devices row `No devices paired`, Pair device stays primary |
| Orca missing | no change to chip | Orca row ring, `Not running on this machine` |

Warnings: a missing optional scope, API budget under 10%, a device not seen in 7 days, Tailscale served but the health check through it failing.

## Constraints check

- Min font 12px: yes, smallest is `text-caption`.
- State not by colour alone: marks differ by fill, ring, dashed ring, triangle and `!`; chip labels name the state.
- Keyboard: `c` opens, Esc closes, every action is a button.
- Sample data is synthetic (`acme-dev`, `hub.example.ts.net`).

## Decisions

- A paired phone sees the other devices' names, last-seen times and push state, read only (approved 2026-11-18). Rename, revoke and pairing stay loopback only.
