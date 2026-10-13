import { ctxFrom, json, parseBody, parseParam, route, zId } from "@/server/http";
import { movePrintItem, moveSchema } from "@/server/services/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>(async (req, p) =>
  json(await movePrintItem(parseParam(p.id, zId), await parseBody(req, moveSchema), ctxFrom(req))),
);
