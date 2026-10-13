import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + DB readiness. No auth. Always answers within ~3 s. */
export async function GET() {
  try {
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db timeout")), 3000)),
    ]);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[health] database check failed", (err as Error).message);
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
