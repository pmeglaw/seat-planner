# Seat Planner map v2 preview QA checklist

Goal: validate the approved rendered map preview before any production Supabase coordinate migration.

## Map asset

- Confirm `public/images/office-floor-plan.png` is the approved final PNG.
- Confirm the canonical map frame is exactly `1911 x 867`.
- Confirm the image is not cropped, stretched, regenerated, or AI-cleaned in the app.
- Confirm no Supabase records, migrations, publish actions, deployments, or environment variables are changed for this preview.

## Preview-only calibration

- `lib/mapLayoutTransform.ts` is the preview-only calibration layer for the final 1911 x 867 frame.
- Saved Supabase coordinates remain in the existing normalized coordinate space.
- Marker dots render through the preview transform so the dot center lands on the visual seat/chair.
- Add Seat and Move Seat convert visual pointer positions back through the inverse transform before saving draft coordinates.
- `supabase/reference/proposed_coordinate_transform_do_not_apply.sql` and `supabase/reference/proposed_coordinate_transform_reference.csv` remain reference-only materials. They are not migrations, are not applied automatically, and the SQL ends with `rollback`.

## First-view fit

- Desktop `/` first load shows the full map inside the available viewport as much as practical without document-level vertical scrolling.
- Desktop `/admin` keeps the map first, with filters/tools around it and the full floor plan visible when no drawers or result rails are open.
- Narrow/mobile viewports keep document-level horizontal overflow hidden while the map pans internally.
- The map image keeps its native aspect ratio in every viewport.

## Marker anchoring

- The seat coordinate target is the center of the small dot/pin.
- The label chip is a callout positioned around the dot. Chip width, visible names, hover expansion, search state, selection state, swap state, and Ask Planner highlighting must not move the coordinate target.
- In Move Seat mode, the dragged coordinate visually follows the dot center.
- In Add Seat mode, clicking any existing marker surface should not create a new draft seat underneath the callout.

## Zone and marker checkpoints

| Zone | Checkpoint seats | Expected result |
| --- | --- | --- |
| North Pod | N01, N04, N09, N12 | Dots centered on the top pod chairs; compact above-dot labels. |
| Northeast Pod | NE01, NE04, NE05, NE08 | Dots centered on the northeast pod chairs; compact labels stay readable. |
| West Pod | W01, W06, W10, W12 | Dots centered through dense west rows; right or above-right callouts avoid the chairs. |
| Center West | CW01, CW04, CW07, CW08 | Upper and lower row calibration both track the intended chairs. |
| Center Desks | C01, C04, C05, C08 | Dots center on the two central desk rows; Fit Results pans to the visual dots. |
| East Pod | E01, E04, E05, E08 | Dots center on the east pod chairs without label drift. |
| Southeast Office | SE01, SE02, SE03, SE04 | Dots center inside the southeast office; left or above-left callouts stay clear. |

## Viewer route `/`

- Confirm the authenticated viewer route renders the published map with the 1911 x 867 asset.
- Toggle names on/off and confirm labels remain readable without overwhelming the map.
- Select a marker and confirm the selected chip grows without shifting the dot.
- Search for `N01`, `W10`, and `SE04`; each result should center on the visual dot location.

## Admin route `/admin`

- Confirm the admin route renders the draft map with the same 1911 x 867 asset.
- Use Fit Results for searches `N01`, `W10`, and `SE04`; the viewport should pan to the visual dot location.
- Select seats in dense West, Center, and North pods; inspector opening should not make placement look chip-centered.
- Test Add Seat zone detection in North Pod, Northeast Pod, West Pod, Center West, Center Desks, East Pod, and Southeast Office. Do not publish.
- Confirm ambiguous or hallway clicks fail with clear copy.
- Test Move Seat on a local/preview draft seat only; the dot should track the pointer and save through the inverse transform.
- Test Swap Seats mode; source and target styling should apply to the dot and callout.
- Cancel or undo preview edits unless intentionally testing persistence in a non-production environment.

## Responsive QA

- Desktop: full-map first view feels spacious and premium.
- 390px mobile/narrow viewport: page does not horizontally overflow; the map scrolls internally.
- Tablet width: horizontal and vertical map panning remain smooth.
- Names on/off: labels do not cover too much furniture in dense zones.
- Selected, search, highlighted, swap, and dragging states do not move the dot center.

## Approval notes

Record issues by route, viewport, zone, and marker label. This branch is preview/UI calibration only; production Supabase coordinates are unchanged.
