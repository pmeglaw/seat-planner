# Phase 4 · PR 5 captures — Reception + route surfaces (2026-09-06)

_Skeleton — filled at Task 10 (the Docker-stack evidence run). Plan of record:
`../../plans/phase4-pr5-reception.md`._

**What these will show.** Reception on the `.sp-recep` family (PHASE2UX §1R; PHASE3DS §1.29; sheet
amendment E for the 1024 fold); the route cards (`/admin` 403, the 404, the admin / root / global boundaries)
on `.sp-route-card`; `/login` and `/my-seat` byte-compared against `main` (v1.75.0).

**States not drivable on the stack (ct-covered, `tests/reception-screen.test.mjs`):** partial (seats query
failed alone), empty directory, loading, the Reception error boundary, the root boundary (`app/error.tsx`).
`app/global-error.tsx` is captured once by a temporary throw in the root layout (Task 6), reverted before
the commit.

**Source / method / tiers.** _To be written with the run._
