import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import { readFile } from "node:fs/promises";
import test from "node:test";
const {
  buildZoneClusters,
  formatZoneClusterLabel,
  formatZoneClusterSummary,
  UNZONED_CLUSTER_LABEL
} = await importTsModule("lib/seatClusters.ts");

test("zone clusters group seats by zone with department and unzoned fallbacks", () => {
  const clusters = buildZoneClusters([
    { status: "assigned", x: 0.1, y: 0.1, zone: "West Pod" },
    { status: "available", x: 0.2, y: 0.2, zone: "West Pod" },
    { status: "available", x: 0.5, y: 0.5, zone: null, department: "Litigation" },
    { status: "reserved", x: 0.9, y: 0.9, zone: null, department: null }
  ]);

  assert.deepEqual(clusters.map(cluster => cluster.zone), ["Litigation", UNZONED_CLUSTER_LABEL, "West Pod"]);
  const westPod = clusters.find(cluster => cluster.zone === "West Pod");
  assert.equal(westPod.seatCount, 2);
  assert.equal(westPod.openCount, 1);
});

test("zone cluster anchors at the member-seat centroid in the input space", () => {
  const clusters = buildZoneClusters([
    { status: "available", x: 0.2, y: 0.4, zone: "East Pod" },
    { status: "assigned", x: 0.4, y: 0.8, zone: "East Pod" }
  ]);

  assert.equal(clusters.length, 1);
  assert.ok(Math.abs(clusters[0].x - 0.3) < 1e-9);
  assert.ok(Math.abs(clusters[0].y - 0.6) < 1e-9);
});

test("only available seats count as open", () => {
  const clusters = buildZoneClusters([
    { status: "assigned", x: 0, y: 0, zone: "Center Desks" },
    { status: "reserved", x: 0, y: 0, zone: "Center Desks" },
    { status: "unavailable", x: 0, y: 0, zone: "Center Desks" },
    { status: "available", x: 0, y: 0, zone: "Center Desks" }
  ]);

  assert.equal(clusters[0].seatCount, 4);
  assert.equal(clusters[0].openCount, 1);
});

test("cluster labels follow the Figma copy shape with singular handling", () => {
  assert.equal(
    formatZoneClusterLabel({ zone: "West Pod", seatCount: 12, openCount: 3, x: 0, y: 0 }),
    "West Pod · 12 seats — 3 open"
  );
  assert.equal(
    formatZoneClusterSummary({ zone: "Nook", seatCount: 1, openCount: 0, x: 0, y: 0 }),
    "1 seat — 0 open"
  );
});

test("the admin map never swaps individual markers for cluster pills", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  // Owner QA (2026-07-10, Shell round 2): the fit view must always show every
  // individual seat — the zone-cluster overview was retired from the map UI.
  // lib/seatClusters stays (tested above) for potential future scale work.
  assert.doesNotMatch(seatMapSource, /overviewClusterMode|zoneClusters\.map|zoomToZoneCluster/);
});
