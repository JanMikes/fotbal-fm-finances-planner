import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Cache = { pool?: pg.Pool; db?: Db };
const g = globalThis as typeof globalThis & { __fmpDb?: Cache };
const cache: Cache = (g.__fmpDb ??= {});

// Return DATE columns as plain "YYYY-MM-DD" strings (drizzle string mode does this too; this covers raw queries).
pg.types.setTypeParser(1082, (v) => v);

export function getPool(): pg.Pool {
  if (!cache.pool) {
    cache.pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
    cache.pool.on("error", (err) => console.error("[db] idle client error", err));
  }
  return cache.pool;
}

/** Lazily created drizzle instance (no connection is made at import/build time). */
export function getDb(): Db {
  if (!cache.db) cache.db = drizzle(getPool(), { schema });
  return cache.db;
}

/** Close the pool (tests / shutdown). */
export async function closeDb(): Promise<void> {
  const pool = cache.pool;
  cache.pool = undefined;
  cache.db = undefined;
  if (pool) await pool.end();
}
