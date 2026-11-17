# Icons

Icons come from `@primer/octicons-react`. The shared wrappers live in `web/ui.tsx`; use them or an Octicon directly, and do not hand-draw a glyph Octicons already has.

## Intentionally custom

These stay inline SVG. Add to this list when a new one is needed.

| Icon | File | Why |
|---|---|---|
| Nod logo | `web/Logo.tsx` | Brand mark. |
| Pairing QR code | `web/PairDialog.tsx` | Generated from data. |
| Dashed ring spinner | `web/ui.tsx` (`RingIcon`) | Animated running and queued state. |
| Checks ring | `web/ui.tsx` (`ChecksRing`) | Data-driven arcs. |
| Sub-issue progress arc | `web/issues/parts.tsx` | Data-driven arc. |
| Pull-to-refresh ring | `web/phone/PullDisc.tsx` | Gesture-driven arc. |
| Orca glyphs | `web/orca/orca-ui.tsx` | Orca state marks, no Octicon equivalent. |
| Status-row cut-out glyphs | `web/status-glyphs.tsx` | Filled shape with the mark cut out so the row fill shows through. |
| Severity octagon and triangle | `web/FindingParts.tsx` | Blocker and Major differ by shape, fill and word. |
| Circled-! error icon | `web/settings/SettingsFields.tsx` | No Octicon of a circle with `!`. |
| Phone icon set | `web/phone/PhoneIcons.tsx`, `web/phone/PhoneFitSheet.tsx` | 24px stroke set sized for touch; revisit with the Primer UI kit. |
| Rich-text toolbar | `web/inline/icons.tsx` | Already Octicons paths, kept as one local sprite. |
