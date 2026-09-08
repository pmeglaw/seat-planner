# Phase 5 PR 1 — capture provenance

**What:** Management → **Publish history**, the record surface restored as a fourth tab (DECISIONS **D0-a′** /
**D5-e**, 2026-09-08).
**When:** 2026-09-08.
**Branch / head:** `feat/phase5-publish-history`, captured after sheet **amendment H** was revised from the
first capture pass (see *The measurement that changed the sheet* below).
**How:** `node docs/redesign-v2/phase5/audit/pr1-publish-history.mjs http://localhost:3300 <thisDir> e2e-admin@example.test <seeded password>`
— headless Chromium via the repo's own Playwright, real sign-in as the seeded local admin.
**Where from:** the **local Docker Supabase stack** (`npm run db:start`, seeded by the e2e-auth global setup),
with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` passed inline to `next build` / `next start`
on port 3300. `.env.local` was never edited. **Nothing here touched production** — no production read, no
production write, and no production data appears in any image.

## The data in these images is synthetic

The seeded local stack ships **one** publish event, which shows neither pagination nor a spread of Changes
counts. A fixture wrote **30 synthetic rows** into the local `publish_events` table so the captures show the
real states: a full first page, a second page, an unreadable summary (the "—" plus `Initial publish · 60 seats`),
a 41-change publish deliberately placed 12 days back so the Changes sort has to rank *every* page to surface it,
and publishes whose `published_by` is null so the actor fallback reads **"an admin"**.

The names in the images (`e2e-admin@example.test`, `e2e-viewer@example.test`) are the seeded test accounts, not
real people. **No firm data is shown.**

## Files

| File | Frame | What it shows |
|---|---|---|
| `tab-1920-light.png` / `tab-1920-dark.png` | 1920×1080 | The tab at the ruling frame: four tabs, the empty header action area (R1), the ruled subtitle (R2), the live count, the four columns, the default newest-first sort |
| `tab-1024-light.png` / `tab-1024-dark.png` | 1024×768 | The narrow frame: the table keeps its 1216px minimum and scrolls inside `.sp-table-scroll`; the document does not scroll sideways |
| `state-sorted-by-changes-1920-light.png` | 1920×1080 | Changes sorted descending — the 41-change publish reaches page 1 from twelve days back |
| `state-page-2-1920-light.png` | 1920×1080 | Page 2, `26–30 of 30` — pagination in place of D0-g's 25 cap |
| `state-loading-1920-light.png` | 1920×1080 | Four skeleton rows under **real** column headers |
| `state-error-1920-light.png` | 1920×1080 | The inline failure with Retry; the tab strip stays live |
| `state-empty-1920-light.png` / `state-empty-1920-dark.png` | 1920×1080 | The empty log — "Nothing published yet" and a count published at zero |
| `results.json` | — | The rig's 32 checks, the measured column widths per frame, and the console errors |
| `results-empty.json` | — | The empty-state pass, 7 checks |

**Read `state-error-1920-light.png` with one caveat:** the rig produces that state by aborting *every* POST on
the route, which also fails the shell's own `getDraftStatusAction` — hence the header reading "Publish state
unavailable". That is the rig, not a coupling: in the product only the tab's own read has failed, and the
notification says so ("The rest of Management still works").

The empty-state pair was captured by emptying the local `publish_events` table, running the rig with `EMPTY=1`,
and restoring the 30 rows immediately after.

## The measurement that changed the sheet

The first capture pass exposed a real defect and the numbers were changed because of it, not despite it.
Amendment H originally set 13 / 20 / 9 percent with no minimum width. Percentages always fit their container, so
at 1024 the count column fell to **86px** and `text-overflow: ellipsis` ate its **label**, rendering the header
as **"hanges"**; the date column lost its time to "Sep 8, 2026…". Measured on the live table at 14px: the date
needs 190px, the publisher 201px, and Changes **113px — the header, not the number, is the binding constraint**.
Amendment H now reads `min-width: 1216px` with **16 / 17 / 10**, so the narrow frame scrolls the table inside
its container (§1G.5's rule for this page) rather than ellipsing a column label.

Rendered widths after the revision, straight from `results.json`:

| Frame | Table | Published | Published by | Changes | What changed | Sentence rows truncated |
|---|---|---|---|---|---|---|
| 1920 | 1520 | 243 | 258 | 152 | 866 | 0 / 25 |
| 1024 | 1216 | 195 | 207 | 122 | 693 | 0 / 25 |

## Console

Two messages on every page, both the same pair and both expected off Vercel: a 404 for
`/_vercel/speed-insights/script.js` and the MIME refusal that follows it. The same pair is the whole of the
runtime audit's console output. No application error.
