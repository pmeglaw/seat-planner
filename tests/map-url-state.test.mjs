import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const urlState = await importTsModule("lib/mapUrlState.ts");
const deepLink = await importTsModule("lib/deepLink.ts");

// PHASE1IA B3: one writer composes the whole map URL (?floor ?seat ?q ?names
// ?dept ?zone ?status ?position); "all", empty, default floor and names-on
// are absent so the bare URL stays canonical.

const ALL = { department: "all", position: "all", zone: "all", status: "all" };
const base = { floor: "3", seatLabel: null, query: "", namesVisible: true, filters: ALL };

test("composeMapSearch: the canonical state writes nothing", () => {
  assert.equal(urlState.composeMapSearch("", base), "");
  assert.equal(urlState.composeMapSearch("?seat=N01&q=x&names=off&dept=Legal&floor=2", base), "", "stale params are cleared");
});

test("composeMapSearch: every param in one call; unrelated params survive", () => {
  const search = urlState.composeMapSearch("?utm=1", {
    floor: "2",
    seatLabel: "L02",
    query: "sarah",
    namesVisible: false,
    filters: { department: "Litigation", position: "all", zone: "North", status: "assigned" }
  });
  const params = new URLSearchParams(search);
  assert.equal(params.get("utm"), "1");
  assert.equal(params.get("floor"), "2");
  assert.equal(params.get("seat"), "L02");
  assert.equal(params.get("q"), "sarah");
  assert.equal(params.get("names"), "off");
  assert.equal(params.get("dept"), "Litigation");
  assert.equal(params.get("position"), null);
  assert.equal(params.get("zone"), "North");
  assert.equal(params.get("status"), "assigned");
});

test("nextMapHref returns null when nothing changes, else the full href with the hash kept", () => {
  const location = { pathname: "/", search: "?seat=N01", hash: "#planning-canvas" };
  assert.equal(urlState.nextMapHref(location, { ...base, seatLabel: "N01" }), null);
  assert.equal(urlState.nextMapHref(location, { ...base, seatLabel: "N02" }), "/?seat=N02#planning-canvas");
});

test("keepMapParams keeps the B3 set for the History switch and drops the rest", () => {
  assert.equal(urlState.keepMapParams("?floor=2&seat=L02&q=s&names=off&dept=D&zone=Z&status=assigned&position=P&tab=x&utm=1"), "?floor=2&seat=L02&q=s&names=off&dept=D&zone=Z&status=assigned&position=P");
  assert.equal(urlState.keepMapParams(""), "");
});

test("deepLink: ?q= and ?names= helpers", () => {
  assert.equal(deepLink.readQueryParam("?q=%20sarah%20"), "sarah");
  assert.equal(deepLink.readQueryParam(""), "");
  assert.equal(deepLink.withQueryParam("?seat=N01", "  "), "?seat=N01");
  assert.equal(deepLink.withQueryParam("", "sarah r"), "?q=sarah+r");
  assert.equal(deepLink.readNamesParam("?names=off"), false);
  assert.equal(deepLink.readNamesParam("?names=on"), true);
  assert.equal(deepLink.readNamesParam("?names=maybe"), null);
  assert.equal(deepLink.readNamesParam(""), null);
  assert.equal(deepLink.withNamesParam("?names=off", true), "");
  assert.equal(deepLink.withNamesParam("", false), "?names=off");
  assert.equal(deepLink.DEFAULT_FLOOR_PARAM_VALUE, "3");
});
