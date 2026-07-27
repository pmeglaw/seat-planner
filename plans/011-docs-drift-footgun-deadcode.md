# Plan 011: Doc-drift + prod-DB footgun warning + dead-code removal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 670dc8a..HEAD -- README.md CLAUDE.md lib/permissions.ts tests/permissions.test.mjs docs/DESIGN_DIRECTION.md docs/ux-review-2026-07-22.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (docs + one dead-code deletion; no runtime/product logic changes)
- **Depends on**: none
- **Category**: docs / tech-debt
- **Planned at**: commit `670dc8a`, 2026-07-24

## Why this matters

The repo's onboarding docs — which the CLAUDE.md/AGENTS.md workflow feeds to AI contributors as ground truth — are actively wrong in ways that mislead. The single worst: **nothing in README or CLAUDE.md warns that local dev writes to PRODUCTION** (the fact lives only in a skill file), so a contributor following the README can publish from localhost and change the live map for 100+ viewers thinking it's a sandbox. Alongside that, the docs claim "Next.js 15" (it's 16), claim a dead `lib/permissions.ts` module is "used in components" (zero callers), and `DESIGN_DIRECTION.md` freezes a UI that has since been deliberately changed. This plan fixes the drift and removes the one clean piece of dead code, so the docs stop lying.

## Current state

- **`README.md:9`** — `Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · Supabase …` — it's actually Next 16 (`package.json` `"next": "^16.2.11"`).
- **`README.md`** "Getting started" (~`:11-17`) tells a newcomer `cp .env.local.example .env.local # then fill in your Supabase values`, implying a personal/sandbox project — with **no warning that this points at prod**. The authoritative warning (verbatim from `.claude/skills/run-seat-planner/SKILL.md`): *local dev's `NEXT_PUBLIC_SUPABASE_URL` points at the **production** Supabase project — the only one that exists, no dev/staging DB. Draft-layer edits are safe (viewers never read `layer='draft'`); **publishing is not** — `publish_seat_map()` updates the live map at seats.megeredchianlaw.com for 100+ viewers. Treat any local publish as a production deploy.*
- **`CLAUDE.md:46`** — "…`lib/permissions.ts` (`isAdmin`/`assertAdmin`) is the pure-function version used in components/tests." A repo-wide grep finds **zero** component/action callers of `lib/permissions.ts`; the real predicate is inlined in `requireAdmin()` (`app/actions.ts:41`, `profile?.role !== "admin"`) and `getAdminPageContext()` (`lib/adminPageGuard.ts:24`). The only importer is `tests/permissions.test.mjs` (whose own header comment `:5-6` repeats the false "used by components and by `assertAdmin` call sites" claim — `assertAdmin` has no call site anywhere but that test).
- **`lib/permissions.ts`** — exports `isAdmin(profile)` and `assertAdmin(profile)`; dead in production. **`tests/permissions.test.mjs`** — imports and tests them; the only consumer.
- **`docs/DESIGN_DIRECTION.md`** — `§3` (~`:63-68`) claims "A **slim 48px** dark bar … every full-height item tracks this number." The shipped bar is **36px** (`components/seat-map/SeatMap.tsx` renders the header `className="… h-9 …"`, and PRs #216/#221 slimmed it 48→40→36). `§5` (~`:99`) says the seat pills "must ship **pixel-identical** … Do **not** restyle `SeatMarker`" — but `SeatMarker` was deliberately restyled across ~7 merged PRs since (capsule pills, door-plate nameplates, short names). The genuinely-frozen contract is the marker's **anchor/calibration** (`pointToStyle({x,y})` unchanged; calibration constants untouched — guarded by `tests/desktop-seat-marker-system-source.test.mjs`), NOT its appearance.
- **`docs/ux-review-2026-07-22.md`** — lists as open P1 "V1" (viewer "Published seat" jargon) and "V2" (People directory desktop-only on mobile). Both **shipped**: `components/seat-map/ViewerSeatFinder.tsx` renders only `Updated {date}` (no "Published" chip) and gates a `mobileDirectorySheetOpen` sheet (PR #206).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (`npm install`, not `npm ci`, on the maintainer's Windows box) |
| Tests | `npm test` | all pass. Deleting `tests/permissions.test.mjs` drops the count by its ~3 tests (from ~499 to ~496); that's expected, not a regression |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | 0 errors |

## Scope

**In scope** (modify/delete only these):
- `README.md` (Next version + prod-DB warning)
- `CLAUDE.md` (permissions.ts sentence + a prod-DB warning line)
- `lib/permissions.ts` (DELETE)
- `tests/permissions.test.mjs` (DELETE)
- `docs/DESIGN_DIRECTION.md` (correct §3 bar height + §5 restyle clause)
- `docs/ux-review-2026-07-22.md` (dated status header marking V1/V2 shipped)

**Out of scope** (do NOT touch):
- `app/actions.ts` / `lib/adminPageGuard.ts` — do NOT wire them through `isAdmin`; this plan DELETES the dead module, it does not rehome the predicate. (Wiring was the alternative resolution; the operator chose removal.)
- Any product code, migration, or test other than the deleted `permissions.test.mjs`.
- The `docs/ui/seat-planner-shell.html` prototype and other UX docs not listed — leave them; this plan fixes the highest-drift two docs only.

## Git workflow

- Branch: `advisor/011-docs-drift-footgun-deadcode`
- Commit style: conventional (e.g. `docs: warn local dev writes to prod, fix version/permissions drift; remove dead lib/permissions`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: README — version + the prod-DB footgun warning

In `README.md`: change `Next.js 15` (`:9`) to `Next.js 16` (or drop the number — match how you'd want it maintained). Then add a prominent warning block in "Getting started" (right where it says to copy `.env.local`), using the authoritative content quoted in Current state — a blockquote like:

```markdown
> ⚠️ **Local dev writes to PRODUCTION.** `.env.local` points
> `NEXT_PUBLIC_SUPABASE_URL` at the live Supabase project — there is no dev or
> staging database. Draft-layer seat edits are safe (viewers only ever read
> published data), but **Publish updates the live map for real viewers** —
> treat any local publish as a production deploy.
```

**Verify**: `grep -c "Next.js 15" README.md` → 0; `grep -c "writes to PRODUCTION" README.md` → 1.

### Step 2: CLAUDE.md — fix the permissions claim + add the prod-DB note

In `CLAUDE.md:46`, remove the false clause. Since `lib/permissions.ts` is being deleted, the sentence should stop referencing it entirely — e.g. end the sentence at "…against the authenticated Supabase user." (drop "`lib/permissions.ts` (`isAdmin`/`assertAdmin`) is the pure-function version used in components/tests."). Add a one-line prod-DB warning near the Commands/env section mirroring the README block (so an agent reading CLAUDE.md sees it too).

**Verify**: `grep -c "permissions.ts" CLAUDE.md` → 0.

### Step 3: Delete the dead module + its test

`git rm lib/permissions.ts tests/permissions.test.mjs`. Confirm nothing else references them: `grep -rn "lib/permissions\|from.*permissions" app lib components tests --include="*.ts" --include="*.tsx" --include="*.mjs"` → no matches (the only references were the deleted files).

**Verify**: `npm test` → passes (count drops by the deleted test's cases); `npm run typecheck` → exit 0.

### Step 4: DESIGN_DIRECTION.md corrections

In `docs/DESIGN_DIRECTION.md`: in §3, change the "48px" bar claim to 36px with a one-line note that #216/#221 slimmed it. In §5, replace "pixel-identical / do not restyle SeatMarker" with the accurate frozen contract: *the marker's appearance is owner-directed and has evolved; what is frozen is the anchor + calibration (`pointToStyle({x: seat.x, y: seat.y})` and the calibration constants, guarded by `tests/desktop-seat-marker-system-source.test.mjs`) — not the pills' look.* Keep any still-accurate parts (e.g. the cream-floor contrast measurement). Add a one-line note that `app/concepts/map-redesign` prototypes a superseded direction.

**Verify**: `grep -c "48px" docs/DESIGN_DIRECTION.md` → 0 (or only in a "was 48px" historical note); the §5 "pixel-identical" absolute is gone.

### Step 5: ux-review-2026-07-22.md status header

At the top of `docs/ux-review-2026-07-22.md`, add a dated status banner: *Status as of #245 (2026-07): V1 (viewer "Published seat" jargon) and V2 (mobile People directory) are SHIPPED; the §2 scorecards predate the #216–#245 redesign. Surviving open items remain below.* Optionally strike the V1/V2 lines. Do not rewrite the whole doc — a header + the two shipped items is enough.

**Verify**: `grep -ci "shipped" docs/ux-review-2026-07-22.md` ≥ 1.

### Step 6: Full gate

**Verify**: `npm test`, `npm run typecheck`, `npm run lint` (0 errors) → all pass.

## Test plan

- No new tests — this is docs + a dead-code deletion. The safety net is that `npm test` / `npm run typecheck` still pass after removing `lib/permissions.ts` (proving nothing depended on it) and that `require-admin-guard-source.test.mjs` still passes (the real admin gate is untouched).
- Verification: the per-step greps + the full gate.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "Next.js 15" README.md` → 0; `grep -c "writes to PRODUCTION" README.md` → ≥ 1
- [ ] `grep -c "permissions.ts" CLAUDE.md` → 0
- [ ] `lib/permissions.ts` and `tests/permissions.test.mjs` no longer exist (`git status` shows them deleted)
- [ ] `grep -rn "lib/permissions" app lib components tests` → no matches
- [ ] `npm test`, `npm run typecheck`, `npm run lint` (0 errors) all pass
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The grep in Step 3 finds a runtime importer of `lib/permissions.ts` (there should be none) — deleting would break it; report instead.
- `npm test` fails after the deletion for any reason other than the expected lower count — that means something did depend on the module.
- `require-admin-guard-source.test.mjs` or any `*-source.test.mjs` fails — the deletion or a doc edit crossed a guardrail; report.
- A DESIGN_DIRECTION.md/ux-review edit would require verifying a claim you can't confirm against HEAD — mark it and move on rather than asserting something unverified.

## Maintenance notes

- The prod-DB warning is the highest-value line here; keep it prominent through future README rewrites.
- Reviewers should scrutinize: that the `CLAUDE.md` security-boundary section still reads correctly after dropping the permissions.ts clause (the three-layer model description must stay intact), and that no `*-source.test.mjs` guardrail tripped.
- Deferred (recorded in `plans/README.md`): the "wire the admin predicate through one shared function" option was NOT taken (removal was chosen); if a future change wants a single shared `isAdmin`, re-add it and route `requireAdmin`/`getAdminPageContext` through it. Other doc drift (magic-link-auth.md, the critique-top8 plan, carbon-shell brief) is left for a later pass.
