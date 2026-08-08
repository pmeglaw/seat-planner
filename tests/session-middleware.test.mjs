import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Behavior tests for lib/supabase/middleware.ts — the session-refresh
// middleware whose runtime contract was previously pinned only by source-text
// greps (tests/auth-session-source.test.mjs). These execute the real module
// with @supabase/ssr and next/server swapped for doubles and pin the four
// behaviors that caused or fixed production incidents:
//   1. cookieless requests skip the auth step entirely,
//   2. the JWKS is memoized per module instance and fetch failures back off
//      instead of restoring a per-request fetch,
//   3. the auth step fails OPEN after its 5s budget (the pre-#333 hang class),
//      and a late rejection never surfaces as an unhandled rejection,
//   4. a session refresh writes cookies through to the response with the
//      Secure attribute derived from x-forwarded-proto.
// lib/supabase/cookieOptions.ts runs REAL underneath (its own unit tests live
// in tests/supabase-cookie-options.test.mjs).

const STUBS = {
  "@supabase/ssr": `
    export function createServerClient(url, key, config) {
      const record = { url, key, config };
      globalThis.__mw.clients.push(record);
      return {
        auth: {
          getClaims(...args) {
            globalThis.__mw.getClaimsCalls.push({ args, client: record });
            return globalThis.__mw.getClaimsImpl(record, ...args);
          }
        }
      };
    }
  `,
  "next/server": `
    export const NextResponse = {
      next({ request } = {}) {
        const response = {
          request,
          setCookies: [],
          setHeaders: [],
          cookies: {
            set(name, value, options) {
              response.setCookies.push({ name, value, options });
            }
          },
          headers: {
            set(key, value) {
              response.setHeaders.push([key, value]);
            }
          }
        };
        globalThis.__mw.responses.push(response);
        return response;
      }
    };
  `
};

function makeRequest({ cookies = [], proto = null } = {}) {
  const jar = new Map(cookies.map(({ name, value }) => [name, value]));
  return {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      set: (name, value) => jar.set(name, value)
    },
    headers: {
      get: (key) => (key.toLowerCase() === "x-forwarded-proto" ? proto : null)
    }
  };
}

function resetHandshake() {
  globalThis.__mw = {
    clients: [],
    responses: [],
    getClaimsCalls: [],
    getClaimsImpl: async () => ({ data: null, error: null })
  };
}

