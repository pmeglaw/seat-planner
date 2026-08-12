import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const palette = await importTsModule("lib/viewerFindPalette.ts");

// Browse-mode feed for the Find palette (Viewer v12 handoff, contract #3).
// Fixtures mirror tests/viewer-seat-search.test.mjs so the two read alike.

function employee(overrides) {
  return {
    id: overrides.id,
    full_name: overrides.full_name,
    position: overrides.position ?? null,
    department: overrides.department ?? null,
    phone_extension: overrides.phone_extension ?? null,
    avatar_url: null,
    active: overrides.active ?? true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

function seat(overrides) {
  return {
    id: overrides.id,
    seat_key: overrides.seat_key ?? overrides.label,
    label: overrides.label,
    x: overrides.x ?? 0.1,
    y: overrides.y ?? 0.2,
    status: overrides.status ?? (overrides.employee ? "assigned" : "available"),
    layer: "published",
    employee_id: overrides.employee?.id ?? null,
    employee: overrides.employee ?? null,
    zone: "zone" in overrides ? overrides.zone : "West Pod",
    department: overrides.department ?? null,
    notes: null,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

const alex = employee({ id: "emp-alex", full_name: "Alex Rivera", department: "Litigation" });
const jordan = employee({ id: "emp-jordan", full_name: "Jordan Brooks", department: "Litigation" });
const maya = employee({ id: "emp-maya", full_name: "Maya Chen", department: "Intake" });

const zoneOption = (name, active = true) => ({
  id: `zone-${name}`,
  name,
  active,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
});

test("zone chips count published seats and sort by name", () => {
  const chips = palette.buildViewerZoneChips({
    seats: [
      seat({ id: "s1", label: "N01", zone: "North Pod", employee: alex }),
      seat({ id: "s2", label: "N02", zone: "North Pod" }),
      seat({ id: "s3", label: "W01", zone: "West Pod", employee: maya })
    ]
  });

  assert.deepEqual(chips, [
    { name: "North Pod", seatCount: 2 },
    { name: "West Pod", seatCount: 1 }
  ]);
});

// A zone configured but not yet sat in must still browse — otherwise a
// freshly-created zone reads as broken until someone is assigned into it.
test("an active zone option with no seats still renders, at zero", () => {
  const chips = palette.buildViewerZoneChips({
    seats: [seat({ id: "s1", label: "N01", zone: "North Pod" })],
    zoneOptions: [zoneOption("Quiet Room")]
  });

  assert.deepEqual(chips.map(chip => [chip.name, chip.seatCount]), [
    ["North Pod", 1],
    ["Quiet Room", 0]
  ]);
});

test("inactive zone options stay out of the chip row", () => {
  const chips = palette.buildViewerZoneChips({
    seats: [seat({ id: "s1", label: "N01", zone: "North Pod" })],
    zoneOptions: [zoneOption("Retired Wing", false)]
  });

  assert.deepEqual(chips.map(chip => chip.name), ["North Pod"]);
});

// Same de-duplication the viewer's option lists have always used: match on a
// trimmed lowercase key, keep the first spelling seen.
test("zone names de-duplicate case-insensitively, option spelling winning", () => {
  const chips = palette.buildViewerZoneChips({
    seats: [
      seat({ id: "s1", label: "N01", zone: "north pod" }),
      seat({ id: "s2", label: "N02", zone: "  North Pod  " })
    ],
    zoneOptions: [zoneOption("North Pod")]
  });

  assert.equal(chips.length, 1);
  assert.deepEqual(chips[0], { name: "North Pod", seatCount: 2 });
});

// The counting key and the filtering key have to be the SAME key. A chip that
// counts a seat it cannot then select is worse than a missing chip: it shows a
// number and pins to nothing. This failed before the shared zoneKey existed — chips
// aggregated on a trimmed lowercase key while the viewer's pinned-zone filter
// compared the chip's display name to the seat's raw zone with ===.
test("every chip pins to the seats it counted, whatever their casing or padding", () => {
  const seats = [
    seat({ id: "s1", label: "N01", zone: "north pod" }),
    seat({ id: "s2", label: "N02", zone: "  North Pod  " }),
    seat({ id: "s3", label: "W01", zone: "West Pod" })
  ];
  const chips = palette.buildViewerZoneChips({ seats, zoneOptions: [zoneOption("North Pod")] });

  for (const chip of chips) {
    const matched = seats.filter(
      current => palette.zoneKey(palette.getSeatZone(current)) === palette.zoneKey(chip.name)
    );
    assert.equal(
      matched.length,
      chip.seatCount,
      `chip "${chip.name}" counts ${chip.seatCount} seats but its pinned filter selects ${matched.length}`
    );
    assert.ok(matched.length > 0, `chip "${chip.name}" would pin to an empty map`);
  }
});

test("a seat with no zone falls back to its department, then to No zone", () => {
  const chips = palette.buildViewerZoneChips({
    seats: [
      seat({ id: "s1", label: "D01", zone: null, department: "Records" }),
      seat({ id: "s2", label: "U01", zone: null, department: null })
    ]
  });

  assert.deepEqual(chips.map(chip => [chip.name, chip.seatCount]), [
    ["No zone", 1],
    ["Records", 1]
  ]);
});

test("browse mode returns zone chips, the A→Z people list, and the footer counts", () => {
  const browse = palette.buildViewerPaletteBrowse({
    seats: [
      seat({ id: "s1", label: "N01", zone: "North Pod", employee: alex }),
      seat({ id: "s2", label: "W01", zone: "West Pod", employee: maya }),
      seat({ id: "s3", label: "W02", zone: "West Pod" })
    ],
    employees: [maya, alex, jordan]
  });

  assert.deepEqual(browse.zones.map(chip => chip.name), ["North Pod", "West Pod"]);
  assert.deepEqual(browse.people.map(row => row.title), ["Alex Rivera", "Jordan Brooks", "Maya Chen"]);
  assert.equal(browse.totalCount, 3);
  assert.equal(browse.seatedCount, 2);
  assert.equal(browse.summary, "3 people · 2 seated");
});

test("the footer line stays grammatical for a single person", () => {
  const browse = palette.buildViewerPaletteBrowse({
    seats: [seat({ id: "s1", label: "N01", employee: alex })],
    employees: [alex]
  });

  assert.equal(browse.summary, "1 person · 1 seated");
});

// Unseated people stay listed (contract #9) — they render disabled rather than
// disappearing, so the palette is a directory as well as a map index.
test("unseated people remain in the browse list", () => {
  const browse = palette.buildViewerPaletteBrowse({
    seats: [seat({ id: "s1", label: "N01", employee: alex })],
    employees: [alex, jordan]
  });

  const jordanRow = browse.people.find(row => row.title === "Jordan Brooks");
  assert.ok(jordanRow, "an unseated person is still listed");
  assert.equal(jordanRow.seatId, null);
  assert.equal(browse.totalCount, 2);
  assert.equal(browse.seatedCount, 1);
});

test("an empty map yields empty chips and a zeroed footer", () => {
  const browse = palette.buildViewerPaletteBrowse({ seats: [], employees: [] });

  assert.deepEqual(browse.zones, []);
  assert.deepEqual(browse.people, []);
  assert.equal(browse.summary, "0 people · 0 seated");
});
