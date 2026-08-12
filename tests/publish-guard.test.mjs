import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// lib/publishGuard.ts refuses publish_seat_map from a development server
// pointed at a non-local database. Local dev defaults to the PRODUCTION
// Supabase project, so without this guard a publish from `npm run dev` updates
// the live viewer map — the exact footgun CLAUDE.md documents. These tests pin
// the decision table, plus (source pin) that publishSeatMapAction actually
// consults the guard before invoking the RPC.

const { assessPublishEnvironment, isLocalSupabaseUrl, PROD_PUBLISH_OVERRIDE_ENV } =
  await importTsModule("lib/publishGuard.ts");

const PROD_URL = "https://abcdefgh.supabase.co";
const LOCAL_URL = "http://127.0.0.1:54321";

test("production builds always publish (Vercel deploys, local npm run start)", () => {
  const decision = assessPublishEnvironment({
    nodeEnv: "production",
    supabaseUrl: PROD_URL,
    overrideValue: undefined
  });
  assert.deepEqual(decision, { allowed: true });
});

test("a dev server pointed at production is blocked", () => {
  const decision = assessPublishEnvironment({
    nodeEnv: "development",
    supabaseUrl: PROD_URL,
    overrideValue: undefined
  });
  assert.equal(decision.allowed, false);
  // The message must hand the admin both ways out: the local stack and the
  // deliberate override.
  assert.match(decision.message, /db:start/);
  assert.match(decision.message, new RegExp(PROD_PUBLISH_OVERRIDE_ENV));
});

test("a dev server pointed at the local stack publishes freely", () => {
  for (const url of [LOCAL_URL, "http://localhost:54321", "http://[::1]:54321"]) {
    const decision = assessPublishEnvironment({
      nodeEnv: "development",
      supabaseUrl: url,
      overrideValue: undefined
    });
    assert.deepEqual(decision, { allowed: true }, `expected ${url} to be treated as local`);
  }
});

test("the override must be the exact string 'true'", () => {
  const base = { nodeEnv: "development", supabaseUrl: PROD_URL };
  assert.equal(assessPublishEnvironment({ ...base, overrideValue: "true" }).allowed, true);
  for (const value of ["TRUE", "1", "yes", "", undefined]) {
    assert.equal(
      assessPublishEnvironment({ ...base, overrideValue: value }).allowed,
      false,
      `override ${JSON.stringify(value)} must not unlock prod publish`
    );
  }
});

test("missing or unparseable URLs fail closed outside production", () => {
  for (const url of [undefined, "", "not a url", "supabase.co"]) {
    const decision = assessPublishEnvironment({
      nodeEnv: "development",
      supabaseUrl: url,
      overrideValue: undefined
    });
    assert.equal(decision.allowed, false, `expected ${JSON.stringify(url)} to be blocked`);
  }
});

test("only NODE_ENV=production is trusted; other envs get the same guard", () => {
  for (const nodeEnv of ["test", "staging", undefined]) {
    const decision = assessPublishEnvironment({
      nodeEnv,
      supabaseUrl: PROD_URL,
      overrideValue: undefined
    });
    assert.equal(decision.allowed, false, `NODE_ENV=${nodeEnv} must not bypass the guard`);
  }
});

test("isLocalSupabaseUrl recognizes only genuinely local hosts", () => {
  assert.equal(isLocalSupabaseUrl(LOCAL_URL), true);
  assert.equal(isLocalSupabaseUrl("http://localhost:54321"), true);
  // A prod URL crafted to LOOK local must not pass.
  assert.equal(isLocalSupabaseUrl("https://localhost.supabase.co"), false);
  assert.equal(isLocalSupabaseUrl("https://127.0.0.1.evil.example"), false);
  assert.equal(isLocalSupabaseUrl(PROD_URL), false);
});

// Source pin: the guard is only worth anything if publishSeatMapAction calls
// it. Assert the call sits inside the action's body, before the RPC invocation.
test("publishSeatMapAction consults the guard before invoking publish_seat_map", () => {
  const source = readFileSync(new URL("../app/actions.ts", import.meta.url), "utf8");
  assert.match(source, /from "@\/lib\/publishGuard"/, "actions.ts must import the publish guard");

  const start = source.indexOf("export async function publishSeatMapAction");
  assert.ok(start !== -1, "publishSeatMapAction not found");
  const end = source.indexOf("export ", start + 1);
  const body = source.slice(start, end === -1 ? undefined : end);

  const guardCall = body.indexOf("assessPublishEnvironment(");
  const rpcCall = body.indexOf('rpc("publish_seat_map"');
  assert.ok(guardCall !== -1, "publishSeatMapAction must call assessPublishEnvironment");
  assert.ok(rpcCall !== -1, "publishSeatMapAction must invoke the publish RPC");
  assert.ok(guardCall < rpcCall, "the environment guard must run before the publish RPC");
});
