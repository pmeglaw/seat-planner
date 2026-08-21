# PASS1 §3 rename execution — field notes (pass1/token-renames)

Things found during the mechanical rename that want a decision or fix later.
Rule for this branch: renames and twin deletion only — nothing here was acted on.

## §3.2 (`--sp-color-*`)

- `app/concepts/component-state-board/ComponentStateBoard.tsx` pinned
  `var(--sp-color-workspace)` as a focus offset for its dark-graphite tile.
  The token is retired; the board now pins the literal `#161616` (same value,
  prototype-only surface). If the board ever becomes shippable UI it should
  sit in a real chrome zone instead.
- Tailwind `sp.*` color utility keys deliberately keep their pre-PASS1 names
  (`bg-sp-surface`, `text-sp-muted`, …) while the vars behind them moved to
  the new vocabulary. Renaming the utility keys (surface→layer-01 etc.) is a
  cosmetic Pass-2 candidate; only `bg-sp-surface` has call sites today.
- `--admin-surface-rgb` aliased the deleted `--sp-color-surface-rgb`, so it
  was deleted here (§3.3 lists it) rather than left dangling; its one call
  site (publish-readiness StatusBadge) derives via color-mix now.

## §3.3 (`--admin-*` surfaces/text/chrome — the chrome zone)

- **`--sp-chrome-scrim` (new chrome-extra, not in the §3 table):** six fixed
  dialog scrims derived a 45% wash from `--admin-chrome-bg`
  (AdminManagementPanel ×2, DataUtilitiesPanel ×3, publish dialog ×1). They
  sit OUTSIDE any chrome-zone subtree, so they can't read the zone's
  `--sp-background`; the scrim token mirrors the zone background exactly
  (#161616 / dark #0a0a0a). Pass-2 question: converge them with the
  `--sp-overlay-base` (#0a0a0a) scrims the seat dialogs use — that IS a
  (subtle) value change, so it was not done here.
- **`sp-zone-base` (base re-entry class):** light surfaces nested inside
  chrome zones — the active-filter chips (also shown inside the dark filter
  popover), the error/404 white cards, the SeatInspector avatar status dot —
  re-pin the base role values. Values mirror `:root` light/dark verbatim.
- The doc's "delete `--admin-rail-surface`" family: `--admin-rail-bg/border/
  muted` had zero call sites (AppRail consumes the chrome tokens directly),
  and `--admin-rail-surface` also had zero — but §3.3 maps it to
  `--sp-chrome-wash`, so the definition was renamed and kept. Zero-consumer
  delete candidates now: `--sp-chrome-wash`, `--sp-chrome-value`,
  `--sp-chrome-action`, `--sp-chrome-label`, `--sp-chrome-commit`,
  `--sp-chrome-danger-raised`, `--sp-layer-02` in the zone (chrome-raised had
  no consumers either).
- AdminManagementPanel had five call sites written as
  `var(--admin-border-subtle, var(--sp-color-border-subtle))` — a fallback on
  a token that never existed. Collapsed to `var(--sp-border-subtle)` (the
  fallback was always taken; resolved value unchanged). Pre-existing dangling
  ref on main; gone on this branch.
- Residual zone risk to know about: the chrome zone re-declares
  `--sp-layer-02`, which is also the alias behind `--sp-focus-offset-color`.
  No control inside a chrome zone uses a focus ring offset today (audited),
  but a future light-ringed control nested in a zone would get a #262626
  offset in light theme. The zone comment in globals.css flags it.
