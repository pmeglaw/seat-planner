import type { SeatStatus } from "@/lib/types";

// Overview-zoom clustering (Figma page 10, Scalability): markers collapse into
// one pill per zone — "West Pod · 12 seats — 3 open" — and detail zoom shows
// individual seats. Callers supply the coordinates the pill should anchor to
// (visual/calibrated points), so this module stays pure and transform-agnostic.

export const UNZONED_CLUSTER_LABEL = "Unzoned";

export type SeatClusterSource = {
  status: SeatStatus;
  x: number;
  y: number;
  zone?: string | null;
  department?: string | null;
};

export type ZoneCluster = {
  zone: string;
  seatCount: number;
  openCount: number;
  // Centroid of the member seats, in the same coordinate space as the input.
  x: number;
  y: number;
};

export function buildZoneClusters(seats: SeatClusterSource[]): ZoneCluster[] {
  const groups = new Map<string, { count: number; open: number; sumX: number; sumY: number }>();

  for (const seat of seats) {
    const zone = seat.zone ?? seat.department ?? UNZONED_CLUSTER_LABEL;
    const group = groups.get(zone) ?? { count: 0, open: 0, sumX: 0, sumY: 0 };
    group.count += 1;
    if (seat.status === "available") group.open += 1;
    group.sumX += seat.x;
    group.sumY += seat.y;
    groups.set(zone, group);
  }

  return Array.from(groups.entries())
    .map(([zone, group]) => ({
      zone,
      seatCount: group.count,
      openCount: group.open,
      x: group.sumX / group.count,
      y: group.sumY / group.count
    }))
    .sort((left, right) => left.zone.localeCompare(right.zone));
}

export function formatZoneClusterSummary(cluster: ZoneCluster) {
  const seatsText = cluster.seatCount === 1 ? "1 seat" : `${cluster.seatCount} seats`;
  return `${seatsText} — ${cluster.openCount} open`;
}

export function formatZoneClusterLabel(cluster: ZoneCluster) {
  return `${cluster.zone} · ${formatZoneClusterSummary(cluster)}`;
}
