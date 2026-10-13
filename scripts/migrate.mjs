// Database migration runner.
//  - dev:    `npm run db:migrate` (node scripts/migrate.mjs, uses node_modules)
//  - image:  `node migrate.mjs` from /app (this file bundled by esbuild with drizzle-orm + pg inlined)
// Applies the SQL migrations in ./drizzle (or $MIGRATIONS_DIR) to $DATABASE_URL. Exits non-zero on failure.
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const LOCK_KEY = 727_001; // arbitrary app-wide advisory lock id (serialises concurrent runners)

export async function runMigrations({
  databaseUrl = process.env.DATABASE_URL,
  migrationsFolder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle"),
  log = console.log,
} = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    log(`[migrate] migrations applied from ${migrationsFolder}`);
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
    } catch {
      /* connection may already be broken */
    }
    await client.end();
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  runMigrations().then(
    () => process.exit(0),
    (err) => {
      console.error("[migrate] FAILED:", err);
      process.exit(1);
    },
  );
}
