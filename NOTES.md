# PASS1 §3 rename execution — field notes (pass1/token-renames)

Things found during the mechanical rename that want a decision or fix later.
Rule for this branch: renames and twin deletion only — nothing here was acted on.

## Verification (scripts/css-dangling-refs.mjs, scripts/css-resolved-map.mjs)

- Dangling refs in emitted CSS: **branch 0**; main had 2 (`--admin-border-subtle`
  — the always-taken-fallback quirk below, fixed here; `--x` — a phantom
  Tailwind utility generated from a code COMMENT in LoginForm.tsx that
  mentioned `border-[var(--x)]`; the comment was reworded so the scanner
  stops minting it).
- Resolved-map diff main→branch: every value present on exactly one side is a
  deleted `-rgb` twin channel triplet or the deleted `none` shadow trio. One
  B-only artifact: `--sp-marker-neutral-ring` evaluated *inside the chrome
  zone* resolves through the zone's `--sp-border-strong` — no marker ever
  renders inside a chrome zone, so no shipped pixel changes, but it is the
  same latent alias-chain-in-zone class as the focus-offset note below.

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

## §3.4 (`--admin-*` brand/status/states)

- **`--admin-diff-vacated-text` stayed parked (doc error found):** §3.4 says
  the nine `--admin-diff-*` tokens are value-identical merges. True in BOTH
  themes for eight of them — but vacated-text is `#B3232C` (= danger STRONG)
  in light and `#ff8389` (= danger TEXT) in dark, so no single status role
  matches both. Merging it would change a pixel in one theme. Kept under its
  old name with a comment in globals.css; owner can rule which role wins in
  Pass 2 (that IS a value change).
