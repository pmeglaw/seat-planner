# Phase 4 · PR 4 read-only preview walk (2026-09-05)

**What these show.** The Vercel branch preview of PR 4 (#519) walked end to end without a single write: both
document pages at rest, the row hover and the seat-link colour step, the Edit tooltip on keyboard focus, the
Employees tab focused, the 480 edit panel and its department list (opened by focus, no typing), the Departments
and Zones lists, one inline-rename field with Save · Cancel, one ⋯ menu, the one-field create modal, and the
Settings frame — at 1920×1080 light and dark and at 1280×800 light. `results.json` carries step · frame ·
pass/fail · computed values · captures, plus every server-action POST the browser sent during the walk.

**Source.** Preview https://seat-planner-git-feat-phase4-pages-patrick-s-projects-c7baae0c.vercel.app —
Vercel deployment `dpl_5LPVkdb19v4urHoabWoRM3M7ydrj`, READY at commit **`f4c74ae`** (PR #519, branch
`feat/phase4-pages`). **Read-only.** The preview reads and writes the production database, so the walk
opened every dialog and closed it with Esc / Cancel only; no Save, Add, Rename commit, Delete, Deactivate,
Import, Restore, Publish or Discard; the file pickers were never invoked (the two review sheets need a file and
were not opened). Evidence: the header indicator read **"Draft — no changes"** before the first step and after
the last, and all 18 `Next-Action` POSTs carried the empty argument list `[]` — the shell's draft-status read
on each route load, nothing else.

**Account.** No credentials for the owner's own account exist in the environment; on the owner's ruling
(2026-09-05) the walk signed in as the repo's e2e fixture account (`SEAT_PLANNER_E2E_EMAIL` in `.env.local`),
which holds the admin role in production. The preview sits behind Vercel Authentication; the rig entered
through a 23-hour `_vercel_share` link minted with the Vercel MCP.

**People-data mask.** The repo is public and the preview shows the live directory, so (owner ruling
2026-09-05) the rig injects one stylesheet before every capture: the Name, Position and Extension cells, the
panel's Name / Position / Phone extension / Email fields and the danger-zone reason render as a soft smudge
(`-webkit-text-fill-color: transparent` + `text-shadow`). Text fill only — layout, borders, focus rings, the
seat link and every measured colour are the real thing. Department names, zone names, seat codes and counts are
not people data and are unmasked.

**Method.** `audit/pr4-preview-walk.mjs`: Playwright `chromium.launch({ channel: "chrome" })` (real Chrome),
device scale 1; theme set by writing `sp-theme` to localStorage and reloading; computed values read with
`getComputedStyle` on the live elements; the row hover measured with the pointer on the row away from the
link; the tooltip by keyboard focus (Shift+Tab, Tab onto the Edit button); the tab ring by `focus()`; the
IBM-blue scan over every element on the page for `color`, `background-color`, `border-color`,
`outline-color` and `box-shadow`; navigation counted from `performance.getEntriesByType("navigation")`.

## Captures (36)

| Frame | Files |
|---|---|
| 1920 light | 01-management-rest-light, 01-row-hover-light, 01-edit-tooltip-focus-light, 01-tab-focus-light, 02-panel-edit-light, 02-panel-combobox-light, 03-departments-rest-light, 03-rename-editing-light, 03-overflow-light, 03-zones-rest-light, 03-create-modal-light, 04-settings-rest-light |
| 1920 dark | the same twelve with the `-dark` suffix |
| 1280 light | the same twelve with the `-1280-light` suffix |

## Computed values (identical in every frame unless a theme is named)

| Value | Light | Dark |
|---|---|---|
| `html[data-carbon-theme]` | `white` | `g100` |
| Header primary (Add employee) background | `rgb(184, 92, 46)` | `rgb(184, 92, 46)` |
| Header primary hover | `rgb(143, 69, 33)` | `rgb(143, 69, 33)` |
| Selected tab bar (`box-shadow`) | `rgb(184, 92, 46) 0px -2px 0px 0px inset` | same |
| Focus ring on the Employees tab | `solid 2px rgb(184, 92, 46)`, offset −2px | same |
| Seat link at rest → on row hover | `rgb(143, 69, 33)` → `rgb(122, 58, 28)` | `rgb(232, 160, 122)` → `rgb(245, 221, 209)` |
| Row surface at rest → hover | `rgb(244, 244, 244)` → `rgb(232, 232, 232)` | `rgb(38, 38, 38)` → `rgb(51, 51, 51)` |
| Edit panel (480 wide) surface | `rgb(255, 255, 255)` | `rgb(57, 57, 57)` |
| Settings primary (Import CSV) background | `rgb(184, 92, 46)` | `rgb(184, 92, 46)` |
| IBM blue on any element, either page | none (0 hits) | none (0 hits) |

Geometry and vocabulary: tab strip 40; toolbar count "98 employees · 58 assigned · 40 unassigned"; rows
rendered 38 at 1080 / 30 at 800 (virtualised); panel footer Cancel · Save employee 240 + 240 × 64, no ×, focus
lands on `#management-employee-name`, fact row "Draft seat SE06 · Floor 3 · Open on the map"; department list
opens on focus filtered by the field's value (one option, "Accounting · 2 people"); Esc closes the list, a
second Esc closes the clean panel with no discard ask and focus back on the row's Edit button; departments 15
rows × 48, Rename → field (value selected) + Save (40, primary, disabled while unchanged) · Cancel (ghost), Esc
restores the label with no server call; ⋯ → one `menuitem` "Delete" (`cds-danger`), Esc closes it; zones 8
rows; Add department modal footer Cancel · Add department 240 + 240, primary disabled until a name, Cancel
closes it. Settings: no header button; the callout first, 776 wide, no icon / button / link; CSV row Import
CSV · .csv up to 5 MB (primary) · Export CSV (tertiary) · Download CSV template (ghost) with the columns +
example line; snapshot row Export draft snapshot (primary) · Restore draft snapshot… (tertiary) with ".json up
to 5 MB — a file exported from this page."; **no "Reset" text in the DOM**; both file inputs `tabindex=-1`
`aria-hidden=true` hidden. Indicator "Draft — no changes" on both pages in every frame. Seat code SE06 →
`/admin?seat=SE06` with the inspector open, `navigation` entries 1 before and 1 after browser back to
`/admin/management`.

**Console.** No application errors on either route. Two entries per route are preview-only noise: the Vercel
Toolbar's `vercel.live/_next-live/feedback/feedback.js` refused by the app's CSP (`script-src 'self'
'unsafe-inline'`, `next.config.js`) — absent on production and on the Docker stack. Speed Insights logged
nothing.

## Differences from the Docker-stack smoke (`../pr4-smoke/`)

- **Data scale**: live directory (98 people, 15 departments, 8 zones) instead of the 12-row seed; the table
  virtualises (38 rows rendered at 1080). Every measured colour, size and label matches the smoke.
- **Preview environment**: Vercel Authentication in front (share link), the Vercel Toolbar script blocked by
  CSP (the console noise above), the e2e account instead of the seeded admin. `data-carbon-theme` and every
  token value are the same as on the stack.
- **The department list** was opened by focus, so it shows the one department matching the field's value;
  the smoke typed "Liti" / "Marketing" to show matches and the create row.

## Finding — the Edit tooltip never painted (fixed on the branch: PHASE3DS §1.23 amendment D)

Step 1's "Edit tooltip on focus" measured `display: flex`, `visibility: visible`, width 38 — and the capture
(`01-edit-tooltip-focus-*` of the first walk, superseded below) showed no tooltip. The vendored asset rule
`.cds-table th, .cds-table td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }`
(`carbon-components.css`, the ellipsis for long cells) clips everything positioned outside the cell, and
`.sp-table .cds-col-actions .sp-tooltip` places the tooltip below the cell. The Docker smoke's step 4 asserted
visibility / opacity / width, which a clipped box still passes — its `04-edit-tooltip-*` captures show the same
absence. Only the Management Edit tooltip was affected. **Owner ruling 2026-09-05:** required by §1.23, a defect.
**Fix** (amendment D, both sheet copies): `.sp-table td.cds-col-actions { overflow: visible }`; the last row's
tooltip, which would leave `.sp-table-scroll` (a clipping box in both axes — never `overflow: visible` there,
§1G.5), flips above the button through `data-tooltip-placement="above"`. "Tooltip visible" is now a hit test —
`document.elementFromPoint` at the tooltip's centre is the tooltip (lifting its `pointer-events: none` for the
call) and the box lies inside the viewport — in this rig, the smoke's step 4 and the e2e-auth `page-frames` spec;
jsdom has no layout, so the ct tier pins only the placement attribute.
