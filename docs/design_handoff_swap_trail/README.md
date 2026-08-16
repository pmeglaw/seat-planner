# Handoff: Draft Trail Overlay (swap + move animation)

## Overview
An animated SVG trail rendered on the **admin draft map** (`/admin`) whenever a pending swap or move connects two seats. It shows the route between the seats as a flowing dashed line so the admin sees at a glance which seats a draft operation ties together. Scope of this handoff is the **trail overlay only** — the app's existing seat markers, swap/move state machine, and styling stay exactly as they are today.

## About the Design Files
`Swap Trail Demo.dc.html` is a **design reference created in HTML** — a prototype showing intended look and motion, not production code to copy. Recreate it in the existing codebase: Next.js 16 + React 19 + Tailwind CSS 3, inside `components/seat-map/SeatMap.tsx`'s map layer stack. Open the demo in a browser (needs sibling `support.js` and `images/`). The seat markers in the demo are stand-ins.

## Fidelity
**High-fidelity** for the trail itself (geometry, colors, dash rhythm, timing are final). The markers in the demo are illustrative only.

## The component

### When it renders
- **Swap pending**: while `swapSourceSeatId` is set and a target is selected/confirming — one trail pair between the two seats.
- **Move pending**: while a move origin is armed and a destination is chosen — one trail from origin to destination.
- Optional (behind the same component): saved-but-unpublished draft moves can show a static (non-animated) underlay-only route. Ship the pending-operation trail first.
- Unmounts (with no exit animation needed) when the operation completes or cancels.

### Geometry
- One `<svg>` absolutely positioned over the floor-plan image, same box as the plan (`inset:0; width/height:100%`), `pointer-events:none`, `overflow:visible`.
- `viewBox="0 0 1000 H"` where `H = 1000 / planAspectRatio` (plan image natural W/H; ≈426 for the current Floor 3 plan). Seat coordinates map as `px = x * 1000`, `py = y * H` from the seats' normalized `x`/`y` (already in [0,1] in the DB). Reuse the existing transform helpers in `lib/mapLayoutTransform.ts` if they expose plan aspect.
- **Path**: quadratic Bézier `M start Q control end`.
  - `start`/`end` are the seat centers pulled back ~10 viewBox units along the path direction so the line never touches the markers.
  - `control` = midpoint offset **perpendicular** to the segment by ~18% of the segment length (sign picks the bow side).
- **Swap** = two paths, opposite bow signs (mirrored arcs), each with its own arrowhead — reads as circular exchange.
- **Move** = one path + one arrowhead + a small dashed **origin ring** (r=3, `stroke #6E655A 1.5px, dasharray 2 2`) at the start point.
- **Arrowhead**: filled triangle ~11×8 viewBox units at the path end, rotated to the end tangent (for `Q c e`, tangent direction is `e − c`).

### Layers (bottom → top)
1. Route underlay: same path, `stroke #B85207`, `stroke-width 6`, `opacity .16`, `stroke-linecap round`.
2. Flow line: same path, `stroke #B85207`, `stroke-width 1.8`, `stroke-dasharray 6 4`.
3. Arrowhead(s): `fill #B85207`.
4. Origin ring (move only).
5. The app's existing seat markers render **above** the overlay (overlay sits above wash layers / plan image, below the marker layer).

### Motion
- Flow: animate `stroke-dashoffset` from 0 to **−20**, `1.2s linear infinite`. (Dash period 6+4=10 divides 20 → seamless loop; negative offset makes dashes flow start → end.)
- Entrance: whole overlay fades in `opacity 0→1`, 240ms, `cubic-bezier(0, 0, .38, .9)` (Carbon entrance easing).
- `@media (prefers-reduced-motion: reduce)`: no dash animation, no fade — render the trail static (underlay + solid or static-dashed line + arrowhead). Never remove the trail entirely; only the motion.

## Design Tokens
- Trail color: `#B85207` (the copper accent; wire to the app's existing accent token, e.g. `--admin-primary`/`--sp-color-action-primary`, rather than hardcoding).
- Underlay opacity `.16`; flow line `1.8px`; underlay `6px`; dash `6 4`; loop `1.2s linear`; entrance `240ms cubic-bezier(0,0,.38,.9)`.
- Origin ring `#6E655A`.
- Dark theme: same values (the trail sits on the light plan image in both themes).

## State Management
No new global state. The overlay is a pure render of existing SeatMap state: `(sourceSeat, targetSeat, kind: 'swap' | 'move')` → paths. Recompute path geometry only when the seat pair or plan size changes (memo on seat ids + container size).

## Accessibility
- `aria-hidden="true"` on the SVG — the operation is already announced by the existing swap/move status messaging; the trail is decorative reinforcement.
- Honor `prefers-reduced-motion` as above.
- `pointer-events:none` so it never intercepts marker clicks or keyboard-nav focus targets.

## Assets
- `images/office-floor-plan.webp` — demo backdrop only (already in the repo at `public/images/`). No new assets are required by the implementation.

## Files
- `Swap Trail Demo.dc.html` — interactive reference (left pair = swap, right pair = move). Requires sibling `support.js` + `images/`.
- `support.js` — runtime for the reference file only; not part of the implementation.

## Acceptance checklist
- [ ] Trail appears while a swap/move is pending, between the correct two seats, and disappears on complete/cancel.
- [ ] Dashes flow from source toward destination; swap shows two mirrored arcs with two arrowheads.
- [ ] Line never overlaps marker circles (10-unit trim) and never blocks pointer events.
- [ ] Loop is seamless (no visible jump each 1.2s).
- [ ] Static-but-visible under `prefers-reduced-motion`.
- [ ] Color comes from the accent token, not a hardcoded hex.
- [ ] No layout shift; overlay tracks the plan through zoom/resize (same transform as markers).
