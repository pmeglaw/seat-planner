import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Behavior tests for the shared server-render auth prologue: getSessionContext
// (lib/serverAuth.ts) and getAdminPageContext (lib/adminPageGuard.ts). Both are
// UX-layer gating (CLAUDE.md layers 1–2 enforce security); these tests pin the
// shape callers rely on — anonymous → nulls / login redirect, and the
// profiles.role → "admin"/"viewer" mapping — with the framework boundaries
// (react cache, next redirect, the Supabase server client) swapped for doubles.

// A minimal double for the supabase server client: auth.getUser plus the
// .from("profiles").select("role").eq("id", ...).single() chain serverAuth uses.
function fakeSupabase({ user = null, profile = null, profileError = null } = {}) {
  const queries = [];
  const client = {
    queries,
    auth: {
      async getUser() {
        return { data: { user } };
      }
    },
    from(table) {
      const query = { table, select: null, filters: [] };
      queries.push(query);
      const builder = {
        select(columns) {
          query.select = columns;
          return builder;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return builder;
        },
        async single() {
          return { data: profile, error: profileError };
        }
      };
      return builder;
    }
  };
  return client;
}

const serverAuthStubs = {
  // Identity wrapper is enough at runtime; the wrap-count pins that the module
  // actually routes through React's cache() (the per-render dedupe contract).
  react: `
    export const cache = (fn) => {
      globalThis.__serverAuthCacheWraps = (globalThis.__serverAuthCacheWraps ?? 0) + 1;
      return fn;
    };
  `,
  "@/lib/supabase/server": `
    export async function createClient() {
      return globalThis.__serverAuthClientFactory();
    }
  `
};

const { getSessionContext } = await importTsModule("lib/serverAuth.ts", { stubs: serverAuthStubs });

test("getSessionContext wraps the probe in React cache() exactly once", () => {
  assert.equal(globalThis.__serverAuthCacheWraps, 1);
});

test("getSessionContext: anonymous visitor gets null user and role, and profiles is never queried", async () => {
  const client = fakeSupabase({ user: null });
  globalThis.__serverAuthClientFactory = () => client;

  const context = await getSessionContext();

  assert.equal(context.user, null);
  assert.equal(context.role, null);
  assert.equal(context.supabase, client);
  assert.equal(client.queries.length, 0);
});

test("getSessionContext: authenticated admin resolves role 'admin' from their own profile row", async () => {
  const user = { id: "user-1", email: "admin@example.test" };
  const client = fakeSupabase({ user, profile: { role: "admin" } });
  globalThis.__serverAuthClientFactory = () => client;

  const context = await getSessionContext();

  assert.equal(context.user, user);
  assert.equal(context.role, "admin");
  // The role lookup must be scoped to the authenticated user's id — a broader
  // query could read another profile's role.
  assert.deepEqual(client.queries, [{ table: "profiles", select: "role", filters: [["id", "user-1"]] }]);
});

test("getSessionContext: any non-admin role collapses to 'viewer'", async () => {
  for (const profile of [{ role: "viewer" }, { role: "editor" }, { role: null }, null]) {
    const client = fakeSupabase({ user: { id: "u" }, profile });
    globalThis.__serverAuthClientFactory = () => client;
    const context = await getSessionContext();
    assert.equal(context.role, "viewer", `profile ${JSON.stringify(profile)} must map to viewer`);
  }
});

test("getSessionContext: a missing profile row (single() error) still resolves 'viewer', not a throw", async () => {
  const client = fakeSupabase({ user: { id: "u" }, profile: null, profileError: { message: "0 rows" } });
  globalThis.__serverAuthClientFactory = () => client;

  const context = await getSessionContext();

  assert.equal(context.role, "viewer");
});

const adminPageGuardStubs = {
  "next/navigation": `
    // Mirrors Next's real redirect(): throws a digest-tagged error the
    // framework catches, so code after redirect() never runs.
    export function redirect(url) {
      const error = new Error("NEXT_REDIRECT");
      error.digest = "NEXT_REDIRECT";
      error.url = url;
      throw error;
    }
  `,
  "next/server": `
    export async function connection() {
      globalThis.__adminGuardConnectionCalls = (globalThis.__adminGuardConnectionCalls ?? 0) + 1;
    }
  `,
  "@/lib/serverAuth": `
    export async function getSessionContext() {
      return globalThis.__adminGuardSession;
    }
  `
};

const { getAdminPageContext } = await importTsModule("lib/adminPageGuard.ts", { stubs: adminPageGuardStubs });

test("getAdminPageContext: anonymous visitor is redirected to /login with the page as next", async () => {
  globalThis.__adminGuardSession = { supabase: {}, user: null, role: null };

  await assert.rejects(
    () => getAdminPageContext("/admin/management"),
    (error) => {
      assert.equal(error.digest, "NEXT_REDIRECT");
      assert.equal(error.url, "/login?next=/admin/management");
      return true;
    }
  );
});

test("getAdminPageContext: admin session yields isAdmin true and the shared client, after connection()", async () => {
  const supabase = { tag: "shared-client" };
  const user = { id: "admin-1" };
  globalThis.__adminGuardSession = { supabase, user, role: "admin" };
  const connectionCallsBefore = globalThis.__adminGuardConnectionCalls ?? 0;

  const context = await getAdminPageContext("/admin");

  assert.deepEqual(context, { supabase, isAdmin: true, user });
  // connection() opts the page out of static prerender BEFORE any auth read.
  assert.equal(globalThis.__adminGuardConnectionCalls, connectionCallsBefore + 1);
});

test("getAdminPageContext: signed-in viewer passes the login gate but is not admin", async () => {
  const user = { id: "viewer-1" };
  globalThis.__adminGuardSession = { supabase: {}, user, role: "viewer" };

  const context = await getAdminPageContext("/admin/settings");

  assert.equal(context.isAdmin, false);
  assert.equal(context.user, user);
});
