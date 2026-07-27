import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// Authenticated e2e tier. Unlike playwright.config.ts — the backend-free smoke
// suite that boots the app with dummy Supabase env and can only prove the auth
// guards redirect — this one drives real sign-in, real draft edits and a real
// publish against a LOCAL Supabase stack (`supabase start`, Docker).
//
// Why a separate config rather than more projects in the smoke config: the
// smoke tier must stay fast and Docker-free so it keeps running everywhere.
// This tier needs a database and is opted into explicitly.
//
// The stack is disposable — `supabase stop` destroys it — so these specs are
// free to mutate seats and to publish, which is exactly the coverage the
// hosted-production setup could never safely have.

const PORT = 3200;
const baseURL = `http://localhost:${PORT}`;

// Resolve the running stack's URL and anon key from the CLI rather than
// committing them. They ARE deterministic (the local stack is generated from a
// constant JWT secret, so every machine gets the same demo key), but pinning a
// key in the repo is a habit worth not forming, and it would silently rot the
// day the CLI rotates its defaults. Env vars win so CI or a remote stack can
// override without touching this file.
function localStackEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  const fromEnv = {
    url: process.env.E2E_SUPABASE_URL,
    anonKey: process.env.E2E_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY
  };
  if (fromEnv.url && fromEnv.anonKey && fromEnv.serviceRoleKey) {
    return { url: fromEnv.url, anonKey: fromEnv.anonKey, serviceRoleKey: fromEnv.serviceRoleKey };
  }

  // Constant command, no interpolation — nothing user-controlled reaches the
  // shell. execSync (not execFile) because resolving `npx` without a shell
  // needs the .cmd suffix on Windows, which brings the shell back anyway.
  const status = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const read = (key: string) => status.match(new RegExp(`^${key}="?([^"\\n]+)"?$`, "m"))?.[1] ?? "";

  const url = fromEnv.url || read("API_URL");
  const anonKey = fromEnv.anonKey || read("ANON_KEY");
  const serviceRoleKey = fromEnv.serviceRoleKey || read("SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error(
      "Could not resolve the local Supabase stack. Run `npx supabase start` first, " +
        "or set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY and E2E_SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return { url, anonKey, serviceRoleKey };
}

const { url: supabaseUrl, anonKey: supabaseAnonKey, serviceRoleKey } = localStackEnv();

// Republish onto process.env so the spec files can reach the stack for setup
// and for asserting on rows the UI does not show (publish_events, the published
// layer). Workers are spawned after this config is evaluated, so they inherit
// these. The service-role key is local-stack-only and dies with the container.
process.env.E2E_SUPABASE_URL = supabaseUrl;
process.env.E2E_SUPABASE_ANON_KEY = supabaseAnonKey;
process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

// Locally the sandbox ships a prebuilt Chromium; point at it with PW_CHROMIUM_PATH.
// In CI we `npx playwright install chromium`, so leave it unset and use the default.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e-auth",
  // Seeds the local stack. The CLI no longer auto-seeds — see the [db.seed]
  // comment in supabase/config.toml for why that had to change.
  globalSetup: "./tests/e2e-auth/global-setup.ts",
  // NOT fullyParallel: these specs share one database. Publishing in one spec
  // while another asserts on the publish pill is a race that would read as
  // flakiness rather than as the shared-state bug it is.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    launchOptions: executablePath ? { executablePath } : undefined
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // BUILDS as well as starts, and that is load-bearing. NEXT_PUBLIC_* is
    // inlined into the client bundle at BUILD time, so a build made from
    // .env.local ships a browser bundle pointed at the PRODUCTION Supabase
    // project no matter what env `npm run start` is given. Reusing the ordinary
    // build made this tier attempt its sign-in against production and fail with
    // an unexplained "still on /login". Building here, with the local stack's
    // env applied, is what keeps the tier hermetic.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey
    }
  }
});
