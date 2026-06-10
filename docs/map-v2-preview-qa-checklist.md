# Seat Planner map v2 preview QA checklist

Goal: validate UI/UX with the rendered map preview before any production Supabase coordinate change.

## Map asset

- Confirm `public/images/office-floor-plan.png` is the approved rendered v2 PNG.
- Confirm the image is exactly `1561 x 1008`.
- Confirm no extra crop, resize, or CSS distortion appears in the browser.
- Confirm no Supabase records, migrations, or environment variables are changed for this preview.

## Preview-only references

- `lib/mapLayoutTransform.ts` is not used for this preview; marker placement is evaluated against the rendered image and existing normalized seat coordinates.
- `docs/overlay_layout_scaled_v2_standardized_proposed_transform.png` is a review overlay only.
- `supabase/reference/proposed_coordinate_transform_do_not_apply.sql` and `supabase/reference/proposed_coordinate_transform_reference.csv` are reference-only coordinate materials. They are not migrations, are not applied automatically, and the SQL ends with `rollback`.

## Marker anchoring

- The seat coordinate target is now the center of the small dot/pin.
- The label chip is a callout positioned around the dot. Chip width, visible names, hover expansion, search state, selection state, swap state, and Ask Planner highlighting must not move the coordinate target.
- In Move Seat mode, the dragged coordinate should visually follow the dot center.
- In Add Seat mode, clicking any existing marker surface should not create a new draft seat underneath the callout.

## Screenshot checkpoints

Capture or review screenshots at desktop width and, when practical, a narrow/mobile viewport. Current local QA artifacts:

| Zone | Checkpoint seats | Expected callout placement | Screenshot artifact |
| --- | --- | --- | --- |
| N | N01, N04, N09, N12 | Compact above-dot labels; dots centered on chairs | `output/playwright/map-v2-dot-anchor-north.png` |
| NE | NE01, NE04, NE05, NE08 | Compact above-dot labels; dots centered on chairs | `output/playwright/map-v2-dot-anchor-northeast.png` |
| W | W01, W06, W10, W12 | Right or above-right callouts; dot remains on chair | `output/playwright/map-v2-dot-anchor-west.png` |
| CW | CW01, CW04, CW07, CW08 | Compact above-dot labels through dense center-west rows | `output/playwright/map-v2-dot-anchor-center-west.png` |
| C | C01, C04, C05, C08 | Compact above-dot labels through center desks | `output/playwright/map-v2-dot-anchor-center.png` |
| E | E01, E04, E05, E08 | Default above-dot callouts unless crowded | `output/playwright/map-v2-dot-anchor-east.png` |
| SE | SE01, SE02, SE03, SE04 | Left or above-left callouts; dots centered in the office | `output/playwright/map-v2-dot-anchor-southeast.png` |
| Mobile admin | Default visible map window | No document-level horizontal overflow; map scrolls internally | `output/playwright/map-v2-dot-anchor-mobile-admin.png` |

## Viewer route `/`

- Confirm published map loads for an authenticated viewer.
- Check marker visual placement in all zones listed above.
- Confirm marker labels are readable without overwhelming the rendered map.
- Confirm selected, hover, and focus states remain obvious.
- Confirm search results and Ask Planner highlights promote the chip without moving the dot.

## Admin route `/admin`

- Search for a seat and use "Fit results"; the viewport should pan to the visual dot location.
- Select seats in dense pods; inspector should open without the callout feeling visually centered over the wrong chair.
- Toggle names; labels should remain readable and not cover too much furniture.
- Test Move Seat mode on a harmless draft seat; dragging should visually track the dot center.
- Test Add Seat mode in each major seating zone; existing marker callouts should block accidental add-seat clicks.
- Test Swap Seats mode; source and target styling should apply to the dot and callout.
- Cancel/discard test edits unless intentionally testing persistence in a non-production environment.

## Responsive UI

- Desktop: map should feel spacious and not overly zoomed.
- Tablet width: horizontal/vertical scroll should be smooth.
- Mobile width: panning should feel natural; markers should remain tappable.
- Confirm callouts do not create document-level horizontal overflow on a narrow viewport.

## Approval notes

Record issues by zone and marker label. The preview alignment is intentionally adjustable; prioritize visual dot placement over preserving any rough previous transform formula.
