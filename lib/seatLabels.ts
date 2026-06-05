import type { SeatWithEmployee } from "@/lib/types";

type SeatLabelSource = Pick<SeatWithEmployee, "label"> & Partial<Pick<SeatWithEmployee, "zone" | "department">>;

type SeatLabelPattern = {
  prefix: string;
  digitWidth: number;
  count: number;
  firstIndex: number;
};

function normalizeLabel(value: string) {
  return value.trim().toUpperCase();
}

function normalizeZone(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getSeatZone(seat: SeatLabelSource) {
  return seat.zone ?? seat.department ?? null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNumberedLabel(label: string) {
  const match = normalizeLabel(label).match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    digitWidth: match[2].length
  };
}

export function inferSeatPrefixFromZone(zone?: string | null) {
  const text = (zone ?? "").trim().toLowerCase();
  if (!text) return "S";
  if (text.includes("northeast") || text.includes("north east")) return "NE";
  if (text.includes("southeast") || text.includes("south east")) return "SE";
  if (text.includes("southwest") || text.includes("south west")) return "SW";
  if (text.includes("northwest") || text.includes("north west")) return "NW";
  if (text.includes("center west") || text.includes("central west")) return "CW";
  if (text.includes("center east") || text.includes("central east")) return "CE";
  if (text.includes("center") || text.includes("central")) return "C";
  if (text.includes("west")) return "W";
  if (text.includes("east")) return "E";
  if (text.includes("north")) return "N";
  if (text.includes("south")) return "S";

  const initials = text
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase())
    .join("")
    .slice(0, 3);

  return initials || "S";
}

export function buildNextSeatLabel(
  seats: SeatLabelSource[],
  zone?: string | null
) {
  const zoneKey = normalizeZone(zone);
  const zoneSeats = seats.filter(seat => normalizeZone(getSeatZone(seat)) === zoneKey);
  const patterns = new Map<string, SeatLabelPattern>();

  zoneSeats.forEach((seat, index) => {
    const parsed = parseNumberedLabel(seat.label);
    if (!parsed) return;

    const current = patterns.get(parsed.prefix);
    if (!current) {
      patterns.set(parsed.prefix, {
        prefix: parsed.prefix,
        digitWidth: parsed.digitWidth,
        count: 1,
        firstIndex: index
      });
      return;
    }

    current.count += 1;
    current.digitWidth = Math.max(current.digitWidth, parsed.digitWidth);
  });

  const pattern = Array.from(patterns.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.firstIndex - right.firstIndex;
  })[0];
  const prefix = pattern?.prefix ?? inferSeatPrefixFromZone(zone);
  const digitWidth = Math.max(pattern?.digitWidth ?? 2, 2);
  const escapedPrefix = escapeRegExp(prefix);
  const prefixPattern = new RegExp(`^${escapedPrefix}(\\d+)$`, "i");
  const existingLabels = new Set(seats.map(seat => normalizeLabel(seat.label)));
  const zoneNumbers = new Set<number>();

  for (const seat of zoneSeats) {
    const match = normalizeLabel(seat.label).match(prefixPattern);
    if (!match) continue;
    zoneNumbers.add(Number(match[1]));
  }

  const maxZoneNumber = zoneNumbers.size > 0 ? Math.max(...zoneNumbers) : 0;

  for (let offset = 0; offset < 1000; offset += 1) {
    const nextNumber = maxZoneNumber + 1 + offset;
    const label = `${prefix}${String(nextNumber).padStart(digitWidth, "0")}`;
    if (!existingLabels.has(normalizeLabel(label))) return label;
  }

  let fallbackIndex = 1;
  while (existingLabels.has(normalizeLabel(`${prefix}-${fallbackIndex}`))) {
    fallbackIndex += 1;
  }
  return `${prefix}-${fallbackIndex}`;
}
