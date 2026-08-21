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
