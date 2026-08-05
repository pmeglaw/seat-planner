import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { db } = await importTsModule("tests/e2e-auth/db-helpers.ts");

// Mirrors the withMockedOpenAI pattern in map-operations-agent.test.mjs: swap
// globalThis.fetch and the env vars db() reads, record every request, and
// restore both in finally so a failing assertion never leaks state into
// later tests.
async function withMockedFetch(responder, envOverrides, callback) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.E2E_SUPABASE_URL;
  const originalKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  const requests = [];

  process.env.E2E_SUPABASE_URL = envOverrides?.url ?? "http://127.0.0.1:54321";
  process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = envOverrides?.serviceRoleKey ?? "test-service-role-key";

  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return responder(url, init, requests.length);
  };

  try {
    return await callback(requests);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.E2E_SUPABASE_URL;
    else process.env.E2E_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
    else process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
}

test("db() builds the REST URL from the base URL and the given path", async () => {
  await withMockedFetch(
    () => new Response("[]", { status: 200 }),
    { url: "http://127.0.0.1:54321" },
    async requests => {
      await db("seats?layer=eq.draft&select=id");
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, "http://127.0.0.1:54321/rest/v1/seats?layer=eq.draft&select=id");
    }
  );
});

test("db() sends the service-role auth headers and the JSON/representation defaults", async () => {
  await withMockedFetch(
    () => new Response("[]", { status: 200 }),
    { serviceRoleKey: "s3cr3t" },
    async requests => {
      await db("seats");
      const headers = requests[0].init.headers;
      assert.equal(headers.apikey, "s3cr3t");
      assert.equal(headers.Authorization, "Bearer s3cr3t");
      assert.equal(headers["Content-Type"], "application/json");
      assert.equal(headers.Prefer, "return=representation");
    }
  );
});

test("db() reads the service-role URL and key from process.env at call time, not at import time", async () => {
  await withMockedFetch(
    () => new Response("[]", { status: 200 }),
    { url: "http://first.invalid", serviceRoleKey: "first-key" },
    async () => {
      await db("seats");
    }
  );
  await withMockedFetch(
    () => new Response("[]", { status: 200 }),
    { url: "http://second.invalid", serviceRoleKey: "second-key" },
    async requests => {
      await db("seats");
      assert.equal(requests[0].url, "http://second.invalid/rest/v1/seats");
      assert.equal(requests[0].init.headers.apikey, "second-key");
    }
  );
});

test("db() forwards the method and body from init, alongside the default headers", async () => {
  await withMockedFetch(
    () => new Response(JSON.stringify([{ id: "seat-1" }]), { status: 200 }),
    {},
    async requests => {
      const result = await db("seats?id=eq.seat-1", {
        method: "PATCH",
        body: JSON.stringify({ status: "available" })
      });
      assert.equal(requests[0].init.method, "PATCH");
      assert.equal(requests[0].init.body, JSON.stringify({ status: "available" }));
      assert.deepEqual(result, [{ id: "seat-1" }]);
    }
  );
});

test("db() lets a caller-supplied header override a default (e.g. a different Prefer)", async () => {
  await withMockedFetch(
    () => new Response("null", { status: 200 }),
    {},
    async requests => {
      await db("rpc/publish_seat_map", { method: "POST", headers: { Prefer: "return=minimal" } });
      assert.equal(requests[0].init.headers.Prefer, "return=minimal");
      // The other defaults are untouched by a partial header override.
      assert.equal(requests[0].init.headers["Content-Type"], "application/json");
    }
  );
});

test("db() parses a JSON response body and returns it", async () => {
  await withMockedFetch(
    () => new Response(JSON.stringify({ id: "abc", label: "N01" }), { status: 200 }),
    {},
    async () => {
      const result = await db("seats?id=eq.abc");
      assert.deepEqual(result, { id: "abc", label: "N01" });
    }
  );
});

test("db() returns null for a 204 No Content response without parsing a body", async () => {
  await withMockedFetch(
    () => new Response(null, { status: 204 }),
    {},
    async () => {
      const result = await db("seats?id=eq.abc", { method: "DELETE" });
      assert.equal(result, null);
    }
  );
});

test("db() throws an Error including the status, path, and response text on a non-ok response", async () => {
  await withMockedFetch(
    () => new Response("duplicate key value violates unique constraint", { status: 409 }),
    {},
    async () => {
      await assert.rejects(
        () => db("seats", { method: "POST", body: "{}" }),
        error => {
          assert.match(error.message, /^409 seats:/);
          assert.match(error.message, /duplicate key value violates unique constraint/);
          return true;
        }
      );
    }
  );
});

test("db() surfaces a 500 the same way as a 4xx failure", async () => {
  await withMockedFetch(
    () => new Response("internal error", { status: 500 }),
    {},
    async () => {
      // Assert on error.message via a callback, like the 409 test above — a
      // bare regex given to assert.rejects is matched against String(error)
      // ("Error: 500 …"), which the ^ anchor can never match.
      await assert.rejects(
        () => db("rpc/publish_seat_map", { method: "POST" }),
        error => {
          assert.match(error.message, /^500 rpc\/publish_seat_map: internal error$/);
          return true;
        }
      );
    }
  );
});

test("db() defaults init to an empty object when the caller omits it", async () => {
  await withMockedFetch(
    () => new Response("[]", { status: 200 }),
    {},
    async requests => {
      await db("seats");
      // No method/body were requested, so fetch only received the defaulted headers.
      assert.equal(requests[0].init.method, undefined);
      assert.equal(requests[0].init.body, undefined);
    }
  );
});