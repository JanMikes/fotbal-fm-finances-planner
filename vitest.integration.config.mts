import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Integration tests: route handlers against a real Postgres ($DATABASE_URL, reset + migrated in globalSetup). */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: { TZ: "Europe/Prague" },
  },
});
