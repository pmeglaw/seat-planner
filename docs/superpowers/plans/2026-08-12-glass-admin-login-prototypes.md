# Glass Admin + Login Prototypes (Phases 2–3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the last two concept prototypes in the ratified language — **Ethereal Glass @ #FF7A1F** — as gated pages: `app/concepts/admin-v13/` (editor shell hero: rail, map, inspector, unsaved pill, publish-review dialog) and `app/concepts/login-v13/` (two-step progressive login re-skin, flow rulings frozen).

**Architecture:** Same proven pattern: one client component per page, a glass theme constant derived from viewer-v13's ratified GLASS object, fixture data only. Admin reuses the 60-seat fixture through the production coordinate pipeline. Login is pure client state (no auth calls). Two phases, two branches, two PRs, sequential (spec §6).

**Tech Stack:** Next.js App Router, Tailwind arbitrary values, `next/font/local` (Geist only), `node --test` gate test (auto-discovers each page).

**Spec:** `docs/superpowers/specs/2026-08-12-highend-visual-redesign-concepts-design.md` — §3 Phases 2–3, as amended by §8 rulings: glass wins; accent **#FF7A1F**; Editorial + Soft Structuralism eliminated.

**Standing authorization:** owner (2026-08-12) authorized fixing CI, merging each PR when green, and continuing through prototype completion without per-step approval. Prototypes only — no shipped-surface, token, or promotion changes.

## Global Constraints

