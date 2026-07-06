import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

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

test("overview clustering is wired into the admin map, gated off search/selection/modes", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  assert.match(seatMapSource, /from "@\/lib\/seatClusters"/);
  // Pills only replace markers in the idle overview state: search, a selection,
  // or an active mode (add/move/swap) always dissolves clusters into markers.
  assert.match(seatMapSource, /const overviewClusterMode = mapViewMode === "overview" && !filtersActive && !selectedSeatId && !addSeatMode && !moveSeatMode && !swapSourceSeatId/);
  assert.match(seatMapSource, /overviewClusterMode \? zoneClusters\.map/);
  assert.match(seatMapSource, /formatZoneClusterSummary/);
  // Clicking a pill zooms to detail centered on the zone (explicit commit, no auto-select).
  const zoomFn = seatMapSource.match(/function zoomToZoneCluster\(cluster: ZoneCluster\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.ok(zoomFn, "zoomToZoneCluster should remain source-visible.");
  assert.match(zoomFn, /setMapViewMode\("detail"\)/);
  assert.match(zoomFn, /scrollMapToPoint\(cluster\.x, cluster\.y\)/);
  assert.doesNotMatch(zoomFn, /setSelectedSeatId/);
});
