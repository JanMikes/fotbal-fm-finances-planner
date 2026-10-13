import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests.
 *  - BASE_URL set (CI: the production image on http://127.0.0.1:3000) → test that server, no webServer.
 *  - BASE_URL unset → start `next dev` on :3100 (needs Postgres, e.g. `docker compose up -d postgres`).
 * Credentials come from APP_PASSWORD / APP_ACCESS_TOKEN (dev defaults: dev-password / dev-token).
 */
const external = !!process.env.BASE_URL;
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "cs-CZ",
    timezoneId: "Europe/Prague",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        command: "npx next dev -H 127.0.0.1 -p 3100",
        url: "http://127.0.0.1:3100/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://planner:planner@localhost:54329/planner",
          APP_PASSWORD: process.env.APP_PASSWORD ?? "dev-password",
          APP_ACCESS_TOKEN: process.env.APP_ACCESS_TOKEN ?? "dev-token",
          SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-session-secret-change-me-0000000000",
          UPLOAD_DIR: process.env.UPLOAD_DIR ?? "./data/uploads",
        },
      },
});