function stubFetch(t, impl) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (...args) => {
    calls.push(args);
    return impl(...args);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

function withEnv(t, url, anonKey) {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  if (anonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  t.after(() => {
    if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.anonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.anonKey;
  });
}

// Each importTsModule({ fresh: true }) call yields an isolated module instance,
// so the module-scope JWKS memo starts empty per test that needs it.
async function freshMiddleware() {
  const { updateSession } = await importTsModule("lib/supabase/middleware.ts", { stubs: STUBS, fresh: true });
  return updateSession;
}

const SUPABASE_URL = "https://project.supabase.test";
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const AUTH_COOKIE = { name: "sb-project-auth-token", value: "jwt" };

function jwksResponse(keys = [{ kid: "k1" }]) {
  return { ok: true, json: async () => ({ keys }) };
}

test("missing Supabase env: passes the request through without building a client", async (t) => {
  resetHandshake();
  withEnv(t, undefined, undefined);
  const updateSession = await freshMiddleware();

  const response = await updateSession(makeRequest({ cookies: [AUTH_COOKIE] }));

  assert.equal(globalThis.__mw.clients.length, 0);
  assert.equal(globalThis.__mw.responses.length, 1);
  assert.equal(response, globalThis.__mw.responses[0]);
});

test("no sb-* cookie: the auth step is skipped entirely — no getClaims, no JWKS fetch", async (t) => {
  resetHandshake();
  withEnv(t, SUPABASE_URL, "anon-key");
  const fetchCalls = stubFetch(t, async () => jwksResponse());
  const updateSession = await freshMiddleware();

  await updateSession(makeRequest({ cookies: [{ name: "unrelated", value: "1" }] }));

  assert.equal(globalThis.__mw.getClaimsCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test("authenticated request: getClaims verifies against the fetched JWKS, memoized across requests", async (t) => {
  resetHandshake();
  withEnv(t, SUPABASE_URL, "anon-key");
  const fetchCalls = stubFetch(t, async () => jwksResponse([{ kid: "key-a" }]));
  const updateSession = await freshMiddleware();

  await updateSession(makeRequest({ cookies: [AUTH_COOKIE] }));
  await updateSession(makeRequest({ cookies: [AUTH_COOKIE] }));

  // One outbound JWKS fetch serves both requests (module-scope memo) — the
  // whole point of the memo is zero steady-state fetches.
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0][0], JWKS_URL);
  assert.equal(globalThis.__mw.getClaimsCalls.length, 2);
  for (const call of globalThis.__mw.getClaimsCalls) {
    assert.deepEqual(call.args, [undefined, { jwks: { keys: [{ kid: "key-a" }] } }]);
  }
  // The client is rebuilt per request (cookies are request-bound).
  assert.equal(globalThis.__mw.clients.length, 2);
});

test("JWKS fetch failure: degrades to getClaims' internal fallback and backs off instead of refetching", async (t) => {
  resetHandshake();
  withEnv(t, SUPABASE_URL, "anon-key");
  const fetchCalls = stubFetch(t, async () => {
    throw new Error("jwks endpoint down");
  });
  const updateSession = await freshMiddleware();

  await updateSession(makeRequest({ cookies: [AUTH_COOKIE] }));
  await updateSession(makeRequest({ cookies: [AUTH_COOKIE] }));

  // First request attempts the fetch; the second lands inside the failure
  // retry window and must NOT fetch again (outage costs one fetch per window).
  assert.equal(fetchCalls.length, 1);
  // Both requests still run the auth step, just without a jwks option.
  assert.equal(globalThis.__mw.getClaimsCalls.length, 2);
  for (const call of globalThis.__mw.getClaimsCalls) {
    assert.deepEqual(call.args, [undefined, undefined]);
  }
});

test("JWKS endpoint returning non-ok or malformed bodies degrades the same way", async (t) => {
  resetHandshake();
  withEnv(t, SUPABASE_URL, "anon-key");
  let body = { ok: false, json: async () => ({}) };
  stubFetch(t, async () => body);
  const updateSession = await freshMiddleware();

  await updateSession(makeRequest({ cookies: [AUTH_COOKIE] }));
  assert.deepEqual(globalThis.__mw.getClaimsCalls.at(-1).args, [undefined, undefined]);

  // Malformed body (no keys array) on a later attempt: still no jwks option.
  // (Fresh instance so the failure backoff from the first call doesn't apply.)
  body = { ok: true, json: async () => ({ notKeys: [] }) };
  const updateSessionFresh = await freshMiddleware();
  await updateSessionFresh(makeRequest({ cookies: [AUTH_COOKIE] }));
  assert.deepEqual(globalThis.__mw.getClaimsCalls.at(-1).args, [undefined, undefined]);
});

test("fail-open: a hung auth step releases the request at the 5s budget, and a late rejection is contained", async (t) => {
  resetHandshake();
  withEnv(t, SUPABASE_URL, "anon-key");
  stubFetch(t, async () => jwksResponse());

  let rejectAuthStep;
  globalThis.__mw.getClaimsImpl = () =>
    new Promise((resolve, reject) => {
      rejectAuthStep = reject;
    });

  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  t.after(() => process.removeListener("unhandledRejection", onUnhandled));

  t.mock.timers.enable({ apis: ["setTimeout"] });
  const updateSession = await freshMiddleware();

  const pending = updateSession(makeRequest({ cookies: [AUTH_COOKIE] }));
  // Let the auth step start and arm the timeout, then advance past the budget.
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(5_000);
  const response = await pending;

  assert.ok(response, "request must proceed once the timeout wins the race");
  assert.equal(globalThis.__mw.getClaimsCalls.length, 1);

  // The hang-then-fail case: the auth step rejects AFTER the timeout already
  // released the request. The catch attached to the auth promise itself must
  // swallow it — a platform unhandled-rejection here is the regression.
  rejectAuthStep(new Error("auth server finally failed"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
});

test("session refresh writes cookies through to the response, request jar included", async (t) => {
  resetHandshake();
  withEnv(t, SUPABASE_URL, "anon-key");
  stubFetch(t, async () => jwksResponse());

  // Simulate getClaims refreshing an expired session: the client writes the
  // new token through the cookies.setAll adapter the middleware supplied.
  globalThis.__mw.getClaimsImpl = async (client) => {
    client.config.cookies.setAll(
      [{ name: "sb-project-auth-token", value: "refreshed-jwt", options: { path: "/" } }],
      { "x-refreshed": "1" }
    );
    return { data: {}, error: null };
  };

  const updateSession = await freshMiddleware();
  const request = makeRequest({ cookies: [AUTH_COOKIE], proto: "https" });
  const response = await updateSession(request);

  // The refreshed cookie lands on the RETURNED response (the one rebuilt
  // inside setAll), plus the request's own jar for downstream handlers.
  assert.deepEqual(response.setCookies, [
    { name: "sb-project-auth-token", value: "refreshed-jwt", options: { path: "/" } }
  ]);
  assert.deepEqual(response.setHeaders, [["x-refreshed", "1"]]);
  assert.ok(request.cookies.getAll().some(({ value }) => value === "refreshed-jwt"));

  // getAll must surface the request's live jar to the client.
  const cookieAdapter = globalThis.__mw.clients[0].config.cookies;
  assert.deepEqual(
    cookieAdapter.getAll().map(({ name }) => name),
    ["sb-project-auth-token"]
  );
});

test("cookie Secure attribute follows x-forwarded-proto, not the request's own scheme", async (t) => {
  resetHandshake();
  withEnv(t, SUPABASE_URL, "anon-key");
  stubFetch(t, async () => jwksResponse());
  const updateSession = await freshMiddleware();

  await updateSession(makeRequest({ cookies: [AUTH_COOKIE], proto: "https" }));
  await updateSession(makeRequest({ cookies: [AUTH_COOKIE], proto: null }));
  await updateSession(makeRequest({ cookies: [AUTH_COOKIE], proto: "http" }));

  const secureFlags = globalThis.__mw.clients.map((client) => client.config.cookieOptions.secure);
  // TLS-terminated https visitor → Secure; local http (absent or plain
  // header) → not Secure, or the cookie would be silently discarded.
  assert.deepEqual(secureFlags, [true, false, false]);
  for (const client of globalThis.__mw.clients) {
    assert.equal(client.config.cookieOptions.sameSite, "lax");
    assert.equal(client.config.cookieOptions.path, "/");
    assert.equal(client.url, SUPABASE_URL);
    assert.equal(client.key, "anon-key");
  }
});
