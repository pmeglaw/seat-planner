"use client";

import type { OfficeRoomWash } from "@/lib/officeRoomWash";
import type { ZoneWashRect } from "@/lib/zoneWash";

/**
 * The two decorative wash overlays that sit between the floor-plan raster and
 * the marker layer, shared by BOTH map surfaces (admin SeatMap and viewer
 * ViewerSeatFinder). The two surfaces are otherwise not interchangeable — this
 * layer is extracted precisely because it was copied, and the copies drifted:
 * #323 tokenized the room-wash fill on the admin side only, leaving the viewer
 * on a raw #1D6E41. One implementation is what keeps that from recurring.
 *
 * Both washes are decorative reinforcement only. Occupancy and zone facts are
 * carried in text by the seat plate and the zone chip, so WCAG 1.4.1 is
 * satisfied by redundancy and never by a wash — hence `aria-hidden` on both.
 * Both are also pointer-inert: drag-panning has to cross them.
 *
 * Zone wash frames an AREA rather than labelling a seat, so it renders under
 * the room washes and the markers alike.
 */
type MapWashLayerProps = {
  zoneWash: ZoneWashRect | null;
  officeRoomWashes: OfficeRoomWash[];
};

export function MapWashLayer({ zoneWash, officeRoomWashes }: MapWashLayerProps) {
  return (
    <>
      {zoneWash && (
        <div
          aria-hidden="true"
          data-zone-wash={zoneWash.zone}
          className="pointer-events-none absolute z-[5] border-[1.5px] border-[color-mix(in_srgb,var(--sp-interactive)_55%,transparent)] bg-[color-mix(in_srgb,var(--sp-interactive)_9%,transparent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.4)]"
          style={{
            left: `${zoneWash.xMin * 100}%`,
            top: `${zoneWash.yMin * 100}%`,
            width: `${(zoneWash.xMax - zoneWash.xMin) * 100}%`,
            height: `${(zoneWash.yMax - zoneWash.yMin) * 100}%`
          }}
        >
          <span className="absolute -top-[11px] left-2.5 whitespace-nowrap rounded-full bg-[var(--sp-button-primary)] px-2 py-0.5 text-xs font-bold tracking-[0.04em] text-white">
            {zoneWash.zone} · {zoneWash.seatCount} seats
          </span>
        </div>
      )}

      {officeRoomWashes.map(wash => (
        <div
          key={wash.key}
          aria-hidden="true"
          data-office-wash={wash.key}
          className="pointer-events-none absolute rounded-lg bg-[var(--sp-wash-zone)] shadow-[inset_0_0_0_1.5px_rgba(29,110,65,0.22)]"
          style={{
            left: `${wash.rect.xMin * 100}%`,
            top: `${wash.rect.yMin * 100}%`,
            width: `${(wash.rect.xMax - wash.rect.xMin) * 100}%`,
            height: `${(wash.rect.yMax - wash.rect.yMin) * 100}%`
          }}
        />
      ))}
    </>
  );
}
