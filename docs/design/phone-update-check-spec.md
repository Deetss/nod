# Phone Check for updates: spec

Layout A (one menu row, answer as a toast), approved 2026-11-16. Mockup: `phone-update-check-mockup.png`. Wireframes: `phone-update-check-wireframe-A.png` (picked) and `-B.png`.

Window: phone 412x915, dark and light. No desktop change; desktop keeps Settings > Updates.

## Menu row

| Property | Value |
|---|---|
| Where | Last row of the app-bar More menu (`web/phone/PhoneBars.tsx`), after Open on GitHub |
| Label | `Check for updates`, one line, no sub line |
| Box | Existing `.ph-menu button`: full menu width (min 220, content sets 300 in the mockup), min-height 48, padding 0 16 |
| Type | Inherited 15px, `--fgColor-default`, no clamp (fits on one line at 220) |
| Border | Existing hairline separators (`--borderColor-hairline`); last row has none |
| Pressed | Existing menu press state |
| Shown | Always. The answer says when updates do not apply |
| On tap | Menu closes (existing `run`), then the check starts |

## Toasts

All use the existing phone toast (`.ph-toast` in `phone-sheets.css`, via `usePhoneWrites` notify): left and right 16, bottom `--ph-bottom` + 96, padding 12 16, radius 10, 15px `--fgColor-onEmphasis`, wraps to 2 lines, 5s (`TOAST_MS`).

| State | Text | Style |
|---|---|---|
| Checking | `Checking for updates…` | neutral (`--bgColor-neutral-emphasis`), replaced by the answer |
| Latest | `Nod 0.2.10 is the latest release.` | neutral |
| Found | `Nod 0.2.11 is downloading. The host restarts on it when done.` | neutral |
| Failed | `Update check failed: <error>` | error (`.is-error`, `--bgColor-danger-emphasis`) |
| Not installed build | `Updates install only in the AppImage build.` | neutral |
| Restarted | existing `Nod updated` update toast (`.ph-update-toast`, accent), then reload | unchanged |
| Request refused | `Could not check for updates: <reason>` | error |

Texts other than Checking and Request refused come from `updateCheckText` (`shared/app-update.ts`), so desktop and phone read the same.

## Server

- `POST /api/updates/check` is loopback only today. Allow paired phones (tailnet device cookie) too; unpaired tailnet requests still get 403.
- The check runs on the host as it does from desktop Settings: found means the service downloads, exits, and systemd restarts it.

## Changes from the wireframe

- No version sub line on the row: the phone does not know the host's version until it checks.
- Failed toast has no Retry action: the existing toast has no actions; tapping the row again retries.
- Not-installed builds answer with a toast instead of a disabled row, for the same reason as the sub line.

## Scroll and states

No new region; the list keeps its scroll. Default state is the menu closed. Repeated taps while a check runs reuse the same check (the updater dedupes) and show one answer.
