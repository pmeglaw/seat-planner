# v1.1.7 — Viewer/Public Map Polish + Mobile Smoke Test

## Goal

Polish the published viewer map experience without changing Supabase schema, publish behavior, or admin workflows.

## Scope

- Improve public map marker readability on mobile and tablet widths.
- Keep the published viewer route using `layer = published`.
- Keep admin draft routes using `layer = draft`.
- Avoid Supabase schema changes.
- Avoid publish workflow changes.
- Preserve existing marker coordinates and map image sizing.

## Changes

- Tightened seat marker chip widths for smaller screens.
- Added `touch-manipulation` and `select-none` to markers for better mobile tapping.
- Improved marker accessible labels so screen readers receive the seat label, actor/open-seat state, and status.
- Added marker `title` text for quick desktop hover context.
- Added motion-reduce support for marker transitions.

## Manual smoke checklist

### Desktop

- Open `/` as an authenticated viewer/admin.
- Confirm published seats load.
- Confirm map scroll/zoom container remains usable.
- Confirm markers remain readable with names visible.
- Search by employee, seat, department, zone, and position.
- Select a marker and confirm details open correctly.

### Mobile / narrow viewport

- Open `/` at approximately 390px width.
- Confirm the map remains horizontally scrollable rather than shrinking into unreadable markers.
- Confirm markers are tappable.
- Confirm selected marker has clear visual contrast.
- Confirm the filter panel can collapse and does not create document-level horizontal overflow.

### Regression

- `/` continues to query published seats only.
- `/admin` continues to query draft seats only.
- `/admin/management` still loads management tabs and Publish History.
- Removed legacy messaging tables are not referenced by runtime code.

## Validation commands

```bash
npm test
npm run typecheck
npm run lint
npm run build
```
