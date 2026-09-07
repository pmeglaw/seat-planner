---
name: brand-system
description: Megeredchian Law brand token reference for seat-planner — exact terracotta/charcoal values, which --cds-* roles the brand file overrides and in which theme states, tint and search-hit tokens, the Draft purple family, the contrast tooling, the DECISIONS record, and the per-PR verification checklist. Use before touching any colour, token file, app/styles/, or when checking a PR's brand compliance.
---

# Brand System (LOCKED — do not change without owner approval, 2026-09-03)

The always-loaded rules (mark-only orange, terracotta primary, no blue, Draft purple) are in the root `CLAUDE.md`. This skill holds the values, locations, and verification mechanics behind them.

## Logo

`public/Logo-Megeredchian-Law.jpg` (lock-up, 1206×509 JPEG) — a RASTER render (3D bevels, glow), a reference asset only, not a UI mark (the mark-alone raster was removed in Phase 4 PR 3a, 2026-09-04: no consumer). Any in-app mark is a flat inline SVG in `--brand-charcoal` + `--brand-terracotta` from a vector source (not yet supplied). Logo orange **#EB7C35** (235,124,53) is the **MARK ONLY** — 2.81:1 on white **fails WCAG AA**. Charcoal #5D5C5B is the logo's secondary; `--brand-charcoal`.

## Primary UI colour — terracotta #B85C2E

(184,92,46): 4.56:1 on white (AA text), 3.97:1 on #161616 (non-text ≥ 3:1). Hover **#8F4521**, active **#7A3A1C**, tints #F5DDD1 / #FBE8DC. Links: light theme **#8F4521**, dark theme **#E8A07A**.

## Where it lives

`app/styles/brand/megeredchian-law-tokens.css` (+ `.json`) overrides Carbon's interactive roles — `--cds-button-primary/-hover/-active`, `--cds-border-interactive`, `--cds-interactive`, `--cds-link-primary/-hover`, `--cds-focus`, `--cds-background-brand`, `--cds-ai-*` — in all three theme states, plus `--cds-button-tertiary/-hover/-active` in the light state only (Carbon's light tertiary is blue 60; the dark tertiary is white — PHASE4BUILD §1.22) this app has (`html[data-carbon-theme]` = `white` | `g100` | absent = system via `prefers-color-scheme`; there is no `g10` state), plus the tier-C zone tokens that bypass those roles (`--sp-shell-current-bar`, `--sp-panel-dark-link`, `--sp-ai-border-end`). Every `--sp-*` alias inherits the brand through the `--cds-*` roles; **do not** hand-write terracotta into components. The original hand-off is kept under `docs/brand/`.

## Rules in full

1. IBM blue (#0f62fe, #0353e9, #0043ce, #4589ff, #78a9ff, #a6c8ff) is never a primary, link, focus or interactive colour. `grep -rn "0f62fe" app components lib` returns only the vendored `carbon-tokens.css` (whose blue roles are overridden). The search/filter hit surface is a terracotta tint (owner ruling O2, 2026-09-04, built in PR 3b): light fill #FBE8DC + edge #B85C2E via `--cds-highlight` and `--sp-pill-search-*` in the brand file; dark keeps the neutral layer-02 fill with the dark link colour #E8A07A as the edge (terracotta on #393939 is 2.53:1). Carbon's dark `--cds-highlight` (blue 90) is still declared but painted by nothing. No blue is in use.
2. #EB7C35 is never a UI colour (the token test fails the build if it appears outside the brand declaration).
3. Primary actions, current-section bar, focus ring, interactive borders and the AI label use #B85C2E; hover #8F4521; active #7A3A1C.
4. New colours derive from the terracotta scale; never introduce a blue. The Draft family (◇ badge, Draft status mark, header Draft indicator) is Carbon **purple 60 light / purple 40 dark** (`--sp-status-draft-mark`, `--sp-pill-badge`, `--sp-mode-draft-mark` in the brand file — DECISIONS §6 no. 17): Carbon's caution orange is one hue with the terracotta primary (ΔE2000 5.3, 1.10:1), and purple carries no other meaning in the app.
5. Contrast is verified with `docs/redesign-v2/phase3/contrast/generate-pairs.mjs` + the checker after any token change; white on #B85C2E is 4.56:1 — keep button labels ≥ 14px regular.
6. Recorded as `DECISIONS.md` §6 deviation 16 from the Carbon rule "Blue 60 is the only primary" — the brand layer is the one place that deviation is expressed.

## Verification checklist (every PR)

- primary button computed background `rgb(184, 92, 46)`
- hover `rgb(143, 69, 33)`
- focus ring #B85C2E (2px inset)
- header current-section bar #B85C2E
- links light #8F4521 / dark #E8A07A
- no #0f62fe outside `carbon-tokens.css`
- build and `npm test` green
