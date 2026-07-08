import { defineConfig, devices } from "@playwright/test";

// Backend-free smoke suite: drives the built app with only dummy Supabase env,
// so it verifies the app boots, renders login, and enforces its auth-redirect
// guards without needing a real Supabase project. Authenticated flows (publish,
// seat edits) need a seeded test project + CI secrets — tracked as a follow-up.

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

// Locally the sandbox ships a prebuilt Chromium; point at it with PW_CHROMIUM_PATH.
// In CI we `npx playwright install chromium`, so leave it unset and use the default.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Requires a prior `npm run build` (CI does this before test:e2e).
    command: `npm run start -- -p ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://dummy.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key",
    },
  },
});
