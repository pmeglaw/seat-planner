# Live Walkthrough Checklist — Seat Planner

**For:** Patrick (driving, logged in) · **Companion to:** `docs/ux-review-2026-07-22.md` (§5 = the gaps this closes)
**Goal:** confirm the pixel-level findings a code review can't settle, and produce the evidence that decides whether the Option C marker rebuild is actually needed.

As you go, **paste screenshots back into the Cowork chat** — I'll grade each against the review and update the two scorecards.

---

## 0. Setup & safety (read first)

- **Where:** your logged-in browser. Prod (`seats.megeredchianlaw.com`) is the truest "as users see it." Local (`run-seat-planner`) works too.
- **⚠️ Do NOT click Publish during this walkthrough.** Local dev shares the **production** Supabase — a publish from anywhere is a production publish to 100+ people. Draft edits are viewer-invisible and safe; you'll walk the publish-review dialog and **Cancel** (never confirm), then Undo any test edit.
- **Breakpoints to test each surface at** (browser devtools responsive mode is fine): **Desktop 1440**, **Desktop 1280 with the inspector docked open**, **Tablet 880**, **Mobile ~390**. Screenshot each.
- **Record per step:** Pass / Partial / Fail · a 1–5 "I'm confident I'm in the right place" · screenshot name. Table in §4.
- **Think aloud:** narrate as the real user — "my goal is X, I'd click Y because…, I actually clicked Z, did it do what I expected?"

---

## 1. VIEWER track — the priority (100+ people, mixed devices)

| Step | Do this | Look for / pass criteria |
|---|---|---|
| 1A · First-run (desktop 1440) | Land on `/` cold. Don't touch anything for 10s. | Within 5s, do you know what this is and what to do? Is there anything telling a first-timer "search for your name"? (Expect: no explicit prompt — note if you felt lost.) |
| 1B · Find MY seat | Search your own name (⌘K or the field). | Does it highlight + pan to your seat clearly? Is the match obvious on the map? Confidence 1–5. |
| 1C · Who sits where | Use the People directory (right side). Hover a few names. | Can you browse "who's where" without knowing names in advance? Does hover highlight the seat? |
| 1D · Is this current? | Find the "Updated {date}" pill. | Would a non-technical visitor read it as "this map is current"? Any leftover "Published/Read-only" jargon? |
| 1E · Seat detail | Click a seat while the search Results list is open. | **[LIVE-#10]** Does the light Results panel → **dark inspector** flip feel jarring? Does clicking discard your list? Is there a **"Published seat"** chip (jargon)? Screenshot. |
| 1F · MOBILE (~390) — the big one | Reload `/` at 390px. Try to answer "where does Maria sit?" | **Is the People directory present at all?** (Expect: hidden on mobile.) Can you still find who-sits-where with search only? Rate how hard. Screenshot. |
| 1G · Tablet 880 | View `/` at 880px. | **[LIVE-L2]** Is the office cropped behind horizontal scroll? Wasted vertical space? Screenshot. |

---

## 2. ADMIN track (~11 admins)

| Step | Do this | Look for / pass criteria |
|---|---|---|
| 2A · Orientation | Land on `/admin` fresh. | As a newer admin, is the toolbar legible — do you know where search / publish / undo live? |
| 2B · Assign a seat | Select an open seat → assign someone (draft). | How many steps? Is it obvious the change is **draft, not live**? Confidence. |
| 2C · Add-Seat mode | Start Add-Seat. | **[LIVE-#22]** Does the banner say "custom marker" (jargon)? Are valid placement zones shown on the map, or invisible? Screenshot. |
| 2D · Search + results | Search "a" (short query). | **[LIVE-#24]** How noisy? Is every row carrying its own "Show on map" button? Does it say why each matched? |
| 2E · Cluster by position | In Management, try to group/see employees by **position** (e.g. all Case Managers). | Can you filter/act by position, or only department/zone? (This is the job you flagged.) |
| 2F · Publish comprehension (**#1 probe**) | Make a small draft edit → click the Publish control → open the review dialog → **read the diff** → **Cancel** (do NOT publish) → Undo the edit. | Before publishing, is it crystal-clear what viewers will see change? Is "not live until you publish" unambiguous throughout? Confidence 1–5. |
| 2G · Breakpoints | View `/admin` at **1280 with inspector docked**, then **880**. | See §3. |

---

## 3. The pixel questions that decide Option C ([LIVE-L1/L2/L3])

Do these deliberately — they're what the desk review couldn't settle, and they gate the marker rebuild.

- **L1 · Pill collision at 1280 + inspector docked.** Open the inspector, fit-zoom. Look at the NE / SE / CW pods. **Do pills overlap, truncate, or occlude each other?** Screenshot the worst cluster.
- **L1b · Show-names occlusion.** Turn on Show names (admin). Do expanded name pills fully cover neighbors (e.g. a "Pam" hidden under an expanded pill)? Screenshot.
- **L3 · 880 bottom-sheet.** At 880, select a seat near the bottom. **Does the bottom sheet hide the seat you just selected** (its ring invisible)? Screenshot.
- **L2 · Viewer inspector fill.** Open a seat whose person has no email/extension. Is the dark panel mostly empty, or does it read OK now? Screenshot.

**Decision rule (from review §6):**
- If L1 / L1b / L3 **fail** (pills genuinely collide/occlude at real widths) → the density-adaptive **Option C rebuild is justified**; proceed with the Fable 5 hand-off.
- If they **pass** (the #187 filled/hollow cue + nudges hold up) → Option C is optional polish; **deprioritize it** and spend the effort on the P1 viewer fixes instead.

---

## 4. Record sheet

| # | Step | Result (P/Partial/F) | Confidence 1–5 | Screenshot | Note |
|---|---|---|---|---|---|
| 1A | Viewer first-run | | | | |
| 1B | Find my seat | | | | |
| 1C | Who sits where | | | | |
| 1D | Is this current | | | | |
| 1E | Seat detail / theme flip | | | | |
| 1F | Mobile who-sits-where | | | | |
| 1G | Viewer 880 | | | | |
| 2A | Admin orientation | | | | |
| 2B | Assign seat | | | | |
| 2C | Add-Seat jargon/zones | | | | |
| 2D | Search noise / button wall | | | | |
| 2E | Cluster by position | | | | |
| 2F | Publish comprehension | | | | |
| L1 | Collision 1280-docked | | | | |
| L1b | Show-names occlusion | | | | |
| L3 | 880 bottom-sheet | | | | |
| L2 | Viewer inspector fill | | | | |

---

## 5. After

Paste the screenshots + this table back to me. I'll: fold the results into `ux-review-2026-07-22.md` (turn the [LIVE] items and grades from provisional to confirmed), make the **Option C go/no-go call** per §3's rule, and hand you a final ranked backlog. P1 viewer fixes can start anytime — they don't depend on this.
