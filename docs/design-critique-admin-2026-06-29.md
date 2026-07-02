# Design Critique: Admin Seat Planner (`/admin`)

Date: 2026-06-29 · Reviewer pass on `seats.megeredchianlaw.com/admin`

## Method & scope

The live authenticated `/admin` could not be loaded in-browser this pass (the route redirects to `/login` and the browser bridge was offline), so this critique is grounded in the **current source and design tokens** (`SeatMap.tsx`, `SeatInspector.tsx`, `ui/Button.tsx`, `ui/design-system.tsx`, `app/globals.css`, `tailwind.config.ts`) plus the most recent Playwright captures in `output/playwright/`. **Note:** those PNGs are from the Jun 15 build; the admin shell was substantially reworked Jun 26 (`#56`–`#59`: admin token foundation, marker color mapping, semantic colors, dark rail). Findings below reflect the **current code**; a few visual-polish items are flagged "confirm in-browser." All contrast ratios were computed from the actual token hex values (WCAG 2.1 formula).

Assumed context: internal tool for law-firm admins (office manager assigning/maintaining seats); production app in active refinement, not early exploration. Feedback is pitched accordingly — less "is this the right direction," more "tighten the system."

## Overall Impression

This is a calm, professional internal tool with a genuinely good bones decision: a dark left **rail** (identity, live seat stats, publish status, legend) anchoring a light, map-first workspace. That directly answers the older "the map isn't dominant enough" problem. The biggest opportunity now is **system discipline, not layout**: the app ships four competing "orange" tokens, two parallel Button components, and a default primary button that fails color-contrast — so the polish is undercut by inconsistency and one real accessibility miss that's trivial to fix.

## Usability

| Finding | Severity | Recommendation |
|---|---|---|
| Primary action buttons (`variant="primary"`) render as **white on `#f97316`** = **2.80:1** — they read washed-out, so the *most important* action on a screen looks low-emphasis (Sign in, Add/Save employee, Ask, swap/guard confirm). | 🔴 Critical | Retarget the brand button background to a darker orange (see Accessibility). Fixes legibility *and* hierarchy in one change. |
| Disabled primary CTA (e.g. "Assign seat" before an employee is chosen) shows its reason only via `title`/`aria-describedby` — hover-only, invisible on touch, and the disabled text itself is 2.86:1. | 🟡 Moderate | Surface a one-line on-surface reason near the button ("Select an employee to assign"), not just a tooltip. |
| Shipped controls are **36px tall** (`ui/Button` = `min-h-9`); fine on desktop but tight in the management lists and on touch. | 🟡 Moderate | Raise interactive height to 44px on touch (the search input already is). |
| Potential dual "search" affordances — the command-row search plus the filter/people search — could blur which one scopes what. | 🟢 Minor (confirm in-browser) | Ensure one is clearly primary; label the secondary by scope ("Filter this list"). |

## Visual Hierarchy

- **What draws the eye first:** the high-contrast dark rail on the left, then the map. That's defensible (it's the orientation anchor), but watch that the rail's weight doesn't out-compete the map it's meant to support. The map should still feel like the subject.
- **Reading flow:** rail (who/what/state) → command search → map → contextual inspector. Logical and left-to-right clean.
- **Emphasis to fix inside the rail:** the rail stacks four similarly-styled rounded cards (identity, 3-up stats, *publish-status button*, legend). The publish-status control is the one *actionable, consequential* element in the rail, but it carries the same visual weight as the static legend and stat tiles. Give it stronger affordance (elevation/border/label) so the primary workflow exit reads as a button, not a card.
- **Inspector (good):** assignment is now the clear hero — large assignee name, `available / Pod / Original` pills, then secondary fields. That's a real improvement over the older flat form.

## Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Color tokens | **Three+ overlapping systems** coexist: `--ml-*` (brand palette, much now unused — violet/electric-blue/navy/teal/aqua/coral…), `--sp-color-*` (the "design system"), `--admin-*` (Jun 26 foundation), plus Tailwind `brand`. | Pick one source of truth. Treat `--admin-*` as canonical for admin, map `--sp-*`/Tailwind onto it, and delete dead `--ml-*` tokens. |
| "Primary" orange | At least **four** in play: `brand #f97316`, `admin-primary #F26E22`, `sp-action-primary #C2410C`, `admin-primary-cta #A63A12` (+ `brand-copper #D46A24`). No obvious canonical value. | Collapse to a documented 2–3 step orange ramp (base / hover / pressed) and reference it everywhere. |
| Button components | **Two** exist: `ui/Button.tsx` ships across the app; the token-based `ui/design-system.tsx` Button is only used in a `/concepts` demo. The "design system" is effectively shelved. | Choose one. If `design-system` is the intended future, migrate call sites to it; otherwise fold its tokens into `ui/Button` and retire it. |
| Override pattern | Call sites patch the shipped button with `!important` admin-token utilities (inspector CTA, Vacate, Delete each repeat a long `!border-… !bg-… !text-white` string). | This is a smell that the component API doesn't match real needs — bake `primary`/`destructive` variants that already use the admin tokens, so call sites stop overriding. |
| Token mixing | `SeatInspector` mixes `--sp-color-*` and `--admin-*` within one component. | Standardize per surface. |

## Accessibility

Contrast computed from live token values (✅ pass AA / ❌ fail; normal-text threshold 4.5:1):

- ❌ **Primary button** — white on `#f97316` = **2.80:1** (fails even the 3:1 large/UI floor). Fix: `#A63A12` → **6.49:1** or `#C2410C` → **5.18:1**. The inspector CTA already uses `#A63A12`, so there's an internal precedent — just make it the button default.
- ❌ **Search placeholder** — `#8E949C` on white = **3.06:1**. Bump to `--admin-text-muted #6F7680` (**4.59:1**).
- ⚠️ **"Assigned" rail stat** — `#2F7A56` on `#DDE9DF` = **4.16:1** (just under AA for the bold number). Darken the success token slightly.
- ✅ **Seat-state semantic colors** all pass well: draft `6.4:1`, published `7.7:1`, danger `6.8:1`, info `7.6:1`, warning `5.7:1`.
- ✅ **Dark rail** text excellent: white `13.5–18.9:1`, muted rail text `6.5:1`.
- ✅ **Body/secondary/command-label** text all pass (`4.6–12.3:1`).

Other a11y notes:
- **Touch targets:** primary controls are 36px; small close/clear buttons are 28–32px. Below the 44px comfort target — raise on touch.
- **Focus:** consistent, visible 4px focus ring with offset (`focusRingClass`) applied broadly — strong. Keep it.
- **Labeling:** good use of `aria-label`, `sr-only`, `role="group"`, `aria-labelledby` on sections.
- Worth confirming in-browser (carried from prior review): drawer/inspector focus-trap + focus-return on close, and `motion-reduce` on marker scale transitions.

## What Works Well

- **Map-first dark-rail shell** — identity, live stats, publish status, and legend consolidated off the canvas; the map owns the workspace.
- **Semantic seat-state color system** — every state badge clears AA comfortably and the palette is warm and coherent.
- **Consistent, visible focus rings** across inputs and buttons — better than most internal tools.
- **Recent workflow wins** — in-app Vacate confirmation modal (replacing a browser `confirm`), the "Matched existing employee" state, and a 44px command-search input.
- **Solid semantics** — icon buttons carry labels, sections are landmarked, hidden helper text is provided.

## Priority Recommendations

1. **Fix the primary-button contrast (today).** Change `ui/Button` `primary` from `bg-brand` (`#f97316`, 2.80:1) to `--admin-primary-cta`/`#A63A12` (6.49:1). One line; instantly fixes both the AA failure and the "primary actions don't look primary" hierarchy problem app-wide.
2. **Converge on one button + one token system.** Retire or adopt `design-system.tsx`, collapse the four oranges into a documented ramp, delete dead `--ml-*` tokens, and remove the `!important` override pattern by baking variants. This is the highest-leverage move for long-term consistency and is mostly mechanical.
3. **Tighten touch + disabled affordances.** Raise control height to 44px on touch, fix the placeholder contrast, and give disabled primary CTAs an on-surface reason instead of a hover-only tooltip — so the assignment flow is legible on tablets and to keyboard/touch users.
