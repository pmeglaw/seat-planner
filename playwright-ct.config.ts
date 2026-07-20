import { defineConfig, devices } from "@playwright/test";

// SeatMap component tests in a real browser. Unlike playwright.config.ts (the
// backend-free e2e smoke suite that boots the built Next app), this mounts the
// real SeatMap into a static esbuild-bundled harness (globalSetup builds it) and
// loads it over file:// — no app server, no Next build. It exists because
// SeatMap runs live layout/de-collision measurement that never converges under
// jsdom; a real browser's layout does.

// Locally the sandbox ships a prebuilt Chromium; point at it with PW_CHROMIUM_PATH.
// In CI we `npx playwright install chromium`, so leave it unset and use the default.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    trace: "on-first-retry",
    launchOptions: executablePath ? { executablePath } : undefined
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
