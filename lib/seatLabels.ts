import type { SeatWithEmployee } from "@/lib/types";

function normalizeLabel(value: string) {
  return value.trim().toUpperCase();
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
  seats: Pick<SeatWithEmployee, "label">[],
  zone?: string | null
) {
  const prefix = inferSeatPrefixFromZone(zone);
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`, "i");
  const existingLabels = new Set(seats.map(seat => normalizeLabel(seat.label)));
  let maxNumber = 0;

  for (const seat of seats) {
    const match = normalizeLabel(seat.label).match(pattern);
    if (!match) continue;
    maxNumber = Math.max(maxNumber, Number(match[1]));
  }

  for (let nextNumber = maxNumber + 1; nextNumber < 1000; nextNumber += 1) {
    const label = `${prefix}${String(nextNumber).padStart(2, "0")}`;
    if (!existingLabels.has(normalizeLabel(label))) return label;
  }

  let fallbackIndex = 1;
  while (existingLabels.has(normalizeLabel(`${prefix}-${fallbackIndex}`))) {
    fallbackIndex += 1;
  }
  return `${prefix}-${fallbackIndex}`;
}
