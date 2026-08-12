# Handoff bundle: Login on Carbon v12 (options 2a–2d)

The design source for the progressive-auth login shipped in
`app/login/page.tsx` + `components/auth/LoginForm.tsx`.

| File | What it is |
| --- | --- |
| `Login 2a Handoff.md` | Step 1 spec — split screen, fluid email field, remember-email, Continue. Carries the owner edit that removed alternate logins from step 1. |
| `Viewer v12 Handoff.md` | The viewer Find-palette pass. **§ Login** (added later the same day) is the part this branch implements: step 2, error handling, magic-link placement. The palette sections are NOT built yet. |
| `Viewer v12 Redesign.dc.html` | The canvas. Login options are `#2a` (step 1), `#2b` (step 2), `#2c` (error states), `#2d` (centered light alternative — not built; 2a/2b split-screen is the default). Options `1a–1f` are the viewer palette, `3a–3e` unrelated. |

## Asset paths do not resolve from here

Same caveat as `docs/design_handoff_carbon_v12/` — the `.dc.html` references
(`docs/design_handoff_carbon_v12/public/images/…`, `shared/seats.js`,
`./support.js`) are written **repo-root-relative** for the workspace they were
authored in, so opening the file from this directory renders the layout with
broken images and no interactivity. The static option cards (`#2a`–`#2d`) are
inline styles and read fine regardless — that is all the login work needed.

`support.js` and the rest of the original bundle are deliberately untracked
(`.gitignore`); they duplicate repo source under an `ibm-carbon-v12-seats-viewer/project/`
tree, which would shadow the real files in every search.

## What shipped, and what did not

Built: 2a, 2b, 2c. Verified at 1440×900 — screenshots land in `output/playwright/`
(gitignored) via the `run-seat-planner` skill.

Not built, and still open questions for the owner:

- **2d** (centered light layout) — only wanted if the chrome default flips light.
- The viewer Find palette (`1a–1f`) and the light-chrome token set.
- `Viewer v12 Handoff.md` open questions 1–4 are untouched by this branch.

Three deviations from the drawings, all deliberate and commented at the call site
in `LoginForm.tsx`:

0. **The "or" divider label and the field placeholders do not use the mock's
   `#8E8276`** — it measures 3.75:1 on white and fails AA at 11px. They take
   `--admin-text-muted` (#6E655A, 5.7:1 on white / 5.2:1 on the field fill)
   instead. Same call `app/concepts/login-v12` made about its footer line. The
   step-2 axe scan in `tests/e2e/accessibility.spec.ts` is what caught it.


1. **Focus after a failed password goes to the password field**, not the email.
   2c was drawn single-step; on 2b the email is a summary row, not a field.
2. **Two annotation lines were not shipped as user copy** — "The same message for
   either mistake…" in the notification, and "No 'wrong email' error until Log in
   is pressed…" at 2b's bottom. Step 1's help line runs on both steps instead,
   which is what the spec's "spatial rhythm identical across steps" asks for.
