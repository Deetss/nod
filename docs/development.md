# Development

## Running from source

```
pnpm install
pnpm start
```

`pnpm start` builds the front end on the first run, then prints the URL (default `http://127.0.0.1:4477`). Set `PORT` to change the port. If the port is taken, the process exits with a message.

`scripts/oss-gate.sh` runs the release gate.

## Fixture mode

```
pnpm start --fixtures        # or NOD_FIXTURES=1
```

Fixture mode serves synthetic data, makes no GitHub calls, and turns every action (review, merge, viewed) into a logged no-op. It logs each call it would make (`[fixtures] would call InboxSync:full`, `Detail`, `Diff`).

- For the PR views, add `?state=<empty|loading|error|ratelimit|allviewed|interdiff|error422|ci-live>` to the URL.
- For the Issues view, use `?state=issues-empty|issues-loading|issues-error|issues-bulk|issues-new|issues-close|issues-labels|issues-sub-create|issues-sub-add|issues-sub-remove`.
- acme-banner #12 is a parent with five children (open, completed and not planned, one in acme-api). #17 is one of its children. acme-banner #23 has long titles and a parent. acme-api #412 has no sub-issues.
- `?open=issue/acme-banner/17` opens one issue directly.
- Add `?view=issues` to open the Issues view. Add `?theme=light` (or `dark`) to force a theme.
- `?state=ci-live` makes acme-web #1343's checks run to completion over about 30 s.
- Issue writes in fixture mode log what they would do and change an in-memory copy only.

Orca and Helper fixtures are described in [Orca](orca.md) and [Issues](issues.md).

## Scripts

```
pnpm typecheck
pnpm test
pnpm build
pnpm android:build
pnpm android:install
```

Design contract and mockups are in `docs/design`. The fidelity deltas are in `docs/design/nod-delta.md`.

Release gate: `scripts/oss-gate.sh` runs the secrets scan, the private-name scrub, typecheck, tests and build.