- **`--admin-paper` was NOT a pure duplicate (doc error found):** §3.4 says
  "delete — duplicate of --sp-brand-subtle", but its dark admin value is
  `rgba(255, 87, 21, 0.12)` while `--sp-brand-subtle` has no dark override
  (#FBEAE1). The dark declaration was kept as a scoped `--sp-brand-subtle`
  override in the dark admin block — pixel-identical, name retired.
- `--admin-shadow-shell/command/map` (`none`) had zero call sites — deleted
  with nothing to migrate.
- `--sp-status-pending-mark` (#009d9a light) is deliberately NOT the same
  value as `--sp-status-pending-strong` (#136A67 light) — the doc's §1c table
  lists both anchors; the mark is the raw dot/bar hue, strong is the deeper
  text-capable anchor. success/danger marks DO equal their strongs (doc's
  "mark ≡ strong for these two").

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

## PR-C severity frame (2026-08-24)

- **The correct 1.4.1 severity frame is PAIRWISE, not per-state.** The original
  §8 audit reported "4 of 9 states fail"; measuring every pair showed **27 of
  36 pairs indistinguishable in greyscale by fill** (≤1.27:1 — worst cluster
  search / target-valid / target-invalid / reserved, all ≈1.00–1.01:1). A
  per-state frame undercounts because a state "passes" if it has *any* signal,
  while what users resolve is always a pair. `scripts/marker-contrast.mjs`
  (wired into `tests/marker-contrast.test.mjs`) enforces the pairwise frame:
  every pair must differ on fill texture, glyph, or geometry — never hue alone.
- `cursor: not-allowed` on invalid targets: requested as if it were PR-A scope,
  but it was never there — PASS1 §8 deferred it to PR-C (PR-A #434 was focus
  tokens only). Landed in PR-C, on invalid targets only (not on unavailable
  seats, which still open the inspector — the click is allowed).

## Type-floor rulings (2026-08-24)

- **The map canvas has its own geometry, exempted as ONE decision, not two.**
  The fixed boxes there — the 46px code pill, the 14px D/✓/✕ glyph circles,
  the 26px avatar circles — are off the 8px mini-unit size ladder *by design*:
  a spatial surface packs to seat pitch (tightest ~0.032 normalized ≈ 61px at
  the 1911px display cap), not to a component grid. That geometry choice and
  the sub-12px type inside it stand or fall together — "exempt the type" and
  "exempt the geometry" are the same ruling. Do not file 46px / 14px / 26px as
  mini-unit violations, and do not "fix" canvas type to 12px inside the
  existing boxes (it does not fit; that is what the PR-2 zoom-threshold rule
  is for).
- **Marks vs words.** Micro-glyphs (D/✓/✕/AI badges) are graphical elements —
  non-text contrast (3:1, all measured ≥5.31:1) governs them, no text-size
  floor. Words on the canvas (pill code labels, inline names, office plate
  title) are text and get the zoom rule: MARKS below a measured zoom
  threshold, 12px minimum at or above it. Pinned in
  `tests/desktop-seat-marker-system-source.test.mjs`; ledger enforced by
  `tests/type-floor-source.test.mjs` (also the graduation gate: a concept
  page moving out of `app/concepts/` lands in the scan and must shed its
  sub-12px debt first).
- Everything off the canvas holds the 12px floor (label-01 / `text-xs`) since
  the PR-1 sweep; eyebrows subordinate via weight + colour, never size.
- **Working zoom is fit, and fit is below the text threshold on common
  displays.** Both map surfaces open at fit (admin `mapViewMode` initial
  `"overview"` — "Fit is the resting state"; viewer `zoomFactor` initial
  `null` = fit-to-view), zoom is never persisted (the only stored map
  preferences are Show-names in localStorage and undo/redo in per-tab
  sessionStorage; zoom is plain component state that resets on load and on
  route remount), and there is no interaction telemetry (SpeedInsights is
  performance-only). Owner ruling to record (2026-08-24): **at working
  density this tool cannot show readable names. Hover disclosure and the
  inspector are therefore the PRIMARY read path, not a fallback, and should
  be resourced accordingly.** Nuance: the threshold is a rendered-width
  fact, not a mode fact — on a wide monitor the fit frame itself can cross
  the text threshold (≈1634px rendered for today's seat set), so wide
  displays get readable names at rest once the PR-2 tier lands.

## Read-path assessment (2026-08-25)

Found while assessing hover disclosure and the inspector as a first-class read
path (§5/§10 of the handoff; full findings in
`docs/design-system/READ-PATH-ASSESSMENT.md`). Neither item was acted on beyond
the comment correction noted below.

**Ruled same day: hover is a browse affordance** (owner ruling, recorded in the
assessment doc). F1/F2/F5 closed under it; §5/§7/§10 of the handoff updated.
Open from the assessment: F4 fix, F3/F6 rulings, F8 small fix, palette
assessment.

- **"Borders carry zero semantic weight" has TWO independent causes, and only
  one was written down.** The recorded one is the `group-hover:border` repaint.
  The second is `statusToneClass` (`SeatMarker.tsx:269`): it collapses to `""`
  whenever `tokenMode` is `selected` or `prominent`, dropping the whole
  `baseStatusToneClass` — status border included. `prominent` is not just
  selection: `prominentToken = activeMarker || searchProminent ||
  plannerHighlighted` and `activeMarker = selected || swapSource || swapTarget
  || moveEmployeeSource` (`:203`/`:210`), so a search hit, a planner
  highlight, and every swap/move source or target erase the status border too.
  Two orthogonal, common state changes, both total, neither recoverable. Fill
  and glyph survive both — the state classes re-declare them, and PR-C's
  ruling 2 has target modes preserve the underlying fill on purpose. That is
  the structural reason the two-axis vocabulary holds and a border axis could
  not, and it is a stronger argument than the hover one alone: a rebuttal has
  to defeat both erasers. Worth stating because the hue *is* still on the
  borders as redundancy (`globals.css:834` says so explicitly), which reads
  like a half-open door unless both erasers are on the record.
- **The comment at `SeatMarker.tsx:383` described a branch that never runs,
  and thereby understated the rule. Corrected 2026-08-25.** It read: the hover
  border "applies only to unselected markers". That is true of the
  `adminMarker` arm, which does carry a `selected ?` guard — and needs one,
  since its hover token (`--sp-legend-hover-border` `#8E8276`) differs from
  its selected token (`--sp-legend-selected-border` → `#D23F0A`). But **no
  caller passes `variant="admin"`** (the `:182` NOTE says so; `SeatMap.tsx:3260`
  passes `"viewer"`). The live viewer arm has no guard and needs none: hover
  and selected both resolve to `--sp-marker-active-edge` `#D46A24`, and the
  selected *ring* is a `ring-*` box-shadow that `group-hover:border` cannot
  reach at all. Net effect: the shipped repaint is unconditional across every
  unselected state, so the comment's scope ("only unselected markers are
  affected") read as a limit on the rule when it was really a description of
  the dormant arm's mechanism. **Dormant-branch comments drift silently** —
  nothing renders them, so nothing contradicts them. When touching an
  `adminMarker` arm, check which arm ships first.
- **Unrelated site, same class of defect: the admin map's zone hover-wash is
  dead code.** `SeatMap.tsx:315` is `const [hoverZone] = useState<string |
  null>(null)` — no setter — so `buildZoneWash(hoverZone ?? …)` at `:2525` can
  only ever receive the pinned zone, and the comment at `:2520` ("the hovered
  chip wins over the pinned") describes something that cannot happen. The
  viewer's copy is live (`ViewerSeatFinder.tsx:230`, consumed at `:421`), so
  v12 contract #8 is implemented on one surface of two. Parked in handoff §9.
