import { MapWashLayer } from "seat-planner";
import type { ReactNode } from "react";

// MapWashLayer renders the two absolutely-positioned decorative washes that
// sit between the floor-plan raster and the marker layer. Each cell is a
// relative frame at the plan's ~2.2:1 aspect on the admin workspace tone
// (the band the real plan sits on), wrapped in .admin-theme so the
// --admin-* wash tokens resolve. Rects reuse the real measured office-room
// geometry from lib/officeRoomWash.
const Frame = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="admin-theme" style={{ display: "grid", gap: 6 }}>
    <div
      style={{
        position: "relative",
        width: 640,
        height: 290,
        maxWidth: "100%",
        background: "var(--admin-map-workspace, #ECE8E0)",
        border: "1px solid #E7E1D8",
        overflow: "hidden"
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

// Real measured room interiors (lib/officeRoomWash OFFICE_ROOM_VISUAL_RECTS).
const rect = (key: string, xMin: number, xMax: number, yMin: number, yMax: number) => ({
  key,
  xMin,
  xMax,
  yMin,
  yMax
});

const roomWashes = [
  { key: "north-office-1", rect: rect("north-office-1", 0.093, 0.189, 0.118, 0.248), seatId: "seat-a05" },
  { key: "northeast-office-1", rect: rect("northeast-office-1", 0.509, 0.603, 0.11, 0.248), seatId: "seat-b01" },
  { key: "southeast-office-5", rect: rect("southeast-office-5", 0.802, 0.903, 0.756, 0.932), seatId: "seat-c03" }
];

const northWingWash = {
  zone: "North Wing",
  seatCount: 6,
  xMin: 0.07,
  xMax: 0.34,
  yMin: 0.12,
  yMax: 0.46
};

const southWingWash = {
  zone: "South Wing",
  seatCount: 8,
  xMin: 0.26,
  xMax: 0.62,
  yMin: 0.6,
  yMax: 0.9
};

export const ZoneAndRoomWashes = () => (
  <Frame label="zone hover wash + occupied office rooms">
    <MapWashLayer zoneWash={northWingWash} officeRoomWashes={roomWashes} />
  </Frame>
);

export const RoomWashesOnly = () => (
  <Frame label="resting state — occupied rooms glow, no zone hovered">
    <MapWashLayer zoneWash={null} officeRoomWashes={roomWashes} />
  </Frame>
);

export const ZoneWashOnly = () => (
  <Frame label="South Wing pinned, no office rooms occupied">
    <MapWashLayer zoneWash={southWingWash} officeRoomWashes={[]} />
  </Frame>
);