- Prototype gate verbatim (copy viewer-v13 `page.tsx` shape exactly): gate string, `notFound()`, `robots: { index: false, follow: false }`. Gate test counts: 7 tests after admin-v13 lands, 8 after login-v13.
- Accent is exactly **#FF7A1F** (rgba form `255,122,31`). No #FF5715, no #FF6B35, no purple/emerald anywhere.
- Glass base: `#050505` page, `#0b0b0d` cores, white/xx hairlines — copy exact class strings from `app/concepts/viewer-v13/ViewerV13.tsx` GLASS where a field exists there; new fields follow the same vocabulary.
- Fonts: Geist only (`../fonts/geist-latin-wght-normal.woff2`, weight `"100 900"`). No Fraunces, no Plus Jakarta Sans on these pages.
- Fixture data only; zero `lib/supabase/*`, zero server actions, zero real auth calls (login page NEVER imports supabase clients or `lib/authMessages` — copy any needed strings as fixture constants). Allowed lib imports (admin only): `@/lib/mapLayoutTransform`, `@/lib/seatMath`.
- Map `<Image>` carries `unoptimized` (pinned: stale `images.localPatterns` rejects the versioned src).
- Animate ONLY transform/opacity; `useReveal`/`Reveal` copied verbatim from viewer-v13; reduced-motion guard intact; no `backdrop-blur` on scrolling content (a blur on the **fixed/modal dialog overlay** IS allowed — that's the sanctioned use); never `border-current/<alpha>` (Tailwind 3 no-op — theme-owned hairlines only).
- Grid/span classes on the outermost grid child (pinned lesson).
- **Login flow rulings FROZEN (spec §2.5):** step 1 = email only + primary "Continue"; step 2 = password + primary "Log in", email shown as an editable summary row (Edit returns to step 1); magic-link action appears ONLY on step 2, below the primary, and as the action inside the failed-login notification; no tabs; no account-existence oracle (any well-formed email advances). Prototype mocks: any password submits to a fake "wrong password" notification state (this demos the error + magic-link placement); no real network.
- A11y: dialog uses `role="dialog"` `aria-modal="true"`, labelled by its heading, Esc closes, focus moves into the dialog on open and returns to the opener on close (simple manual focus management is fine — no library); pill/chip buttons `aria-pressed` where stateful; every interactive element has a visible `focus-visible` ring; inputs have real `<label htmlFor>`.
- No changes to shipped surfaces, tokens, `tailwind.config.ts`, `next.config.js`, `app/actions.ts`, `proxy.ts`; `package.json` untouched. CLAUDE.md: only the concepts enumeration line per phase.
- Env: `npm install` never `npm ci`; hydration warning mentioning `caret-color` is extension noise; `npm run dev` background task "fails" with exit 1 when killed — expected; kill dev servers by port owner (PowerShell `Get-NetTCPConnection`), never `pkill`.
- Verification per task: `npm run typecheck`, `npx eslint <files>`, `node --test tests/concept-gate-source.test.mjs`; full `npm test` before each PR. Controller performs all browser QA — implementers never start the dev server.
- Per-phase close-out (standing authorization): push branch, open PR against main with the phase's PR body, wait for CI, fix failures, merge when green, prune, then start the next phase from fresh main.

---

## Phase A — `app/concepts/admin-v13/` (branch `claude/admin-v13-glass`)

### Task A1: Scaffold — fixture copy, gated route, shell

**Files:**
- Create: `app/concepts/admin-v13/fixtureSeats.ts` (copy of `app/concepts/viewer-v13/fixtureSeats.ts` — verbatim; concepts never import across directories)
- Create: `app/concepts/admin-v13/AdminV13.tsx` (shell: `"use client"`, named export `AdminV13`, placeholder main)
- Create: `app/concepts/admin-v13/page.tsx` — viewer-v13 pattern with metadata title `"Seat Planner · Admin v13 (glass editor concept)"`, description `"Prototype-only mock of the admin editor in the Ethereal Glass language: rail, draft map, inspector, publish review. Static fixture content — no data, no auth, no mutations."`

**Steps:** copy fixture → shell → gated page (byte-exact gate) → `node --test tests/concept-gate-source.test.mjs` expect 7 pass → commit `feat(concepts): scaffold gated admin-v13 route`.

### Task A2: Glass admin chrome — rail, top bar, draft map stage

**Files:**
- Modify: `app/concepts/admin-v13/AdminV13.tsx`

**Interfaces produced (Task A3 consumes):** `ADMIN_GLASS` theme constant with fields: `pageClass`, `backdrop` (two #FF7A1F orbs, viewer-v13 recipe), `railClass`, `railItemClass`, `railItemActiveClass`, `topBarClass`, `eyebrowClass`, `headingClass`, `bodyClass`, `shellClass`, `coreClass`, `markerAssignedClass`, `markerAvailableClass`, `markerSelectedClass`, `pillClass` (status pill), `pillUnsavedClass`, `buttonPrimaryClass`, `buttonGhostClass`, `panelClass` (inspector), `fieldLabelClass`, `dialogOverlayClass`, `dialogClass`, `diffRowClass`. Also `selectedSeatKey: string | null` state + `setSelectedSeatKey`, and the `Reveal`/`useReveal` helpers (copied verbatim).

Binding structure:
- Fixed left rail (`fixed left-0 inset-y-0 w-12`, glass hairline right edge, 4 icon buttons as inline ultra-light SVGs — map/people/settings/sparkle; first active with a #FF7A1F left indicator bar; `aria-label` each). The rail is FIXED (non-scrolling) — a subtle `backdrop-blur` here is allowed.
- Content column offset `pl-12`, top bar: eyebrow "ADMIN V13 — GLASS EDITOR CONCEPT", heading "Draft floor plan.", right side: status pill (Task A3 wires its two states) + primary button "Publish".
- Map stage: double-bezel shell/core, `aspectRatio` from `MAP_IMAGE_WIDTH/HEIGHT`, `Image ... unoptimized`, markers = focusable buttons via `seatsToVisualSeats` + `pointToStyle`; clicking a marker sets `selectedSeatKey`; selected marker gets `markerSelectedClass` (#FF7A1F ring + slight scale via transform class, not layout).
- Draft framing copy near the map: small `bodyClass` line "Draft layer — edits here never reach viewers until publish." (concept honesty, mirrors the real two-layer model).

**Steps:** implement → gates (`typecheck`, eslint file, gate test 7) → commit `feat(concepts): admin-v13 glass chrome — rail, top bar, draft map stage`.

### Task A3: Inspector panel, unsaved pill, publish-review dialog, motion

**Files:**
- Modify: `app/concepts/admin-v13/AdminV13.tsx`

Binding behavior:
- **Inspector:** renders when `selectedSeatKey !== null` as a right-side panel (`panelClass`, glass card ~360px, `md:` fixed right inside content area; below `md` it stacks full-width under the map). Content: eyebrow with seat label + zone; occupant name or "Open seat"; meta rows (position, extension, department — fixture fields, "—" when null); two mock actions: primary "Reassign seat" and ghost "Clear assignment". Clicking EITHER mock action sets `hasUnsavedEdits = true` and closes nothing (visual state demo only — no fixture mutation). Close button (×, `aria-label="Close inspector"`) clears selection and returns focus to the seat's marker button. Panel entry animates transform/opacity (translate-x) with the EASE curve; reduced-motion static.
- **Status pill:** default state `pillClass` "Published · draft in sync". When `hasUnsavedEdits`, swaps to `pillUnsavedClass` (#FF7A1F tinted) "2 unsaved edits · not visible to viewers". It is a `<button aria-pressed={false}>`? No — it is a status `<button>` that OPENS the publish-review dialog when unsaved edits exist (matches real app's pill-opens-review pattern); disabled-looking but focusable info pill otherwise.
- **Publish-review dialog:** opened by the pill (when unsaved) or the "Publish" primary any time. `dialogOverlayClass` = fixed inset-0 `bg-black/70 backdrop-blur-sm` (fixed overlay — sanctioned blur) + centered `dialogClass` glass card. `role="dialog" aria-modal="true" aria-labelledby` heading "Review before publishing". Static diff rows (`diffRowClass`): "W07 — assign Patrick M." / "SE03 — clear assignment" with +/− glyphs tinted #FF7A1F / white/50. Buttons: ghost "Keep editing" (closes) + primary "Publish to viewers" (closes + resets `hasUnsavedEdits` + pill back to sync — mock only). Esc closes; focus moves to the dialog heading container on open and back to the opener on close.
- Entry choreography: Reveal on top bar / map / (inspector uses its own transform entry). Marker hover `hover:scale-110`; buttons `active:scale-[0.98]`.

**Steps:** implement → gates + full `npm test` → commit `feat(concepts): admin-v13 inspector, unsaved pill, publish review — concept complete`.

### Task A4: Controller QA, docs, build, PR, merge

- Controller drives: marker select → inspector opens, focus returns on close; mock action → pill flips to unsaved; pill → dialog (Esc, focus trap, buttons); publish mock resets; both reduced-motion sanity and keyboard pass; screenshots.
- CLAUDE.md enumeration: append `admin-v13`.
- `npm run build` (flag unset — route gated like siblings) + full suite + lint.
- Push, `gh pr create` title `feat(concepts): admin-v13 — glass editor concept (rail, inspector, publish review)`, body: summary (Phase 2 of spec, glass @ #FF7A1F, mock-only interactions, prod impact none) + review ask (drive it, rule promote/iterate/reject for the admin surface language) + standard footer.
- CI watch → fix failures → merge when green (standing authorization) → prune → record ruling slot in spec changelog ("admin-v13 owner ruling: pending — owner drives post-merge").

---

## Phase B — `app/concepts/login-v13/` (branch `claude/login-v13-glass`, off fresh main after Phase A merges)

### Task B1: Scaffold — gated route + shell

**Files:**
- Create: `app/concepts/login-v13/LoginV13.tsx` (shell, named export `LoginV13`)
- Create: `app/concepts/login-v13/page.tsx` — metadata title `"Seat Planner · Login v13 (glass concept)"`, description `"Prototype-only mock of the two-step progressive login in the Ethereal Glass language. Static — no auth, no network."`

Note: `login-v12` already exists as a separate concept — v13 is a NEW directory, do not touch v12. Gate test expects 8 pass after this lands.

**Steps:** shell → gated page → gate test 8 pass → commit `feat(concepts): scaffold gated login-v13 route`.

### Task B2: Glass login — two-step machine, choreography, error state

**Files:**
- Modify: `app/concepts/login-v13/LoginV13.tsx`

Binding structure & behavior:
- Full-viewport glass scene: `min-h-[100dvh] bg-[#050505]`, one #FF7A1F orb upper-left + one low-right (viewer-v13 recipe), centered double-bezel card (`max-w-md w-full`, shell/core from the glass vocabulary), brand eyebrow "SEAT PLANNER" + heading "Log in." (Geist, display scale).
- State machine (plain useState): `step: 1 | 2`, `email: string`, `password: string`, `errorVisible: boolean`.
- **Step 1:** email field (label "Work email", real htmlFor/id) + primary pill button "Continue" (button-in-button ↗ icon, hover physics). Any well-formed email (`/.+@.+\..+/`) advances to step 2; malformed shows inline field hint (no notification). NOTHING else on step 1 — no magic link, no forgot password (frozen ruling).
- **Step 2:** email summary row (glass sub-card: the email text + ghost "Edit" button returning to step 1, preserving input) + password field (label "Password") + primary "Log in". Below the primary, an "or" hairline divider then ghost link-button "Email me a sign-in link instead" (magic-link placement ruling). "Forgot password?" ghost link under that. Submitting ANY password → `errorVisible = true`: notification card above the form (`role="alert"` scoped inside the card — never bare, Next's route announcer trap): "That password didn't match. Try again, or" + inline action "email me a sign-in link." (the ruling's second sanctioned magic-link spot). No account-existence oracle anywhere in copy.
- **Choreography:** step 1→2 transition = outgoing fields translate-y/opacity out, incoming in, 500ms EASE stagger (transform/opacity only; reduced-motion = instant swap). Card entry = single Reveal. Error notification enters with translate-y/opacity.
- A11y: focus moves to the password field on step-2 entry and back to email field on Edit; Enter submits the visible step; all rings visible.

**Steps:** implement → gates + full `npm test` → commit `feat(concepts): login-v13 glass — two-step flow skin, error + magic-link placements`.

### Task B3: Controller QA, docs, build, PR, merge

- Controller drives: step transition both directions (Edit preserves email), wrong-password notification + its magic-link action present, magic link absent on step 1, keyboard-only run-through, reduced-motion, screenshots.
- CLAUDE.md enumeration: append `login-v13`.
- Build proof + full suite + lint → push → PR title `feat(concepts): login-v13 — glass two-step login concept`, body per Phase A shape (Phase 3 of spec; flow rulings frozen, skin only) → CI watch → fix → merge when green → prune.
- Spec changelog: mark Phases 2–3 delivered; owner rulings per surface remain pending until the owner drives them.

---

## Self-Review

1. **Spec coverage:** §3 admin-v13 row (rail/map/inspector; seat-select, publish-review dialog, unsaved pill) → A2/A3. §3 login-v13 row (two-step frozen rulings; transition choreography; failed-login notification; magic-link placement) → B2. §8 rulings (glass, #FF7A1F, one language) → Global Constraints. §2 constraints all present (gate, fixture-only, raster, reduced-motion, a11y incl. dialog semantics, no shipped changes).
2. **Placeholders:** behavior specified to state-variable level everywhere; class-string vocabulary anchored to the committed viewer-v13 GLASS object rather than restated wholesale — deliberate: the executor copies from a file in-repo, which cannot drift the way a plan transcription can.
3. **Type consistency:** ADMIN_GLASS field list matches every A3 usage; login has no cross-task type contract beyond the shell export.
4. **Pinned lessons carried:** unoptimized image; no border-current alpha; spans-on-wrapper; transform/opacity-only; controller-owned QA; route-announcer alert trap called out for the login error state.
