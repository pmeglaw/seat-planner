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

Not built:

- **2d** (centered light layout) — only wanted if the chrome default flips light,
  and it does not (see answer 1 below).
- The viewer Find palette (`1a–1f`) and the light-chrome token set.

## Viewer palette — owner answers (2026-08-11)

`Viewer v12 Handoff.md` ends with four open questions marked *ask, don't guess*.
Answered; do not re-ask.

**The number that governs all of them:** the real employee directory has **not
been loaded yet**. Production today shows 16 people on 68 seats (22% filled),
and that is placeholder. At launch the map will be **≥90% filled** — roughly 61+
occupied seats, ~7 open. Design for that shape, not for what a live query
returns today. See also the `production-vs-local-data-scale` memory note.

1. **Chrome default: dark, and reuse the existing pref.** Dark stays the shipped
   default. Light/dark rides `lib/theme.ts` (`sp-theme`) — the mechanism
   Reception's toggle already uses, with the FOUC guard in `app/layout.tsx:45`.
   Do **not** add the handoff's separate `chromeTheme` key: it would be a second
   theme pref and a second FOUC guard for the same user-visible choice.

2. **Facets: status and department become chips; position is dropped.**
   - **Status** is the only facet that cannot be replaced by typing. Search
     already matches status text (`lib/viewerSeatSearch.ts:253`), but a query is
     transient — INV-1 hands the surface back — whereas at 90% fill you want the
     map *held* on the ~7 free desks while you look around.
   - **Department** pins a team's area and is low-cardinality: the owner
     confirms **2–6 departments** in the real directory, so a flat chip row
     beside the zone chips fits.
   - **Position** is dropped as a filter. Search matches it already
     (`lib/viewerSeatSearch.ts:244`) and contract #3 puts it in every row's
     `SEAT · position` subtitle, so nothing becomes unfindable — it is just no
     longer pinnable, which is the rarest of the three needs and the highest
     cardinality (14 distinct values across 16 placeholder people).

   Open design refinement inside this answer: at 90% fill an **Occupied** chip
   selects ~61 of 68 seats and says almost nothing. A single **Open** toggle is
   probably the honest control rather than an Open/Occupied pair — decide when
   building slice 3, and screenshot both.

3. **Mobile (<900px): same content, not trimmed.** At 61+ people the A→Z list
   needs scrolling on desktop too, and the existing virtualized-directory
   windowing already handles it — it has looked dormant only because prod holds
   16 people. Trimming would cost phone users zone browsing, which is the most
   useful thing on an unfamiliar floor, and would add a second layout to keep in
   sync.

4. **Dead key: removed outright, no migration, no cleanup sweep.**
   `seat-planner:viewer-directory-collapsed` is read in exactly two places —
   four sites in `ViewerSeatFinder.tsx` and one assertion at
   `tests/viewer-directory-source.test.mjs:32`. It stores whether a panel that
   will no longer exist was collapsed, and the palette has no collapsed state to
   migrate it to. Values already sitting in browsers are inert; a mount-time
   sweep would mean carrying cleanup code forever for one dead boolean.

**Implementation note that falls out of the ≥90% figure:** the virtualized
directory (`tests/virtualized-directory.test.mjs`) stops being dormant at launch
scale. The palette must keep the windowing hook, and any perf check of it should
be run against a seeded 61+ directory rather than against production.

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
