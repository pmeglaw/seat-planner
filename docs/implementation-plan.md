# Seat Planner Implementation Plan

## Current milestone: Step 2

Step 2 ports the first production interaction layer from the v15 HTML prototype into the Next.js/Supabase app.

Implemented:

- Advanced drawer shell for admin-only tools
- Add Seat mode from the Advanced drawer
- Map click-to-place using normalized coordinates
- Move Seat mode safeguard
- Drag selected marker only while Move Seat mode is active
- Save seat movement through a server action
- Seat inspector save/delete wiring
- Direct employee name and position entry from the inspector
- Publish Draft Map server action button
- Client-side optimistic updates after create/update/move/delete
- User-facing error messages for failed mutations

Intentionally deferred:

- JSON import into the production database. This requires server-side validation and should not be a client-only file import.
- Full employee directory management screen.
- Realtime collaboration.
- Audit history.

## Next milestone: Step 3

Recommended next pass:

1. Add a dedicated employee management panel or route.
2. Add server-side JSON import with strict validation and admin-only execution.
3. Add tests for add seat, move seat, duplicate employee assignment, and publish flow.
4. Add loading/success feedback for publish and seat save actions.
5. Add a confirmation dialog for publishing draft to viewer map.

## Security notes

- Client-side UI locks are convenience only. Supabase RLS and server-side `requireAdmin()` remain the actual security boundary.
- JSON import should stay disabled until it is implemented as a server action with schema validation and transaction-like behavior.
- Duplicate employee assignment is protected by both app-level validation and database unique indexes.


## Step 3 – UI parity pass
- Ported V15-inspired marker chips and status coloring.
- Added collapsible filter panel with stats + legend.
- Added collapsible inspector shell and improved spacing.
- Tightened header, map shell, and advanced drawer polish.

- Step 3.1: increased default marker size and expanded selected/hover chip sizing for readability.

## Step 4 – near-v15 marker polish
- Increased marker readability again and moved to a more chip-like mini-pill treatment.
- Added status dot, stronger selected state, and expanded hover chip sizing.
- Tightened the map shell and toolbar message treatment for closer prototype feel.

## Step 5 – marker readability pass
- Ensured base markers always show the full seat code with no truncation.
- Increased base marker contrast and shifted status indication to a corner dot.
- Expanded selected markers into clearer two-line chips while keeping default markers compact.

- Step 5.1: increased selected marker employee-name size and expanded selected chip width/height for better readability.

## Step 6 – final UI polish
- Reduced the inspector glass/blur weight so fields are easier to read.
- Tightened top toolbar spacing and map shell density.
- Added employee results back into the filter panel.
- Improved collapsed filter rail styling.
- Removed native marker tooltip and refined selected-marker chip proportions.
- Added next.config.js for local Next.js compatibility.

## Step 7 – always-visible employee names
- Assigned seats now display employee names at all times instead of only on selected/hover states.
- Unassigned seats remain compact to avoid unnecessary Open labels across the full map.
- Selected markers remain slightly larger with stronger emphasis.

## Step 8 – show/hide names toggle
- Added a map toolbar toggle to switch between always-visible employee names and compact marker mode.
- Names are visible by default to match the current product preference.
- Selected markers still expand with seat context while the map can be de-cluttered when needed.

## Step 9 – inspector glass polish
- Restored the translucent/glass Seat Inspector treatment after the QA baseline made it too solid.
- Kept the same form fields and behavior; this is a visual-only polish pass.
- Updated form inputs to remain readable on the glass panel.
