# Notifications

The desktop app notifies through the shell. The front end compares each poll with the one before (`shared/notify-rules.ts`) and asks the shell to notify for:

1. a PR newly entering Needs my review (user or team request),
2. one of your PRs getting a new review (approved, changes requested, first comment),
3. CI on one of your PRs turning to failing. While your PR's CI runs, each poll re-reads your open PRs, because a check finishing does not move a PR's updated time,
4. a PR you authored or are assigned to merging or closing, once per PR, auto-merge and bot PRs included. This applies only when it closed within the last hour, so a comment on an old PR is not news,
5. an issue newly assigned to you,
6. an issue that newly mentions you.

## Behaviour

- The first sync after start never notifies.
- More than 3 in one poll become one summary.
- Nothing shows while the window is focused.
- Clicking a notification focuses the window and selects the PR or issue.
- The bell menu has Send test notification. It sends at once and ignores the mute switch and the focus of the window, so it lands while the window still has the focus.
- A trigger added after your settings were saved starts with its default. Your other choices stay.
- The bell in the top bar (desktop app only) toggles each trigger or mutes all. Settings persist in the userData folder.

## Preload and payloads

The preload exposes only `window.nod` with `notify`, `onOpen`, `getSettings` and `setSettings`, plus the shell build, relaunch and Settings > Hub calls. The main process validates every payload (`shared/notify-payload.ts`) and checks the sender's origin per channel. A page from the hub gets at most one notification call a second.

With a Hub URL, the window shows the hub's page, which reads the hub's `/api/events` stream and asks this shell to notify with the same rules. See [Desktop](desktop.md#hub-url).

Phone notifications use Web Push for the same triggers. See [Android](android.md) and [Phone](phone.md).
