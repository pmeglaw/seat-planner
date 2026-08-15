# Handoff: Seat Planner Login (design 1e, Carbon v12 direction)

## Overview
A redesigned login screen for the Megeredchian Law Seat Planner (`/login`), restyled on IBM Carbon Design System foundations with the Carbon v12 ("Carbon Next") direction: strong single-primary hierarchy, Carbon **fluid** form inputs, and restrained motion. Split layout: dark brand panel (left) with a faded floor-plan graphic, and the sign-in form (right). Auth model is unchanged from the current app: email/password primary, magic-link fallback (`components/auth/LoginForm.tsx`).

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing intended look and behavior, **not production code to copy directly**. The task is to **recreate this design in the existing codebase**: Next.js 16 (App Router) + React 19 + Tailwind CSS 3, replacing the visuals of `components/auth/LoginForm.tsx` / `app/login/page.tsx` while keeping their existing auth logic, server actions, validation, and accessibility contracts intact. Open `Login 1e.dc.html` in a browser to see the reference (it needs the sibling `support.js`, `fonts/`, and `images/` folders).

## Fidelity
**High-fidelity.** Colors, typography, spacing, and states are final. Recreate pixel-perfectly with Tailwind utilities / CSS variables per the app's conventions.

## Screens / Views

### Login (desktop, 1440×900 reference; layout is fluid)
Two panes in a flex row filling the viewport:

**Left brand panel** — `flex: 1.2`, background `#161616` (always dark, both themes), padding `48px`, flex column:
- Top: brand row — mark `images/megeredchian-mark.png` at 24–32px + "Megeredchian Law", 14px / 600, white `#f4f4f4`.
- Middle (vertically centered): floor-plan graphic `images/office-floor-plan.webp`, width 620px (max-width 100%), `opacity: .16`, `filter: invert(1)`, radial mask fading edges: `mask-image: radial-gradient(85% 85% at 50% 50%, #000 55%, transparent 100%)`. Overlaid story details: a 10px copper dot (`#B85207`, 3px halo `rgba(184,82,7,.35)`, 2.4s pulse) at ~37%/62%, a 7px outlined dot (`1.5px solid #6f6f6f`) at ~34%/44%, and a mono label "C05" (9px / 600, `#8d8d8d`, letter-spacing .4px) at ~39%/56%.
- Bottom text block (max-width 520px):
  - Copper rule: 48×3px `#B85207`, 24px below it the title.
  - H1 "Seat Planner" — IBM Plex Sans 42px / 1.2, weight 300.
  - Tagline (verbatim): "The internal seating map — who sits where, across every floor we occupy." — 15px / 1.55, `#c6c6c6`, line break after "who sits where,".
  - Status line: 6px green dot `#42be65` + `seats.megeredchianlaw.com · Published <date>` — IBM Plex Mono 11px, `#8d8d8d`; the date is the real last-publish date the app already computes.

**Right form pane** — `flex: 1`, background `--bg`, form column 368px centered (grid place-items center):
- H2 "Log in" — Plex Sans 28px / 1.25, weight 400, `--t1`.
- Helper: "Use your firm email. Viewers see the published map; admins can edit the draft." — 12.5px / 1.5, `--t2`, 24px below.
- **Fluid inputs** (Carbon fluid text input, stacked flush, no gap):
  - Container: background `--field`, padding `9px 16px 10px`; label inside, 11px `--t2`; value 13.5px `--t1`, 4px under label. Hover: background `--hov`.
  - Email: bottom border `1px solid --bs` (acts as the divider between the two fields).
  - Password (focused state shown): bottom border `2px solid #B85207`; value letter-spacing 2px with a 1×14px copper caret; eye toggle right — 32×32 hit target, 15px stroke icon, `--t2`, hover `--hov`.
- Meta row, 8px below fields, 11px: left "Passwords are at least 12 characters." (`--t3`); right "Forgot password?" link (`--link`).
- Primary button, 24px below: full-width, **48px tall, sharp corners**, background `#B85207` (hover `#9F4605`), white text 13.5px / 500, label left + arrow icon right (space-between, 16px padding) — Carbon button anatomy. Label: "Log in".
- Divider: hairline–"or"–hairline, 11px `--t3`, 22px margins.
- Secondary button: full-width 48px, `1px solid --bstrong`, text `--t1` 13px left + mail icon right, hover `--hov`. Label: "Email me a magic link".
- Footer note, 22px below, 11px / 1.5 `--t3`: "Trouble signing in? Contact the office administrator — accounts are provisioned by the firm." ("Contact the office administrator" is a link, `--link`.)

