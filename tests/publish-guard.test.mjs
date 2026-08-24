import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// lib/publishGuard.ts refuses publish_seat_map unless the environment can
// positively prove it is safe: either the database is local, or the server is
// the real Vercel production deployment (VERCEL_ENV=production), or the
// operator opted in explicitly. Local dev defaults to the PRODUCTION Supabase
// project, so without this guard a publish from `npm run dev` — or from a
// local `npm run build && npm run start`, where NODE_ENV is "production" —
// updates the live viewer map. NODE_ENV is deliberately NOT an input: it must
// never unlock a publish. These tests pin the decision table, plus (source
// pin) that publishSeatMapAction actually consults the guard before the RPC
// and returns the refusal instead of throwing (a local production build
// digest-strips thrown messages).

const { assessPublishEnvironment, isLocalSupabaseUrl, PROD_PUBLISH_OVERRIDE_ENV } =
  await importTsModule("lib/publishGuard.ts");

const PROD_URL = "https://abcdefgh.supabase.co";
const LOCAL_URL = "http://127.0.0.1:54321";

test("the real Vercel production deployment publishes freely", () => {
  const decision = assessPublishEnvironment({
    vercelEnv: "production",
    supabaseUrl: PROD_URL,
    overrideValue: undefined
  });
  assert.deepEqual(decision, { allowed: true });
});

test("a local production build (npm run start) is blocked — NODE_ENV never unlocks publish", () => {
  // No VERCEL_ENV, prod database URL: exactly what `npm run build && npm run
  // start` on a developer machine looks like. The old guard trusted NODE_ENV
  // and failed open here.
  const decision = assessPublishEnvironment({
    vercelEnv: undefined,
    supabaseUrl: PROD_URL,
    overrideValue: undefined
  });
  assert.equal(decision.allowed, false);
  // The message must hand the admin both ways out: the local stack and the
  // deliberate override.
  assert.match(decision.message, /db:start/);
  assert.match(decision.message, new RegExp(PROD_PUBLISH_OVERRIDE_ENV));
});

test("non-production Vercel environments are blocked from publishing to prod", () => {
  for (const vercelEnv of ["preview", "development", "", undefined]) {
    const decision = assessPublishEnvironment({
      vercelEnv,
      supabaseUrl: PROD_URL,
      overrideValue: undefined
    });
    assert.equal(
      decision.allowed,
      false,
      `VERCEL_ENV=${JSON.stringify(vercelEnv)} must not unlock prod publish`
    );
  }
});

test("only the exact string 'production' counts as the production deployment", () => {
  for (const vercelEnv of ["Production", "PRODUCTION", " production", "prod"]) {
    const decision = assessPublishEnvironment({
      vercelEnv,
      supabaseUrl: PROD_URL,
      overrideValue: undefined
    });
    assert.equal(decision.allowed, false, `VERCEL_ENV=${JSON.stringify(vercelEnv)} must block`);
  }
});

test("a server pointed at the local stack publishes freely", () => {
  for (const url of [LOCAL_URL, "http://localhost:54321", "http://[::1]:54321"]) {
    const decision = assessPublishEnvironment({
      vercelEnv: undefined,
      supabaseUrl: url,
      overrideValue: undefined
    });
    assert.deepEqual(decision, { allowed: true }, `expected ${url} to be treated as local`);
  }
});

test("the override must be the exact string 'true'", () => {
  const base = { vercelEnv: undefined, supabaseUrl: PROD_URL };
  assert.equal(assessPublishEnvironment({ ...base, overrideValue: "true" }).allowed, true);
  for (const value of ["TRUE", "1", "yes", "", undefined]) {
    assert.equal(
      assessPublishEnvironment({ ...base, overrideValue: value }).allowed,
      false,
      `override ${JSON.stringify(value)} must not unlock prod publish`
    );
  }
});

test("missing or unparseable URLs fail closed outside the production deployment", () => {
  for (const url of [undefined, "", "not a url", "supabase.co"]) {
    const decision = assessPublishEnvironment({
      vercelEnv: undefined,
      supabaseUrl: url,
      overrideValue: undefined
    });
    assert.equal(decision.allowed, false, `expected ${JSON.stringify(url)} to be blocked`);
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
// it. Assert the call sits inside the action's body, before the RPC
// invocation, reads VERCEL_ENV (not NODE_ENV) as its deployment signal, and
// returns the refusal as PUBLISH_BLOCKED instead of throwing — a local
// production build digest-strips thrown server-action messages, so a throw
// would reach the admin as a blank generic error.
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

  assert.ok(
    body.includes("process.env.VERCEL_ENV"),
    "the guard must be fed VERCEL_ENV — the positive production-deployment signal"
  );
  assert.ok(
    !body.includes("process.env.NODE_ENV"),
    "NODE_ENV must not feed the publish guard — a local production build would fail open"
  );
  assert.ok(
    body.includes('"PUBLISH_BLOCKED"'),
    "the guard refusal must be returned as PUBLISH_BLOCKED, not thrown"
  );
});
