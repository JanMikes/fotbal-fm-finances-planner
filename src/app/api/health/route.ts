import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { ensureListening, realtimeStatus } from "@/server/realtime/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** LISTEN may be down this long (reconnect with backoff) before the instance reports itself unhealthy. */
const LISTEN_GRACE_MS = 30_000;

/**
 * Liveness + readiness. No auth. Always answers within ~3 s.
 *   200 {ok:true, db:"ok", realtime:"listening"|"connecting"}
 *   503 {ok:false, db:"down"|"ok", realtime:…, error} when the DB does not answer, or LISTEN has been down > 30 s.
 */
export async function GET() {
  void ensureListening(); // starts the shared LISTEN connection on first use (non-blocking)
  const headers = { "Cache-Control": "no-store" };
  let dbOk = true;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      getDb().execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("db timeout")), 3000);
      }),
    ]).finally(() => clearTimeout(timer));
  } catch (err) {
    dbOk = false;
    console.error("[health] database check failed", (err as Error).message);
  }
  const rt = realtimeStatus();
  const realtime = rt.listening ? "listening" : rt.downForMs !== null && rt.downForMs > LISTEN_GRACE_MS ? "down" : "connecting";
  if (!dbOk) return Response.json({ ok: false, db: "down", realtime, error: "database unavailable" }, { status: 503, headers });
  if (realtime === "down") {
    return Response.json({ ok: false, db: "ok", realtime, error: "realtime LISTEN connection down" }, { status: 503, headers });
  }
  return Response.json({ ok: true, db: "ok", realtime }, { headers });
}
