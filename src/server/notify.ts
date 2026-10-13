import { sql } from "drizzle-orm";
import type { ChangeEvent } from "@/lib/types";
import type { DbOrTx } from "./db/client";
import type { Ctx } from "./http";

export const CHANNEL = "app_changes";

/** Queue a realtime notification; delivered by Postgres only when the surrounding transaction commits. */
export async function notify(tx: DbOrTx, ctx: Ctx, entity: ChangeEvent["entity"], op: ChangeEvent["op"], id: ChangeEvent["id"]): Promise<void> {
  const payload: ChangeEvent = { entity, op, id, clientId: ctx.clientId };
  await tx.execute(sql`select pg_notify(${CHANNEL}, ${JSON.stringify(payload)})`);
}
