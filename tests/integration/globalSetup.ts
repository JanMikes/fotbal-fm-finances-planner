/**
 * Integration test setup: resets the database at $DATABASE_URL (only when its name contains "test" or
 * INTEGRATION_ALLOW_RESET=1) and applies all migrations with the same runner used in production.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { runMigrations } from "../../scripts/migrate.mjs";

export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("test:integration needs DATABASE_URL pointing to an empty (test) Postgres database");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName) && process.env.INTEGRATION_ALLOW_RESET !== "1") {
    throw new Error(`Refusing to reset database "${dbName}" — use a database whose name contains "test" or set INTEGRATION_ALLOW_RESET=1`);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  // Start from a clean slate so the suite can be re-run against the same test database.
  await client.query("drop schema if exists drizzle cascade");
  await client.query("drop schema if exists public cascade");
  await client.query("create schema public");
  await client.end();
  await runMigrations({ databaseUrl: url, log: () => undefined });
  if (!process.env.UPLOAD_DIR) process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "fmp-uploads-"));
}
