import { getDb } from "@/server/db/client";
import { boardColumns } from "@/server/db/schema";
import { ctxFrom, json, parseBody, route } from "@/server/http";
import { createColumn, createColumnSchema } from "@/server/services/boards";
import { mapColumn } from "@/server/services/mappers";
import { asc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/columns?board=tasks|print */
export const GET = route(async (req) => {
  const board = new URL(req.url).searchParams.get("board");
  const q = getDb().select().from(boardColumns);
  const rows = await (board ? q.where(eq(boardColumns.boardId, board)) : q).orderBy(asc(boardColumns.boardId), asc(boardColumns.sortOrder));
  return json(rows.map(mapColumn));
});
export const POST = route(async (req) => json(await createColumn(await parseBody(req, createColumnSchema), ctxFrom(req)), 201));
