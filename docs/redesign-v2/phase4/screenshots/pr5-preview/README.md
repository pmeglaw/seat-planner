# Phase 4 · PR 5 read-only preview walk (2026-09-07) — PENDING SIGN-IN

**Preview.** https://seat-planner-git-feat-phase4-ec704a-patrick-s-projects-c7baae0c.vercel.app — Vercel
deployment `dpl_HaDH3dsHFCVqYsgEqTh1KidZqEbb` (`seat-planner-pmis4g9cw-patrick-s-projects-c7baae0c.vercel.app`),
READY at commit **`68e8b03`** (branch `feat/phase4-reception`). The preview sits behind Vercel Authentication;
the rig enters through a 23-hour `_vercel_share` link minted with the Vercel MCP on 2026-09-07 (expires
2026-09-08 16:37, bound to this deployment). **Read-only, zero writes:** the preview reads the PRODUCTION
database; Reception is read-only by construction and the walk never presses Save / Publish / Discard / Restore /
Import / Delete; every `Next-Action` POST is logged to `results.json` and the header indicator is compared before
and after.

**Status.** The signed-in walk (`../../audit/pr5-preview-walk.mjs`: Reception rest · typing · locked · the Esc
rungs · a no-extension person · the `?q=201` landing · Show on map → the viewer landing · 1280 · the 1024 fold
with Back to the list · `/admin` · the 404, at 1920 light + dark and 1280 light, people data masked) **has not run
yet: no production account credentials are available on the build box** — the e2e fixture account PR 4's walk
used (`SEAT_PLANNER_E2E_EMAIL` / `_PASSWORD`, then in `.env.local`) is no longer there, and no viewer account
exists for production. It runs unchanged once the owner supplies the fixture credentials (out of band; the rig
takes them as arguments and never writes them anywhere).

**Done without a session (this directory):**

| Capture | Read from the page |
|---|---|
| `09-not-found-light.png` | `/definitely-not-a-route-pr5` → status 404, the route card on `rgb(255,255,255)`, "This page does not exist", the tertiary `rgb(184,92,46)` → `/` |
| `09-not-found-dark.png` | the same, `data-carbon-theme="g100"`, card `rgb(57,57,57)`, tertiary white |
| — | `/reception` signed out → `/login?next=/reception` (200) in both themes |

**People-data mask (for the signed-in run).** The repo is public and the preview shows the live directory, so the
rig injects one stylesheet before every capture: the rows' name / meta / extension cells, the readout's name, role,
numeral, fallback rows and recents, the palette and the pills render as a soft smudge (`-webkit-text-fill-color:
transparent` + `text-shadow`). Text fill only — seat codes, counts, the Floor tag, hints, headings and every measured
colour and geometry are the real thing. `results.json` never records a name (only whether a person with / without
an extension existed and the extension's digit count).