## Interactions & Behavior
- Form entrance: rise-in `opacity 0→1, translateY(8px)→0`, 500ms, easing `cubic-bezier(0, 0, .38, .9)` (Carbon entrance curve). Left-panel dot pulses on a 2.4s loop. Respect `prefers-reduced-motion`.
- Submit → existing email/password server action; on pending, primary button shows the app's existing loading spinner treatment and disables.
- "Email me a magic link" → existing magic-link flow (`/auth/confirm`); "Forgot password?" → existing reset flow (`/auth/update-password`).
- Validation: keep existing rules (min password length 12; auth error messages from `lib/authMessages.ts` rendered as an inline error notification above the fields — `--err` left border, tinted background).
- Focus: keep the app's `focus-visible` ring contract on every interactive element; the fluid field's focused state is the 2px copper bottom border.
- Hover states as listed per element (fields `--hov`, primary `--accH`, secondary `--hov`).
- Responsive: below ~900px width, stack — brand panel becomes a compact header (mark + wordmark + title), form pane full-width; form column stays ≤368px.

## State Management
- `email`, `password`, `showPassword`, `pending`, `authError` — all already exist in `LoginForm.tsx`; no new state is required. Mode toggle (password vs magic link) may remain as currently implemented; the reference shows both affordances on one surface.

## Design Tokens
Light theme ("Light / G10"):
- `--bg #ffffff`, `--field #f4f4f4`, `--bs #e0e0e0` (border-subtle), `--bstrong #8d8d8d`, `--t1 #161616`, `--t2 #525252`, `--t3 #6f6f6f`, placeholder `#a8a8a8`, `--hov #e8e8e8`
- Accent (firm copper mapped onto Carbon interactive roles): `--acc #B85207`, hover `#9F4605`, tint `#FBEEE4`, link `#B85207`
- Support: error `#da1e28`, success `#24a148`

Dark theme ("Gray 100"), left panel constants: brand panel `#161616`, its text `#f4f4f4`/`#c6c6c6`/`#8d8d8d`, publish dot `#42be65`.
Dark overrides for the form pane: `--bg #161616`, `--field #262626`, `--bs #393939`, `--bstrong #6f6f6f`, `--t1 #f4f4f4`, `--t2 #c6c6c6`, `--t3 #a8a8a8`, `--hov #2c2c2c`, tint `#3a2314`, link `#F0965A`.
Alternative accent (Carbon blue, provided as a token swap): `#0F62FE`, hover `#0353E9`, tint `#EDF5FF`, dark link `#78A9FF`.

- Spacing: Carbon scale — 4 / 8 / 12 / 16 / 24 / 48.
- Radius: 0 everywhere (Carbon sharp corners); dots/avatars are the only circles.
- Type: IBM Plex Sans (variable weight 100–700) + IBM Plex Mono. Scale used: 42/300, 28/400, 15/400, 13.5/400–500, 12.5/400, 11/400, mono 11 and 9/600.
- Motion: 500ms entrance, `cubic-bezier(0,0,.38,.9)`; 2.4s pulse loop.

## Assets
- `images/megeredchian-mark.png` — firm mark (from repo `public/images/`).
- `images/office-floor-plan.webp` — Floor 3 plan (from repo `public/images/`); used decoratively with invert + opacity + radial mask.
- `fonts/ibm-plex-sans-latin-wght-normal.woff2`, `fonts/ibm-plex-mono-latin-{400,600}-normal.woff2` — already in the repo at `app/fonts/`.

## Files
- `Login 1e.dc.html` — the interactive design reference (open in a browser; theme + accent tweakable). Requires sibling `support.js`, `fonts/`, `images/`.
- `support.js` — runtime for the reference file only; not part of the implementation.

## Screenshots
- `screenshots/login-1e-light.png` — Light (White/G10)
- `screenshots/login-1e-dark.png` — Dark (Gray 100)

## Design rationale (Carbon v12)
Based on a fresh review of preview.carbondesignsystem.com ("Carbon Next", updated Aug 12, 2026): v12 final component specs are unpublished; this design applies current Carbon foundations (Plex, sharp corners, token themes, fluid inputs, 48px controls) plus the v12 "guide" principles — one unmistakable primary action, secondary paths visually quieter, motion used only to orient.
