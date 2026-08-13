# High-End Visual Redesign — Concept Prototypes (Design Spec)

**Date:** 2026-08-12
**Status:** Approved by owner (path, fidelity, direction, and sections S1–S5 confirmed in session)
**Driver:** First real exercise of the `high-end-visual-design` skill (re-enabled 2026-08-12) against the three core surfaces: admin editor, viewer, login.

## 1. Goal and non-goals

**Goal.** Produce four gated prototype pages under `app/concepts/` that let the owner judge — in a real browser, against real geometry — whether the high-end-visual-design language (or which of its archetypes) should replace or influence the shipped Carbon v12 look on each surface.

**Non-goals.**
- No production surface changes. `/`, `/admin`, `/login`, `/reception` are untouched.
- No `app/globals.css` token changes, no `tailwind.config.ts` palette changes.
- No promotion work. Promoting a winning prototype to a real surface is a separate future project per surface, each with its own spec.
- No purchase of commercial fonts (`PP Editorial New` is paid; free OFL substitutes are used).

**Decision context (owner-confirmed in session).**
- Prototype-concepts-first was chosen over wholesale replacement or v12-evolution.
- Fidelity: hero states + key interactions (map-redesign precedent), not full replicas, not static screens.
- Direction: style sampler first; the three full prototypes are built only in the winning archetype.
- One coherent visual language across all three surfaces (the skill's "variance mandate" applies between projects, not within one app).

## 2. Constraints carried in from the repo

These are binding on every prototype page:

1. **Gate:** each `page.tsx` copies the existing 23-line pattern — local `prototypesEnabled()` returning 404 unless `SEAT_PLANNER_ENABLE_PROTOTYPES=true`, plus the belt-and-suspenders comment block. Flag must be set at build time to reach pages via `npm run start`; dev works with a runtime flag.
2. **Data isolation:** fixture data only. Zero imports from `lib/supabase/*`, zero server actions, no reads of live or published tables. Client components throughout (below the gate).
3. **Raster constraint:** the floor plan stays the shipped webp (`MAP_IMAGE_SRC` from `lib/mapLayoutTransform.ts`). No SVG floor plan, no re-render of the asset for this project.
4. **Fonts are vendored:** no `next/font/google`. New fonts land in a shared `app/concepts/fonts/` directory with a README (provenance + refresh recipe) and license files, mirroring `app/fonts/` and the component-state-board precedent. Loaded via `next/font/local` with explicit `weight` ranges (see the variable-font gotcha documented in `ComponentStateBoard.tsx`).
5. **Login flow rulings are frozen:** the login prototype restyles the *skin* of the two-step progressive login only. Email-only step 1; password disclosed on step 2 with the email as an editable summary row; magic link appears only on step 2 (below the primary action, and as the action inside a failed-login notification); no account-existence oracle; no tabs.
6. **Accessibility floor:** keyboard operability, visible focus, and dialog semantics are kept even in prototypes. Every entry/scroll animation and blur transition is wrapped in a `prefers-reduced-motion` guard (the skill omits this; the repo does not).
7. **Skill's own perf guardrails enforced:** animate only `transform`/`opacity`; `backdrop-blur` only on fixed/sticky elements — never over the scrolling/pannable map area; noise overlays only on fixed `pointer-events-none` elements.

## 3. Deliverables

### Phase 0 — `app/concepts/design-sampler/`

A single page (~400 lines) presenting the three skill archetypes side by side, each rendering the **same component set** so comparison is apples-to-apples:

- Type specimen: eyebrow tag + display heading + body text.
- Seat-pill cluster over a cropped region of the real map webp.
- Employee card built with the double-bezel (nested outer shell / inner core) technique.
- Primary CTA pill with the button-in-button trailing icon and hover physics.
- Login email field + label.
- Staggered-reveal motion demo (respecting reduced motion).

Archetypes rendered:
1. **Ethereal Glass** — OLED black, mesh-gradient orbs, glass cards, hairlines, wide grotesk.
2. **Editorial Luxury** — warm cream/espresso, high-contrast serif display, film-grain overlay.
3. **Soft Structuralism** — white/silver, massive bold grotesk, diffused floating shadows.

**Fonts vendored for the sampler** (all SIL OFL, license files committed):
- Geist + Geist Mono (grotesk arm)
- Fraunces (variable, high-contrast serif arm; Instrument Serif is the fallback candidate if Fraunces disappoints in browser)
- Plus Jakarta Sans (soft grotesk arm)

**Exit criterion:** owner drives the page live (run-seat-planner skill) and picks the winning archetype. That ruling is recorded in this spec's changelog section before Phase 1 starts.

### Phases 1–3 — hero prototypes in the winning language

Built sequentially, one PR each, so each build absorbs the owner's rulings on the previous one. Target ~1,500–1,800 lines each (map-redesign precedent), fixture data modeled on `app/concepts/map-redesign/fixtureSeats.ts`.

| Page | Hero state | Live interactions |
|------|-----------|-------------------|
| `app/concepts/viewer-v13/` | Full map with seat pills, filter chips, find-palette affordance | Seat hover/focus physics; chip filtering over fixture data; page-entry choreography |
| `app/concepts/admin-v13/` | Editor shell: rail, map, inspector panel | Seat select → inspector opens; publish-review dialog opens (static diff content); unsaved-edits pill state |
| `app/concepts/login-v13/` | Two-step progressive login (flow rulings frozen, §2.5) | Step 1 → 2 transition choreography; failed-login notification state; magic-link placement per ruling |

Naming note: `-v13` continues the `login-v12` precedent; owner may rename at review.

**Exit criterion per page:** owner reviews live and rules promote / iterate / reject. Rulings recorded in the changelog section. Promotion itself is out of scope (§1).

## 4. Architecture

- Each concept = `page.tsx` (gate, ~23 lines) + one self-contained client component + optional `fixture*.ts`, exactly like the three existing concepts. No shared "concept framework" is extracted — YAGNI; three throwaway-candidate pages don't earn an abstraction.
- Shared only: `app/concepts/fonts/` (files + README + licenses). Font `localFont` declarations are duplicated per page on purpose — pages must stay independently deletable.
- No changes to `AppShell`, the `(shell)` route group, `proxy.ts` matcher, or any test-pinned surface. Concept routes are outside the middleware allowlist and stay there.

## 5. Testing

- `npm test` stays green. The source-scanning tiers already tolerate `app/concepts/` (three concepts exist); if any source test trips on new prototype code, that is a real guardrail crossing to fix in the prototype, not a test to loosen.
- New source test `tests/concept-gate-source.test.mjs` (none exists today — only `.coderabbit.yaml` mentions the gate): asserts every `app/concepts/*/page.tsx` contains the `prototypesEnabled()` gate and the 404 path. Pins the three existing concepts plus each new one as it lands (sampler PR introduces the test).
- Visual verification is manual and owner-driven by design (design-QA loop: critique by driving the live app). Build + typecheck + tests are not visual verification.

## 6. Process

- Branch: `claude/highend-visual-concepts` off `main` (created). One PR per phase: sampler → viewer-v13 → admin-v13 → login-v13.
- This spec is committed with the sampler PR branch and updated with a changelog entry after each owner ruling.
- Review loop per phase: build → `npm run dev` with the prototypes flag → owner drives → ruling → next phase.

## 7. Risks / open items

- **Archetype vs. floor plan:** the shipped webp is a light-toned raster. Ethereal Glass may fight it; the sampler's map-crop component exists precisely to expose this before any full build.
- **Fraunces vs. Instrument Serif:** decided at sampler review, in browser, not on paper.
- **Skill prescriptions vs. usability:** the skill optimizes for marketing-page drama (py-40 sections, entry blur). Admin is a dense working tool; prototypes may deliberately scale down macro-whitespace where density is functional. Deviations are noted in-page so the owner judges them consciously.
- **Accent color:** #FF5715 was a v12 ruling, not a global law. Sampler archetypes use each archetype's native palette; accent survival is part of the owner's sampler ruling. (Previously rejected directions — orange/navy pairing, Ember palette — are not re-proposed.)

## 8. Changelog

- 2026-08-12 — Spec approved (S1–S5) in session; branch created.
- 2026-08-12 — Sampler ruling (owner, live review): **Soft Structuralism eliminated.** Finalists: **Ethereal Glass** (to be re-cut with the brand orange #FF5715 replacing the purple/emerald glow) and **Editorial Luxury**. Phase 1 amended: instead of one viewer-v13 language, build the viewer hero as **one page with a theme toggle** between the two finalists (`app/concepts/viewer-v13/`). The runoff winner becomes the language for the remaining Phase 2–3 prototypes (admin, login).
- 2026-08-12 — viewer-v13 runoff ruling (owner, live review): **Ethereal Glass wins.** Editorial Luxury eliminated. Phases 2–3 (admin-v13, login-v13) build in the glass language. Additionally the owner authorized **changing the brand orange itself** if a better one fits the glass look ("I am willing to change the brand orange to a better orange") — candidate **#FF6B35** (warmer, less red-lean on OLED black) is applied to the runoff page for live ratification against the v12 #FF5715. The ratified value becomes the accent for Phases 2–3; any change to the SHIPPED app's brand tokens remains a promotion-time decision.
- 2026-08-12 — glass accent ruling (owner, live ladder #FF5715 → #FF6B35 → #FF7A1F): **#FF7A1F ratified.** This is the accent for the Phase 2–3 glass prototypes. The shipped app's brand tokens are unchanged; adopting #FF7A1F app-wide is a promotion-time decision.
- admin-v13 ruling: _pending_.
- login-v13 ruling: _pending_.
