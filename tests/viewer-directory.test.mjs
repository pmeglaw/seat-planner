import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

// Same standalone-transpile harness as viewer-seat-search.test.mjs: the
// module keeps local formatting mirrors so it can run from a data: URL.
async function importTsModule(path) {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8"));
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

const viewerSearch = await importTsModule("lib/viewerSeatSearch.ts");

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
    x: 0.1,
    y: 0.2,
    status: overrides.status ?? (overrides.employee ? "assigned" : "available"),
    layer: "published",
    employee_id: overrides.employee?.id ?? overrides.employee_id ?? null,
    employee: overrides.employee ?? null,
    zone: overrides.zone ?? "West Pod",
    department: null,
    notes: null,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

const alex = employee({ id: "emp-alex", full_name: "Alex Rivera", position: "Associate", department: "Litigation" });
const jordan = employee({ id: "emp-jordan", full_name: "JORDAN BROOKS" });
const retired = employee({ id: "emp-retired", full_name: "Gone Person", active: false });
const seats = [seat({ id: "seat-w02", label: "w02", employee: alex, zone: "West Pod" })];

test("directory lists every active person, in the given order, seated or not", () => {
  const directory = viewerSearch.buildViewerDirectory({ seats, employees: [alex, jordan, retired] });

  assert.equal(directory.totalCount, 2);
  assert.equal(directory.seatedCount, 1);
  assert.deepEqual(directory.rows.map(row => row.title), ["Alex Rivera", "Jordan Brooks"]);
});

test("directory rows are the same shape search produces — one builder, no drift", () => {
  const directory = viewerSearch.buildViewerDirectory({ seats, employees: [alex, jordan] });
  const searchRow = viewerSearch
    .buildViewerSeatSearch({ query: "Alex", seats, employees: [alex, jordan] })
    .results.find(row => row.kind === "person");

  assert.deepEqual(directory.rows[0], searchRow);
  // Seated row: canonical seat code + zone, clickable.
  assert.equal(directory.rows[0].subtitle, "W02 · West Pod");
  assert.equal(directory.rows[0].disabled, false);
  // Unseated row: honest subtitle, not clickable, no map target.
  assert.equal(directory.rows[1].subtitle, "No assigned seat");
  assert.equal(directory.rows[1].disabled, true);
  assert.deepEqual(directory.rows[1].seatIds, []);
});
