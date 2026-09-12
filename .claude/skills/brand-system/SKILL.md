---
name: brand-system
description: "Megeredchian Law brand guidance for Seat Planner: approved theme-specific tokens, terracotta interactions, Draft purple, semantic aliases, Carbon version boundaries and contrast verification. Use before changing colors, tokens or app/styles/, or reviewing brand compliance."
---

# Seat Planner brand system

Documentation refreshed 2026-09-11 using Context7 and official Carbon sources.
Brand values remain governed by owner decisions, including O2-O5 and BR-2/BR-5
(2026-09-10). This refresh does not approve a redesign or a Carbon upgrade.

## Authority and locations

All repository paths below are relative to the repository root. Read the
current checkout's `AGENTS.md`, `docs/redesign-v2/DECISIONS.md` section 6
deviations 16/17 and Owner amendments — PR #531 — 2026-09-10, plus the relevant
dated amendment in `docs/redesign-v2/phase5/PHASE5.md`. Keep personal copies
aligned with this repository skill; current source and owner rulings take
precedence over stale guidance. Historical verification is not evidence
of today's browser state or PR status.

`app/styles/brand/megeredchian-law-tokens.css` and its `.json` record express
the brand. Keep component consumers on semantic `--sp-*` aliases. Preserve
vendored Carbon CSS and the matching runtime/Phase 3 `sp-components.css` copies.
Original hand-off assets remain in `docs/brand/`.

## Approved roles

The app has forced light (`data-carbon-theme="white"`), forced dark (`g100`)
and system preference with no explicit attribute. It has no product `g10` theme.
Both dark paths must resolve identically for these roles.

| Role | Light | Explicit and system dark |
| --- | --- | --- |
| Primary fill / hover / active | #B85C2E / #8F4521 / #7A3A1C | Same |
| `--cds-interactive` fill role | #B85C2E | #B85C2E |
| Link / hover | #8F4521 / #7A3A1C | #E8A07A / #F5DDD1 |
| Interactive borders and bars | #B85C2E | #E8A07A (O5) |
| Focus | #B85C2E | #FFFFFF (BR-2) |
| Tertiary base / hover / active | #B85C2E / #8F4521 / #7A3A1C | Carbon white base / #333333 / #393939 |
| Info accent / subtle background | #B85C2E / #FBE8DC | #E8A07A / #262626 (BR-5) |
| Search hit fill / edge | #FBE8DC / #B85C2E | #393939 / #E8A07A |
| Reception locked row | #FBE8DC | #525252; bar inherits apricot |
| Draft mark / badge | Purple 60 #8A3FFC | Purple 40 #BE95FF |

The constant-dark header Draft mark uses purple 40 in both page themes. The
header's zone-specific current-section bar stays terracotta; distinguish it
from theme-aware navigation/menu/Reception bars. Preserve existing focus
geometry, including auth fields' 2px bottom rules. Dark tertiary hosts must
remain neutral so white text and focus remain visible.

The brand file also overrides background-brand and AI roles and includes
direct `--sp-*` overrides for search hits, Draft and Reception. Inspect actual
aliases and painted consumers rather than assuming all product tokens inherit
through the same Carbon role. Preserve warning/error semantics and Draft purple.

## Logo and color constraints

Logo orange #EB7C35 is mark-only, never a UI interaction color. Charcoal #5D5C5B
is `--brand-charcoal`. `public/Logo-Megeredchian-Law.jpg` is the 1206x509 raster
reference, not a UI mark. Use an approved vector source for a flat in-app mark;
do not invent a vector hand-off. Brand tints include #F5DDD1 and #FBE8DC.

Do not introduce IBM blue into product interactive roles or paint an unused
vendored blue token. Blue palette declarations in the unchanged Carbon asset
are not themselves a violation. New brand colors need owner approval; do not
reinterpret generic IBM defaults as permission to change the firm's colors.

## Current Carbon documentation

Context7 library: `/carbon-design-system/carbon` (queried 2026-09-11).
The [Sass theme guide](https://github.com/carbon-design-system/carbon/blob/main/packages/styles/docs/sass.md)
supports custom themes and per-theme component tokens. Rebranding must cover
base, hover, active, focus and surface contrast, not only the primary fill.

[Carbon Next](https://preview.carbondesignsystem.com/carbon-next) is a v12
preview direction. The [flag inventory](https://github.com/carbon-design-system/carbon/blob/main/docs/feature-flags.md)
and [migration guide](https://github.com/carbon-design-system/carbon/blob/main/docs/migration/v12.md)
describe package-specific adoption. Seat Planner currently uses vendored CSS,
not `@carbon/react`; package flags do not update those assets. DTCG data does
not itself require renaming `--cds-*` or `--sp-*`. Consult the repository IBM
skill's `references/carbon-next.md` before a separately authorized migration.

## Verification for brand changes

- Inspect computed roles in forced light, forced dark, system-light and
  system-dark; include rest, hover, active, selected and focused hosts.
- Verify aliases AND the selectors consuming them. A declared tertiary-active
  token has no effect unless the active selector uses it.
- Generate and check product contrast pairs after token changes:

```powershell
node docs/redesign-v2/phase3/contrast/generate-pairs.mjs
python -X utf8 .agents/skills/ibm-design-language/scripts/check_contrast.py --pairs docs/redesign-v2/phase3/contrast/product-pairs.json
```

- Use `tests/brand-resolved-tokens.test.mjs` and the relevant token-layer tests
  to catch painted blue and undeclared exceptions. Text search alone cannot
  establish resolved colors; `rg -ni "0f62fe" app components lib` is a triage aid.
- Report the checker's actual summary and surfaces. White on terracotta was
  measured at 4.56:1, but that does not establish contrast on other hosts.
- Follow `AGENTS.md` for change-specific tests and visual checks at 1920x1080,
  responsive sizes from 320px, and Reception's 480-1055px operational band when
  affected. Preserve the runtime/Phase 3 stylesheet byte equality.
- Reuse passing gate results on an unchanged tree. Documentation-only skill
  edits need diff, reference and skill validation; they do not require an app
  build or a fresh production browser check. Distinguish approval,
  implementation, automated verification and authenticated browser evidence.
