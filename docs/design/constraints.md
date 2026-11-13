# Nod design constraints

## Windows

| Name | Size | Use |
|------|------|-----|
| Desktop | 1660x870 | Real browser viewport on a laptop |
| Phone | 412x915 | Android phone viewport (paired phone, `web/phone/`) |

Every layout is drawn at both sizes. At 1660 the Issues panes are 420, 958 and 280 (`pane-widths.ts`). Specs before 2026-11-11 were drawn at 1920x1040 and 960x1040.

## Rules

- Local web app on localhost, opened in a browser.
- Data comes from the GitHub API through the existing `gh` token. No paid services.
- Minimum font size is 12px.
- Keyboard first (j/k, next file, mark viewed) with full mouse support. Every action has a visible button and a key hint.
- State is never carried by color alone. Round 1 is greyscale, so pills differ by fill and outline.
- Capture path (how PR data reaches the app) is TBD, decided in round 3.
- Screenshot capture path (sub-issues round 3, 2026-11-11): fixture server (`NOD_FIXTURES=1 PORT=4496`, XDG dirs pointed at a scratch folder), one Orca browser tab created for the purpose, and a local harness page that loads the app in an iframe sized exactly 1660x870 or 412x915 (`?density=compact&theme=dark|light`). The Orca tab viewport is 1519x880 and cannot be resized, so the harness shifts the iframe by the overflow, `orca-ide screenshot --page <id>` takes two shots, and `magick` composites them pixel for pixel. Each capture loads the harness with a fresh nonce, since a hash-only navigation keeps the old document. No curl, no headless Playwright or Puppeteer. Desktop Chromium draws a 15px classic scrollbar inside phone-width scroll areas, which an Android phone does not.
- Sample data is synthetic: real PR titles from the org, authors limited to `acme-dev`, `build-bot` and `dependabot[bot]`, invented paths and counts. No buyer data.
- Round 2 colour, type and shape tokens (Primer primitives, dark and light) are listed in `tokens.md`; the build contract is `nod-spec.md`.

## Round 1 scope

Greyscale labelled boxes at real proportions. No colour, texture or styling. A build starts only after a layout is picked (round 1) and a mockup is approved (round 2).
