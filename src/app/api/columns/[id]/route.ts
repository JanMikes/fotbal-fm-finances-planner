import { ctxFrom, json, parseBody, parseParam, route, zId } from "@/server/http";
import { deleteColumn, updateColumn, updateColumnSchema } from "@/server/services/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { id: string };
export const PATCH = route<P>(async (req, p) =>
  json(await updateColumn(parseParam(p.id, zId), await parseBody(req, updateColumnSchema), ctxFrom(req))),
);
export const DELETE = route<P>(async (req, p) => json({ ok: true, ...(await deleteColumn(parseParam(p.id, zId), ctxFrom(req))) }));
