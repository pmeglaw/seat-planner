import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// X-01: next.config.js `images.localPatterns` allowlists the floor-plan asset
// by pathname + exact `?v=` search, and lib/mapLayoutTransform.ts is where the
// shipped src (with its cache-busting `?v=`) actually lives. Every map
// re-render bumps the lib string (that contract is documented there), and the
// config copy silently went stale once already — inert only because every
// <Image> is currently `unoptimized`. The moment someone removes that, a stale
// pin 400s the floor plan. This test makes the two files fail loudly together
// instead.

const nextConfig = await readFile(new URL("../next.config.js", import.meta.url), "utf8");
const layoutTransform = await readFile(new URL("../lib/mapLayoutTransform.ts", import.meta.url), "utf8");

const shippedSrc = layoutTransform.match(/export const MAP_IMAGE_SRC = "([^"]+)"/)?.[1];
const pinnedPathname = nextConfig.match(/pathname: "([^"]+)"/)?.[1];
const pinnedSearch = nextConfig.match(/search: "([^"]+)"/)?.[1];

test("the shipped map src still carries a cache-busting version query", () => {
  assert.ok(shippedSrc, "MAP_IMAGE_SRC should be present in lib/mapLayoutTransform.ts");
  assert.match(shippedSrc, /\?v=/, "MAP_IMAGE_SRC must keep its ?v= cache-buster (see the contract comment there)");
});

test("next.config.js localPatterns pins the exact src the app ships", () => {
  assert.ok(pinnedPathname && pinnedSearch, "the floor-plan localPatterns entry should be present");
  const [pathname, search] = shippedSrc.split("?");
  assert.equal(pinnedPathname, pathname, "localPatterns pathname must match MAP_IMAGE_SRC");
  assert.equal(
    pinnedSearch,
    `?${search}`,
    "localPatterns search must match the MAP_IMAGE_SRC ?v= exactly — bump both together when re-rendering the asset"
  );
});
