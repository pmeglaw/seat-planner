# Phase 4 · PR 4 captures — Management + Settings (2026-09-05)

**What these show.** The two document pages on the Phase 3 page components (PHASE2UX §1G / §1S; PHASE3DS
§1.22–§1.28): the asset page header with the one primary that follows the tab; Carbon LINE tabs in the
"Management sections" landmark (the terracotta 2px bar through Carbon's interactive-border role); the employees
index on `.cds-table` (toolbar count, ● / ○ status via `SeatMark`, the seat-code link, one ghost Edit per row with
its tooltip); the 480 `layer-02` slide-over (Add · Edit with the fact row and the danger zone · the department
combobox with its create row · the dirty-close ask as the asset modal on top); the departments / zones lists with
Save · Cancel inline rename (editing · duplicate-invalid on blur with the quoted-name helper) and ⋯ holding Delete;
the one-field create modal; the three destructive confirmations as the **narrow tearsheet** (owner ruling
2026-09-05, PHASE4BUILD §1.38 — Deactivate opens over the still-open panel); Settings with the callout, the two
sections in the record's order, the labelled file triggers, an inline refusal before any sheet, the CSV review
(ready · blocked with the row list and the reason above the footer), the snapshot restore review with the D6-e
export-first done-state; the 403 card (a viewer) with its tertiary on the white card; the sticky tab strip pinned
under the 48px header once the pane scrolls (§1.37). Both themes at 1920, the laptop 1280 and the narrow 1024 frame.

**Source.** Branch `feat/phase4-pages` (PR 4), the e2e-auth tier's own `npm run build` (local-stack env inlined)
served by `next start -p 3200` against the **local Docker Supabase stack** (`npm run db:start`; `npx supabase db
reset` + the seed between the e2e-auth tier and the rigs, because the publish-flow spec leaves a published layer the
seed does not tolerate). Signed in as the seeded local admin `e2e-admin@example.test` (the seeded viewer
`e2e-viewer@example.test` for the 403 cards). **No production data and no production write**: every name, seat and
count is `supabase/seed.sql` sample data; nothing the rigs open is confirmed — every sheet and modal is cancelled,
the file pickers receive throwaway buffers, the exports go to the browser's download directory only. `.env.local`
was never edited: the local env was passed to the build and the server process.

**Method.** Playwright `chromium.launch({ channel: "chrome" })`, viewport 1920×1080 (1280×800 / 1024×768 for the
frames; 1920×420 for the pinned-strip proof), device scale 1, after `document.fonts.ready` + 500–800 ms; theme set
by writing `sp-theme` to localStorage and reloading, so the boot script derives `data-theme` / `data-carbon-theme`
exactly as a user's browser would; the system state by clearing it and emulating the OS colour scheme. Two rigs under
`../../audit/`:

- `runtime-audit.mjs` (`runtime/`) — route captures + the undefined-`var()` audit: **0 undefined on 6 routes × 2
  themes**, the two PR routes also at 1280 (both themes) and in the system state light / dark (attrs `null/null`);
  console errors = the Vercel Speed Insights script 404ing under a local `next start`, as every PR.
- `page-states.mjs` (`states/`) — the component states listed above, both themes; the 1280 / 1024 frames; the
  pinned strip; the 403 cards.

**Tiers on the same build.** `npm run test:e2e:auth` **39 passed** (the full tier on the local stack: publish flow,
nav-shell, header geometry incl. the two document pages, page-frames, accessibility with the panel / sheets open,
draft dialogs); unit 1428 · ct 307 · gate (lint 0 errors, typecheck, coverage floors) clean · contrast 202/202 (no
token change).
